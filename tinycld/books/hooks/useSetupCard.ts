import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'

export function useSetupCard() {
    const orgHref = useOrgHref()
    return { open: () => router.push(orgHref('books/setup')) }
}
