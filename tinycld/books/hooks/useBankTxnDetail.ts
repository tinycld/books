import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { materialize } from 'pbtsdb'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

function useTxnDetailQuery(txnId: string | null) {
    const [txns, files, imports, users] = useStore(
        'books_bank_transactions',
        'books_bank_files',
        'books_bank_imports',
        'users'
    )
    const query = useLiveQuery({
        query: q => {
            if (!txnId) return undefined
            return q
                .from({ txn: txns })
                .where(({ txn }) => eq(txn.id, txnId))
                .select(({ txn }) => ({
                    id: txn.id,
                    status: txn.status,
                    amount: txn.amount,
                    date: txn.date,
                    description: txn.description,
                    memo: txn.memo,
                    checkNumber: txn.check_number,
                    line: txn.line,
                    file: materialize(
                        q
                            .from({ file: files })
                            .where(({ file }) => eq(file.id, txn.file))
                            .select(({ file }) => ({ name: file.name }))
                            .findOne()
                    ),
                    imported: materialize(
                        q
                            .from({ imp: imports })
                            .where(({ imp }) => eq(imp.id, txn.bank_import))
                            .select(({ imp }) => ({
                                created: imp.created,
                                importer: materialize(
                                    q
                                        .from({ u: users })
                                        .where(({ u }) => eq(u.id, imp.created_by))
                                        .findOne()
                                ),
                            }))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.review.txn', txnId],
    })
    return { query, sources: [txns, files, imports, users] }
}

type TxnDetailRow = NonNullable<ReturnType<typeof useTxnDetailQuery>['query']['data']>

// The facts the drawer shows, flattened from the query's row.
function flatten(row: TxnDetailRow, accountLabel: string) {
    return {
        id: row.id,
        status: row.status,
        amount: row.amount,
        date: row.date,
        description: row.description,
        memo: row.memo,
        checkNumber: row.checkNumber,
        accountLabel,
        fileName: row.file?.name ?? '',
        line: row.line,
        importedAt: row.imported?.created ?? '',
        importerName: row.imported?.importer?.name ?? '',
    }
}

export type BankTxnDetail = ReturnType<typeof flatten>

// The drawer's transaction by id, with its file's name, its import's day and the
// importer's name, in one query (materialize, so a missing file or import keeps the row).
// Disabled while no transaction is open. The account label comes from the tab, which
// already shows the connection.
export function useBankTxnDetail(txnId: string | null, accountLabel: string) {
    const { query, sources } = useTxnDetailQuery(txnId)
    const isOpen = txnId !== null
    const row = isOpen && query.isReady ? query.data : undefined
    const detail = row ? flatten(row, accountLabel) : null
    // A transaction of the tab always exists while it is listed, so a ready query with no
    // row is a failed load too, shown with Retry.
    const isMissing = isOpen && query.isReady && !query.data
    const isError = (isOpen && query.isError) || isMissing
    const recovery: LiveRecovery =
        isError && query.collection ? { queries: [query.collection], sources } : NO_RECOVERY
    return {
        detail,
        isLoading: isOpen && !query.isReady && !query.isError,
        isError,
        recovery,
    }
}
