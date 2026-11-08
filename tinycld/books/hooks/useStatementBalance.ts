import { eq, not } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRef } from 'react'
import { statementBalance } from '../lib/bank-import-view'

// The balance of a connection's latest bank statement: its file with the latest statement
// date, then the newest upload. A CSV file has no statement date, so it never counts. The
// line is extra to the card's own balance, so while it loads or after a load error the card
// shows no line; the error is logged once per failure, so it is not silent.
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
    return { statement, isError: query.isError }
}
