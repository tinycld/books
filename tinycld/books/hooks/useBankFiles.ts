import { coalesce, eq, sum } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import type { LiveRecovery } from '../lib/live-recovery'

// The files of one connection, newest upload first, with the uploader's name and the
// number of transactions their imports added. The imports are summed to one row per
// file before the left join, so the join cannot duplicate a file. With no connection
// ("") the query is disabled.
export function useBankFiles(connectionId: string) {
    const [filesCollection, usersCollection, importsCollection] = useStore(
        'books_bank_files',
        'users',
        'books_bank_imports'
    )
    const query = useLiveQuery({
        query: q => {
            if (!connectionId) return undefined
            const totals = q
                .from({ imp: importsCollection })
                .groupBy(({ imp }) => imp.file)
                .select(({ imp }) => ({ file: imp.file, imported: sum(imp.imported) }))
            return q
                .from({ file: filesCollection })
                .where(({ file }) => eq(file.connection, connectionId))
                .leftJoin({ totals }, ({ file, totals }) => eq(file.id, totals.file))
                .orderBy(({ file }) => file.created, 'desc')
                .select(({ file, totals }) => ({
                    ...file,
                    importedCount: coalesce(totals?.imported, 0),
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
            ? {
                  queries: [query.collection],
                  sources: [filesCollection, usersCollection, importsCollection],
              }
            : { queries: [], sources: [] }
    return { files, isReady, isError: query.isError, recovery }
}

export type BankFileItem = ReturnType<typeof useBankFiles>['files'][number]
