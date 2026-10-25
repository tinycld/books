import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { performMutations, useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { router } from 'expo-router'
import { newRecordId } from 'pbtsdb/core'
import type { ReverseValues } from '../lib/entry-schema'

export function useEntryActions(entryId: string) {
    const [entriesCollection, linesCollection] = useStore(
        'books_journal_entries',
        'books_journal_lines'
    )
    const orgHref = useOrgHref()
    const { data: lines = [] } = useLiveQuery({
        query: query =>
            query.from({ line: linesCollection }).where(({ line }) => eq(line.entry, entryId)),
        queryKey: ['books.entry.actions.lines', entryId],
    })

    // One write at a time: a refusal part way stops there, and a retry deletes what is left.
    const deleteDraftMutation = useMutation({
        mutationFn: function* () {
            for (const line of lines) yield linesCollection.delete(line.id)
            yield entriesCollection.delete(entryId)
        },
    })

    // The reversal's lines are written by the server when the post succeeds. A refused post
    // leaves a draft with no lines behind, so it is deleted before the refusal is rethrown.
    const reverseMutation = useMutation({
        mutationFn: async (values: ReverseValues) => {
            const id = newRecordId()
            await performMutations(function* () {
                yield entriesCollection.insert({
                    id,
                    date: values.date,
                    memo: values.memo,
                    status: 'draft',
                    doc_type: 'journal',
                    origin: 'reversal',
                    reverses: entryId,
                    replaces: '',
                    auto_reverse_on: '',
                })
            })
            try {
                await performMutations(function* () {
                    yield entriesCollection.update(id, draft => {
                        draft.status = 'posted'
                    })
                })
            } catch (error) {
                try {
                    await performMutations(function* () {
                        yield entriesCollection.delete(id)
                    })
                } catch (cleanupError) {
                    log.warn('books.entries', 'reversal draft cleanup refused', {
                        id,
                        message: errorToString(cleanupError),
                    })
                }
                throw error
            }
            return id
        },
        // The dialog awaits the rejection and shows it.
        onError: () => {},
    })

    const voidMutation = useMutation({
        mutationFn: function* () {
            yield entriesCollection.update(entryId, draft => {
                draft.status = 'void'
            })
        },
        onError: () => {},
    })

    const deleteDraft = async () => {
        await deleteDraftMutation.mutateAsync()
        // Popping back to the list the draft was opened from keeps one copy of it in the
        // stack; with no history (a deep link, a reload) the list replaces the draft.
        if (router.canGoBack()) router.back()
        else router.replace(orgHref('books/entries'))
    }

    return {
        deleteDraft,
        reverse: (values: ReverseValues) => reverseMutation.mutateAsync(values),
        voidEntry: () => voidMutation.mutateAsync(),
        isPending: deleteDraftMutation.isPending,
        isReversing: reverseMutation.isPending,
        isVoiding: voidMutation.isPending,
    }
}
