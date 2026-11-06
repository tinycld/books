import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { evictRows } from '@tinycld/core/lib/server-rows'
import { useRef, useState } from 'react'
import { writeRefusalText } from '../lib/refusal'
import type { BankConnectionRow } from './useBankConnections'

// Deletes the connection; PocketBase deletes its files by cascade, so their rows are
// evicted from the store here. The refusal is local: the open dialog is its only reader
// and it goes away with the dialog.
export function useDisconnectConnection({
    connection,
    fileIds,
    onDone,
}: {
    connection: BankConnectionRow
    fileIds: readonly string[]
    onDone(): void
}) {
    const [connections, files] = useStore('books_bank_connections', 'books_bank_files')
    const [refusal, setRefusal] = useState<string | null>(null)
    const inFlight = useRef(false)
    // The file ids travel as the mutation's variables: once the optimistic delete lands,
    // the page selects another connection and the caller's `fileIds` become its files.
    const mutation = useMutation({
        mutationFn: function* (_ids: readonly string[]) {
            yield connections.delete(connection.id)
        },
        onSuccess: (_result, ids) => {
            inFlight.current = false
            evictRows(files, ids, 'books.banking.disconnect')
            onDone()
        },
        // A supplied onError replaces core's default report, so the failure is logged here.
        onError: error => {
            inFlight.current = false
            log.error('books.banking', error, { connectionId: connection.id })
            setRefusal(writeRefusalText(error))
        },
    })
    const confirm = () => {
        if (inFlight.current) return
        inFlight.current = true
        setRefusal(null)
        mutation.mutate(fileIds)
    }
    return { confirm, isPending: mutation.isPending, refusal }
}
