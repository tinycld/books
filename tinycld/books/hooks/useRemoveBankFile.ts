import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRef, useState } from 'react'
import { writeRefusalText } from '../lib/refusal'

// Deletes one uploaded file. The server allows it only while the file's status is
// `uploaded`; a refusal is local, because the open dialog is its only reader.
export function useRemoveBankFile({ fileId, onDone }: { fileId: string; onDone(): void }) {
    const [files] = useStore('books_bank_files')
    const [refusal, setRefusal] = useState<string | null>(null)
    const inFlight = useRef(false)
    const mutation = useMutation({
        mutationFn: function* () {
            yield files.delete(fileId)
        },
        onSuccess: () => {
            inFlight.current = false
            onDone()
        },
        // A supplied onError replaces core's default report, so the failure is logged here.
        onError: error => {
            inFlight.current = false
            log.error('books.banking', error, { fileId })
            setRefusal(writeRefusalText(error))
        },
    })
    const confirm = () => {
        if (inFlight.current) return
        inFlight.current = true
        setRefusal(null)
        mutation.mutate()
    }
    return { confirm, isPending: mutation.isPending, refusal }
}
