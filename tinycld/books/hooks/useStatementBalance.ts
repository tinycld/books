import { eq, not } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRef } from 'react'
import { statementBalance } from '../lib/bank-import-view'

// The balance of a connection's latest bank statement (`{ cents, day, fileName }`): its file
// with the latest statement date, then the newest upload. A CSV file has no statement date,
// so it never counts. The statement is extra to what its readers show (the Banking card's
// line, the reconcile start dialog's prefill), so while it loads or after a load error they
// show none; the error is logged once per failure, so it is not silent.
export function useStatementBalance(connectionId: string, accountType: string) {
    const [filesCollection] = useStore('books_bank_files')
    const query = useLiveQuery({
        query: q =>
            q
                .from({ file: filesCollection })
                .where(({ file }) => eq(file.connection, connectionId))
                .where(({ file }) => not(eq(file.statement_date, '')))
                .orderBy(({ file }) => file.statement_date, 'desc')
                .orderBy(({ file }) => file.created, 'desc')
                .limit(1)
                .findOne(),
        queryKey: ['books.banking.statement', connectionId],
    })
    const logged = useRef(false)
    if (query.isError && !logged.current) {
        logged.current = true
        log.warn('books.banking', 'statement balance load failed', { connectionId })
    }
    if (!query.isError) logged.current = false
    const statement = query.isError ? null : statementBalance(query.data, accountType)
    // isReady: the start dialog waits for it before it mounts its form with the prefill.
    return { statement, isReady: query.isReady, isError: query.isError }
}
