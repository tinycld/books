import { log } from '@tinycld/core/lib/logger'
import { atomic, performMutations } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { newRecordId } from 'pbtsdb/core'
import {
    buildOpening,
    centsFromAmounts,
    diffLines,
    effectiveMemo,
    findOpeningEquityAccount,
    OPENING_BALANCE_EQUITY_NAME,
    type OpeningBuild,
    type OpeningLine,
} from '../lib/opening-balances'
import type { OpeningFormValues } from '../lib/opening-balances-schema'
import { chunkOps } from '../lib/revision'
import type { OpeningScreen } from './useOpeningBalancesScreen'

function balancingLine(build: OpeningBuild, accountId: string): OpeningLine[] {
    if (!build.balancing) return []
    const { side, amount } = build.balancing
    return [
        {
            account: accountId,
            debit: side === 'debit' ? amount : 0,
            credit: side === 'credit' ? amount : 0,
        },
    ]
}

// A refusal of one account's line, so the form can show it under that account's
// amount. The original error stays the cause.
export class LineWriteError extends Error {
    constructor(
        readonly accountId: string,
        readonly cause: unknown
    ) {
        super('Opening balance line refused')
    }
}

// The draft the form is saving into, if there is one. A posted entry that is
// being replaced is not a draft: its lines are never diffed or touched.
function draftOf(screen: OpeningScreen) {
    return screen.state.kind === 'draft' ? screen.state.entry : null
}

// The line a refused batch names, when the refusal is of a line.
function refusedLineId(error: unknown): string | null {
    if (typeof error !== 'object' || error === null) return null
    if (!('collection' in error) || error.collection !== 'books_journal_lines') return null
    return 'recordId' in error && typeof error.recordId === 'string' ? error.recordId : null
}

// `baseline.current` is the revision of the draft the form was seeded from (0 with no
// draft). Each write states it as the next value and moves it on, so the server
// refuses a save or a post of a draft that another session changed in between.
export function useOpeningDraftWrites(screen: OpeningScreen, baseline: { current: number }) {
    const [accountsCollection, entriesCollection, linesCollection] = useStore(
        'books_accounts',
        'books_journal_entries',
        'books_journal_lines'
    )

    // Opening Balance Equity is created by the first save that needs it. A refusal
    // may mean another session created it first (PocketBase reports a unique-index
    // violation as a plain 400 with no field), so the accounts are re-read before
    // the refusal is believed.
    const balancingAccountId = async (): Promise<string> => {
        if (screen.equityAccount) return screen.equityAccount.id
        const newId = newRecordId()
        try {
            await performMutations(function* () {
                yield accountsCollection.insert({
                    id: newId,
                    name: OPENING_BALANCE_EQUITY_NAME,
                    number: '',
                    description: '',
                    parent: '',
                    type: 'equity',
                    detail_type: 'opening_balance_equity',
                    inactive: false,
                    form_1099_box: '',
                })
            })
        } catch (error) {
            // A failed re-read must not hide the refusal that sent us here.
            try {
                await accountsCollection.reload()
            } catch (reloadError) {
                log.error('books.opening-balances', reloadError)
                throw error
            }
            const found = findOpeningEquityAccount(accountsCollection.toArray)
            if (!found) throw error
            return found.id
        }
        return newId
    }

    // Resolves to the id of the entry the lines were saved into.
    const saveDraft = async (values: OpeningFormValues): Promise<string> => {
        const build = buildOpening(screen.accounts, centsFromAmounts(values.amounts))
        const lineAccount = build.balancing ? await balancingAccountId() : ''
        const nextLines = [...build.lines, ...balancingLine(build, lineAccount)]
        const memo = effectiveMemo(values.memo, values.date)
        const draft = draftOf(screen)

        // Lines the person typed an amount for have an input to show a refusal under;
        // the balancing line has none.
        const typedAccounts = new Set(build.lines.map(line => line.account))
        // The account of every line a batch writes, so a refusal can be attributed to it.
        const accountOfLine = new Map(screen.savedLines.map(line => [line.id, line.account]))
        const positions = new Map(nextLines.map((line, index) => [line, index]))
        const write = async (run: () => Promise<void>) => {
            try {
                await run()
            } catch (error) {
                const account = accountOfLine.get(refusedLineId(error) ?? '')
                if (account === undefined || !typedAccounts.has(account)) throw error
                throw new LineWriteError(account, error)
            }
        }
        const insertLine = (entry: string, line: OpeningLine, position: number) => {
            const id = newRecordId()
            accountOfLine.set(id, line.account)
            return () => {
                linesCollection.insert({
                    id,
                    entry,
                    ...line,
                    memo: '',
                    customer: '',
                    vendor: '',
                    position,
                })
            }
        }

        if (draft) {
            const diff = diffLines(screen.savedLines, nextLines)
            const lineWrites: (() => void)[] = [
                ...diff.update.map(line => () => {
                    linesCollection.update(line.id, d => {
                        d.debit = line.debit
                        d.credit = line.credit
                        d.position = line.position
                    })
                }),
                ...diff.insert.map(line => insertLine(draft.id, line, positions.get(line) ?? 0)),
                ...diff.remove.map(id => () => {
                    linesCollection.delete(id)
                }),
            ]
            // One batch holds a limited count of writes. Each part is saved whole or
            // not at all, and each states the revision the part before it left.
            for (const part of chunkOps(lineWrites)) {
                const sent = baseline.current + 1
                await write(() =>
                    atomic(() => {
                        for (const lineWrite of part) lineWrite()
                        // Last: the batch sends one write for the entry, after its lines.
                        entriesCollection.update(draft.id, d => {
                            d.date = values.date
                            d.memo = memo
                            d.revision = sent
                        })
                    })
                )
                baseline.current = sent
            }
            return draft.id
        }

        const entryId = newRecordId()
        const replaces = screen.state.kind === 'replace' ? screen.state.entry.id : ''
        const lineWrites = nextLines.map((line, position) => insertLine(entryId, line, position))
        await write(() =>
            atomic(() => {
                entriesCollection.insert({
                    id: entryId,
                    date: values.date,
                    memo,
                    status: 'draft',
                    origin: 'opening_balance',
                    doc_type: 'journal',
                    replaces,
                    reverses: '',
                    auto_reverse_on: '',
                })
                for (const lineWrite of lineWrites) lineWrite()
            })
        )
        // A new entry and its lines are one change: the server starts it at 1.
        baseline.current = 1
        return entryId
    }

    const postEntry = async (entryId: string) => {
        const sent = baseline.current + 1
        await performMutations(function* () {
            yield entriesCollection.update(entryId, d => {
                d.status = 'posted'
                d.revision = sent
            })
        })
        baseline.current = sent
    }

    const discardDraft = async () => {
        const draft = draftOf(screen)
        if (!draft) return
        await performMutations(function* () {
            yield entriesCollection.delete(draft.id)
        })
    }

    return { saveDraft, postEntry, discardDraft }
}
