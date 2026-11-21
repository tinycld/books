import { useQuery } from '@tanstack/react-query'
import { fetchEmailStatus } from '@tinycld/core/reports/lib/export-client'

// The answer is a server setting: read it again after five minutes at most.
const EMAIL_STATUS_STALE_MS = 5 * 60 * 1000

/**
 * Whether the server can send email (core `fetchEmailStatus()`, statements spec §3.4, §4.1).
 * While it loads, `canSend` is false and `isLoading` true; a failed read counts as
 * `canSend: false`, so Save and send and Send… stay disabled when the status is unknown.
 */
export function useEmailStatus(): { canSend: boolean; isLoading: boolean } {
    const query = useQuery({
        queryKey: ['books', 'email-status'],
        queryFn: fetchEmailStatus,
        staleTime: EMAIL_STATUS_STALE_MS,
        retry: false,
    })
    return { canSend: query.data?.canSend === true, isLoading: query.isPending }
}
