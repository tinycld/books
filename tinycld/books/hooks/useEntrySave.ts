import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { newRecordId } from 'pbtsdb/core'
import { useRef } from 'react'
import {
    dropBlankLines,
    type EntryFormLine,
    parseAmountText,
    planLineWrites,
} from '../lib/entry-lines'
import type { EntryFormValues } from '../lib/entry-schema'

interface EntrySaveProps {
    entryId: string | null
    saved: readonly EntryFormLine[]
    replaces?: string
    currency: string
    // Called once the entry and every line are written, before a post sets the status, so
    // the form can take the saved draft as its baseline even when the post is then refused.
    onDraftSaved?: (values: EntryFormValues) => void
}

type SaveVariables = { values: EntryFormValues; mode: 'draft' | 'post' }

type Stored = {
    entryId: string | null
    saved: EntryFormLine[]
    // Id of the line written for each non-blank form index. The form sends a new line with a
    // blank id every time, so a retry finds the row it already wrote through its position.
    assigned: Map<number, string>
}

const emptyStored = (): Stored => ({ entryId: null, saved: [], assigned: new Map() })

// The save is not atomic (entry, then lines, then status), so a refusal part way leaves
// rows behind. `stored` remembers what was written, for a new entry and for an existing
// draft alike (its `saved` prop stays stale until the live query catches up), so the next
// save updates those rows instead of inserting them again.
export function useEntrySave({ entryId, saved, replaces, currency, onDraftSaved }: EntrySaveProps) {
    const [entriesCollection, linesCollection] = useStore(
        'books_journal_entries',
        'books_journal_lines'
    )
    const stored = useRef<Stored>(emptyStored())
    // What the last completed save wrote, so a post chained behind a draft updates that entry.
    const finished = useRef<Stored | null>(null)
    const inFlight = useRef<{ mode: SaveVariables['mode']; promise: Promise<string> } | null>(null)

    const mutation = useMutation({
        mutationFn: function* ({ values, mode }: SaveVariables) {
            const typed = dropBlankLines(values.lines)
            const cents = (text: string) => parseAmountText(text, currency) ?? 0
            const fields = {
                date: values.date,
                memo: values.memo,
                auto_reverse_on: values.autoReverseOn,
            }
            const isResumable =
                stored.current.entryId !== null &&
                (entryId === null || stored.current.entryId === entryId)
            const work: Stored = isResumable
                ? stored.current
                : { entryId, saved: [...saved], assigned: new Map() }
            stored.current = work

            const lines = typed.map((line, index) => ({
                ...line,
                id: line.id || work.assigned.get(index) || '',
            }))
            const lineFields = (line: EntryFormLine) => ({
                entry: id,
                account: line.account,
                debit: cents(line.debit),
                credit: cents(line.credit),
                memo: line.memo,
                position: lines.indexOf(line),
            })

            let id = work.entryId ?? ''
            if (work.entryId === null) {
                id = newRecordId()
                yield entriesCollection.insert({
                    id,
                    ...fields,
                    status: 'draft',
                    doc_type: 'journal',
                    origin: 'manual',
                    reverses: '',
                    replaces: replaces ?? '',
                })
                work.entryId = id
            } else {
                yield entriesCollection.update(id, draft => {
                    Object.assign(draft, fields)
                })
            }

            const plan = planLineWrites(work.saved, lines)
            const updates = plan.updates.map(line =>
                linesCollection.update(line.id, draft => {
                    Object.assign(draft, lineFields(line))
                })
            )
            if (updates.length > 0) {
                yield updates
                const updated = new Map(plan.updates.map(line => [line.id, line]))
                work.saved = work.saved.map(line => updated.get(line.id) ?? line)
            }
            for (const line of plan.inserts) {
                const lineId = line.id || newRecordId()
                yield linesCollection.insert({ id: lineId, ...lineFields(line) })
                work.saved.push({ ...line, id: lineId })
                work.assigned.set(lines.indexOf(line), lineId)
            }
            if (plan.deletes.length > 0) {
                yield plan.deletes.map(lineId => linesCollection.delete(lineId))
                const gone = new Set(plan.deletes)
                work.saved = work.saved.filter(line => !gone.has(line.id))
                for (const [index, lineId] of work.assigned) {
                    if (gone.has(lineId)) work.assigned.delete(index)
                }
            }
            onDraftSaved?.(values)

            if (mode === 'post') {
                yield entriesCollection.update(id, draft => {
                    draft.status = 'posted'
                })
            }
            finished.current = work
            stored.current = emptyStored()
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
        if (!running) finished.current = null
        if (running?.mode === variables.mode) return running.promise
        const start = () => mutation.mutateAsync(variables)
        const startAfter = () => {
            if (finished.current) stored.current = finished.current
            return start()
        }
        const promise: Promise<string> = (
            running ? running.promise.then(startAfter, start) : start()
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
