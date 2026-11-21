import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import { Text } from 'react-native'
import { addedResultText } from '../../../lib/bank-categorize'
import { useBankingUIStore } from '../../../stores/banking-ui-store'

// The categorization the last drawer Categorize or Record transfer created, with its
// posted entry. The server stamps the entry in the create's own transaction, so the row
// names it once the insert has settled.
function useAddedEntry(categorizationId: string | null) {
    const [categorizations, entries] = useStore(
        'books_bank_categorizations',
        'books_journal_entries'
    )
    const query = useLiveQuery({
        query: q => {
            if (!categorizationId) return null
            return q
                .from({ c: categorizations })
                .where(({ c }) => eq(c.id, categorizationId))
                .select(({ c }) => ({
                    id: c.id,
                    entry: materialize(
                        q
                            .from({ e: entries })
                            .where(({ e }) => eq(e.id, c.entry))
                            .select(({ e }) => ({
                                number: e.number,
                                doc_type: e.doc_type,
                                origin: e.origin,
                            }))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.categorize.added-note', categorizationId],
    })
    return query.data?.entry
}

// "Added Journal entry 1042." / "Added Transfer 1008." under the toolbar, in the place of
// the batch's result line, after a drawer Categorize or Record transfer. It draws nothing
// until the entry is read: the drawer has already moved on to the next row.
export function AddedResultLine() {
    const note = useBankingUIStore(s => s.addedNote)
    const entry = useAddedEntry(note?.id ?? null)
    const text = addedResultText(entry)
    if (!text) return null
    return (
        <Text
            testID="bank-review-result"
            accessibilityLiveRegion="polite"
            className="pb-2 text-sm text-muted-foreground"
        >
            {text}
        </Text>
    )
}
