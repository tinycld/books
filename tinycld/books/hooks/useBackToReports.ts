import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'

// A report is opened from the hub, which is still in the stack. Popping to it before
// replacing keeps one copy of the hub; a deep link with nothing to pop lands on it too.
export function useBackToReports() {
    const orgHref = useOrgHref()
    return () => {
        if (router.canGoBack()) router.back()
        router.replace(orgHref('books/reports'))
    }
}
