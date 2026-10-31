import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'

// One query key for every account picker on a record form and the new product
// route's defaults, so they share one set of rows.
export function useFormAccounts() {
    const [accountsCollection] = useStore('books_accounts')
    const { data, isReady } = useLiveQuery({
        query: q => q.from({ account: accountsCollection }),
        queryKey: ['books.form.accounts'],
    })
    return { accounts: data ?? [], isReady }
}

export type FormAccount = ReturnType<typeof useFormAccounts>['accounts'][number]
