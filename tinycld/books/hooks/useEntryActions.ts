import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { router } from 'expo-router'

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

    const deleteDraft = async () => {
        await deleteDraftMutation.mutateAsync()
        // Popping back to the list the draft was opened from keeps one copy of it in the
        // stack; with no history (a deep link, a reload) the list replaces the draft.
        if (router.canGoBack()) router.back()
        else router.replace(orgHref('books/entries'))
    }

    return { deleteDraft, isPending: deleteDraftMutation.isPending }
}
