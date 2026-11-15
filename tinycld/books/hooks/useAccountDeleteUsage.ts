import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { useAccountUsage } from './useAccountUsage'

/**
 * What stops an account from being deleted, as checkAccountDelete in server/accounts.go
 * counts it: the documents of accountLineReferences (bills and expenses whose account
 * lines name the account, each counted once by grouping its lines on the document;
 * expenses whose Paid from is the account), then journal lines and sub-accounts.
 */
export function useAccountDeleteUsage(accountId: string) {
    const [billLinesCollection, expenseLinesCollection, expensesCollection] = useStore(
        'books_bill_lines',
        'books_expense_lines',
        'books_expenses'
    )
    const usage = useAccountUsage(accountId)
    const billUsage = useLiveQuery({
        queryKey: ['books-account-bill-usage', accountId],
        query: query =>
            query
                .from({ line: billLinesCollection })
                .where(({ line }) => eq(line.account, accountId))
                .groupBy(({ line }) => line.bill)
                .select(({ line }) => ({ bill: line.bill })),
    })
    const expenseLineUsage = useLiveQuery({
        queryKey: ['books-account-expense-line-usage', accountId],
        query: query =>
            query
                .from({ line: expenseLinesCollection })
                .where(({ line }) => eq(line.account, accountId))
                .groupBy(({ line }) => line.expense)
                .select(({ line }) => ({ expense: line.expense })),
    })
    const paidUsage = useLiveQuery({
        queryKey: ['books-account-paid-usage', accountId],
        query: query =>
            query
                .from({ expense: expensesCollection })
                .where(({ expense }) => eq(expense.paid_from, accountId))
                .select(({ expense }) => ({ id: expense.id })),
    })

    const documentRecoveries: LiveRecovery[] = [
        billUsage.isError
            ? { queries: [billUsage.collection], sources: [billLinesCollection] }
            : null,
        expenseLineUsage.isError
            ? { queries: [expenseLineUsage.collection], sources: [expenseLinesCollection] }
            : null,
        paidUsage.isError
            ? { queries: [paidUsage.collection], sources: [expensesCollection] }
            : null,
    ].filter(part => part !== null)
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([...usage.recoveries, ...documentRecoveries]),
            onError: err => log.error('books.account-delete-usage', err),
        })
    }

    const loadFailed =
        usage.loadFailed || billUsage.isError || expenseLineUsage.isError || paidUsage.isError
    const isReady =
        !loadFailed &&
        usage.isReady &&
        billUsage.isReady &&
        expenseLineUsage.isReady &&
        paidUsage.isReady

    return {
        lines: usage.lines,
        children: usage.children,
        bills: billUsage.data?.length ?? 0,
        expenses: expenseLineUsage.data?.length ?? 0,
        paidExpenses: paidUsage.data?.length ?? 0,
        isReady,
        loadFailed,
        retry,
    }
}
