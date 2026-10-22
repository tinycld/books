import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { type NewAction, newMenuForAccess } from '../lib/shell-nav'
import { useBooksAccess } from './useBooksAccess'

export function useNewMenu(actions?: readonly NewAction[]) {
    const access = useBooksAccess()
    const orgHref = useOrgHref()
    const columns = newMenuForAccess(access, actions)

    return {
        isVisible: columns.length > 0,
        columns,
        open: (action: NewAction) => router.push(orgHref(action.href)),
    }
}
