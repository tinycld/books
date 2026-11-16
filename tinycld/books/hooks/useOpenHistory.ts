import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { historyHref } from '../lib/history-route'

// More → Audit history: pushes the record's history as its own screen, so Back returns to
// the record (spec §3 "Entry points").
export function useOpenHistory(collection: string, id: string): () => void {
    const orgHref = useOrgHref()
    return () => router.push(orgHref(historyHref(collection, id)))
}
