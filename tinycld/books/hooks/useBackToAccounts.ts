import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'

// The import was opened from the Chart of Accounts, which is still in the stack. Popping to
// it before replacing keeps one copy of that screen; pushing would mount a second one.
export function useBackToAccounts() {
    const orgHref = useOrgHref()
    return () => {
        if (router.canGoBack()) router.back()
        router.replace(orgHref('books/accounts'))
    }
}
