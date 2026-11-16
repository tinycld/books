import type { DocumentMoreItem } from '../components/documents/DocumentActionBar'
import { useBooksAccess } from './useBooksAccess'
import { useOpenHistory } from './useOpenHistory'

// More → Audit history for a Books reader (audit-log spec §3 "Entry points"), test id
// `<screen>-read-history`. While the access read loads there is no item, so More shows
// only for the other actions; a failed access read is the screen's own error state.
export function useHistoryItem(collection: string, id: string): DocumentMoreItem | null {
    const { canRead } = useBooksAccess()
    const openHistory = useOpenHistory(collection, id)
    if (!canRead) return null
    return {
        id: 'read-history',
        label: 'Audit history',
        keys: '',
        isDisabled: false,
        onSelect: openHistory,
    }
}
