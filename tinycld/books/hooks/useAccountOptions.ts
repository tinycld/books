import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { accountOptionList } from '../lib/account-options'

export function useAccountOptions() {
    const [accountsCollection] = useStore('books_accounts')
    const { data: accounts = [] } = useLiveQuery({
        query: query => query.from({ account: accountsCollection }),
        queryKey: ['books.entry-form.accounts'],
    })
    return accountOptionList(accounts)
}
