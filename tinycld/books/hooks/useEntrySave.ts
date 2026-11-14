import { atomic, performMutations, useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { newRecordId } from 'pbtsdb/core'
import { useRef } from 'react'
import {
    dropBlankLines,
    type EntryFormLine,
    isBlankLine,
    parseAmountText,
    planLineWrites,
} from '../lib/entry-lines'
import type { EntryFormValues } from '../lib/entry-schema'
import { assertRevisionSeen } from '../lib/revision'
import type { BooksJournalEntries } from '../types'

interface EntrySaveProps {
    entryId: string | null
    // The revision the form loaded with its values; 0 for a new entry.
    revision: number
    saved: readonly EntryFormLine[]
    replaces?: string
    currency: string
    docType?: BooksJournalEntries['doc_type']
    // Called once the draft is saved, before a new entry's post, so the form can take
    // the saved draft as its baseline even when the post is then refused.
    onDraftSaved?: (values: EntryFormValues) => void
}

type SaveVariables = { values: EntryFormValues; mode: 'draft' | 'post' }

// The draft as this form last saved it. `revision` is what the next write states it
// saw; it is the form's own count, never read from the live row, which another
// editor's save updates under the form.
type Baseline = {
    entryId: string | null
    revision: number
    saved: EntryFormLine[]
    // Id of the line this hook created for each form index. The form can send such a
    // line with a blank id again (a save does not always put the id back), and it must
    // then be found, not inserted a second time.
    created: Map<number, string>
}

// The form's lines with the ids the save wrote. Blank lines were not saved and stay blank.
function withWrittenIds(values: EntryFormValues, writtenIds: readonly string[]) {
    let next = 0
    return {
        ...values,
        lines: values.lines.map(line => {
            if (isBlankLine(line)) return line
            const id = writtenIds[next] || line.id
            next += 1
            return { ...line, id }
        }),
    }
}

// A save is one batch: the line writes, then the entry with its header, the revision
// and, for a post, the status. The server saves all of it or none, and refuses it when
// the draft changed after this form loaded it. A new entry cannot be created and posted
// in one batch (the post would merge into the create, which must be a draft), so it is
// created as a draft with its lines, then posted.
export function useEntrySave({
    entryId,
    revision,
    saved,
    replaces,
    currency,
    docType = 'journal',
    onDraftSaved,
}: EntrySaveProps) {
    const [entriesCollection, linesCollection] = useStore(
        'books_journal_entries',
        'books_journal_lines'
    )
    const baseline = useRef<Baseline>({
        entryId,
        revision,
        saved: [...saved],
        created: new Map(),
    })
    const inFlight = useRef<{ mode: SaveVariables['mode']; promise: Promise<string> } | null>(null)

    const mutation = useMutation({
        mutationFn: async ({ values, mode }: SaveVariables) => {
            const typed = dropBlankLines(values.lines)
            const cents = (text: string) => parseAmountText(text, currency) ?? 0
            const header = {
                date: values.date,
                memo: values.memo,
                auto_reverse_on: values.autoReverseOn,
            }
            const base = baseline.current
            const isNew = base.entryId === null
            const id = base.entryId ?? newRecordId()
            if (!isNew) assertRevisionSeen(entriesCollection.get(id)?.revision, base.revision)
            // Every line has its id before the write. A blank line takes the id this
            // hook created for its position, unless the form carries that id elsewhere.
            const carried = new Set(typed.map(line => line.id).filter(Boolean))
            const created = new Map<number, string>()
            const lines = typed.map((line, index) => {
                if (line.id) return line
                const earlier = base.created.get(index)
                const id = earlier && !carried.has(earlier) ? earlier : newRecordId()
                created.set(index, id)
                return { ...line, id }
            })
            const positionOf = new Map(lines.map((line, index) => [line.id, index]))
            const lineFields = (line: EntryFormLine) => ({
                entry: id,
                account: line.account,
                debit: cents(line.debit),
                credit: cents(line.credit),
                memo: line.memo,
                customer: line.customer,
                vendor: line.vendor,
                position: positionOf.get(line.id) ?? 0,
            })
            const plan = planLineWrites(base.saved, lines)
            // A new entry is a draft first; an existing draft can post in its save.
            const postsInSave = mode === 'post' && !isNew
            const sent = isNew ? 1 : base.revision + 1

            await atomic(() => {
                if (isNew) {
                    entriesCollection.insert({
                        id,
                        ...header,
                        status: 'draft',
                        doc_type: docType,
                        origin: 'manual',
                        reverses: '',
                        replaces: replaces ?? '',
                    })
                }
                for (const line of plan.updates) {
                    linesCollection.update(line.id, draft => {
                        Object.assign(draft, lineFields(line))
                    })
                }
                for (const line of plan.inserts) {
                    linesCollection.insert({ id: line.id, ...lineFields(line) })
                }
                for (const lineId of plan.deletes) linesCollection.delete(lineId)
                // Last, and once: the batch sends one operation for the entry, at the
                // place of its first mutation, and the server reads the lines when it
                // posts.
                if (!isNew) {
                    entriesCollection.update(id, draft => {
                        Object.assign(draft, header)
                        draft.revision = sent
                        if (postsInSave) draft.status = 'posted'
                    })
                }
            })
            baseline.current = { entryId: id, revision: sent, saved: lines, created }
            onDraftSaved?.(
                withWrittenIds(
                    values,
                    lines.map(line => line.id)
                )
            )

            if (mode === 'post' && isNew) {
                await performMutations(function* () {
                    yield entriesCollection.update(id, draft => {
                        draft.status = 'posted'
                        draft.revision = sent + 1
                    })
                })
                baseline.current = { entryId: id, revision: sent + 1, saved: lines, created }
            }
            return id
        },
        // The caller awaits the rejection and puts the refusal on its form.
        onError: () => {},
    })

    // A same-mode call while one is in flight gets that call's result, so a double click
    // cannot write the entry twice. A different mode waits for the running save, then runs,
    // so a post issued during a draft save still ends posted.
    const run = (variables: SaveVariables): Promise<string> => {
        const running = inFlight.current
        if (running?.mode === variables.mode) return running.promise
        const start = () => mutation.mutateAsync(variables)
        const promise: Promise<string> = (
            running ? running.promise.then(start, start) : start()
        ).finally(() => {
            if (inFlight.current?.promise === promise) inFlight.current = null
        })
        inFlight.current = { mode: variables.mode, promise }
        return promise
    }

    return {
        saveDraft: (values: EntryFormValues) => run({ values, mode: 'draft' }),
        post: (values: EntryFormValues) => run({ values, mode: 'post' }),
        isPending: mutation.isPending,
    }
}
