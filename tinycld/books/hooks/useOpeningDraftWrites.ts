import { log } from '@tinycld/core/lib/logger'
import { performMutations } from '@tinycld/core/lib/mutations'
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

type MutationRun = Parameters<typeof performMutations>[0]

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

export function useOpeningDraftWrites(screen: OpeningScreen) {
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
        const savedAccounts = new Map(screen.savedLines.map(line => [line.id, line.account]))
        const positions = new Map(nextLines.map((line, index) => [line, index]))
        // The account whose line is being written, so a refusal can be attributed to it.
        let writing: string | null = null
        const write = async (run: MutationRun) => {
            try {
                await performMutations(run)
            } catch (error) {
                throw writing === null ? error : new LineWriteError(writing, error)
            }
        }
        const target = (account: string | undefined) => {
            writing = account !== undefined && typedAccounts.has(account) ? account : null
        }

        if (draft) {
            const diff = diffLines(screen.savedLines, nextLines)
            await write(function* () {
                yield entriesCollection.update(draft.id, d => {
                    d.date = values.date
                    d.memo = memo
                })
                for (const line of diff.update) {
                    target(savedAccounts.get(line.id))
                    yield linesCollection.update(line.id, d => {
                        d.debit = line.debit
                        d.credit = line.credit
                        d.position = line.position
                    })
                }
                for (const line of diff.insert) {
                    target(line.account)
                    yield linesCollection.insert({
                        id: newRecordId(),
                        entry: draft.id,
                        ...line,
                        memo: '',
                        position: positions.get(line) ?? 0,
                    })
                }
                writing = null
                for (const id of diff.remove) yield linesCollection.delete(id)
            })
            return draft.id
        }

        const entryId = newRecordId()
        const replaces = screen.state.kind === 'replace' ? screen.state.entry.id : ''
        await write(function* () {
            yield entriesCollection.insert({
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
            for (const [position, line] of nextLines.entries()) {
                target(line.account)
                yield linesCollection.insert({
                    id: newRecordId(),
                    entry: entryId,
                    ...line,
                    memo: '',
                    position,
                })
            }
        })
        return entryId
    }

    const postEntry = async (entryId: string) => {
        await performMutations(function* () {
            yield entriesCollection.update(entryId, d => {
                d.status = 'posted'
            })
        })
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
