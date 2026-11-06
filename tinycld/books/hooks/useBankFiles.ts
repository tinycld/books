import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import type { LiveRecovery } from '../lib/report-definition'

// The files of one connection, newest upload first, with the uploader's name. With no
// connection ("") the query is disabled.
export function useBankFiles(connectionId: string) {
    const [filesCollection, usersCollection] = useStore('books_bank_files', 'users')
    const query = useLiveQuery({
        query: q => {
            if (!connectionId) return undefined
            return q
                .from({ file: filesCollection })
                .where(({ file }) => eq(file.connection, connectionId))
                .orderBy(({ file }) => file.created, 'desc')
                .select(({ file }) => ({
                    ...file,
                    uploadedBy: materialize(
                        q
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, file.uploaded_by))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.banking.files', connectionId],
    })
    const files = (query.data ?? []).map(({ uploadedBy, ...file }) => ({
        ...file,
        uploadedByName: uploadedBy?.name ?? '',
    }))
    // A disabled query reports ready, so the id is checked as well as `isEnabled`.
    const isReady = !connectionId || (query.isEnabled && query.isReady)
    const recovery: LiveRecovery =
        query.isError && query.collection
            ? { queries: [query.collection], sources: [filesCollection, usersCollection] }
            : { queries: [], sources: [] }
    return { files, isReady, isError: query.isError, recovery }
}

export type BankFileItem = ReturnType<typeof useBankFiles>['files'][number]
