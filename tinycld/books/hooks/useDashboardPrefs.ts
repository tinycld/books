import { log } from '@tinycld/core/lib/logger'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useUserPreference } from '@tinycld/core/lib/use-user-preference'
import {
    type DashboardPrefs,
    DEFAULT_DASHBOARD_PREFS,
    parseDashboardPrefs,
} from '../lib/dashboard-prefs'

// Core rolls the optimistic value back on a failure, so the control returns to the
// saved value with no state of its own here.
function reportSaveError(error: Error) {
    log.warn('books.dashboard.prefs', 'the dashboard change was not saved', { error })
    useToastStore.getState().addToast({
        title: 'The dashboard change was not saved.',
        variant: 'error',
        duration: 5000,
    })
}

/**
 * The signed-in user's dashboard arrangement (spec §3 "What is saved"). `prefs` is the
 * defaults until the row loads, when there is no row, and when the stored value does
 * not parse. `save` writes the whole value and does nothing until the read is ready;
 * `retry` restarts a failed read.
 */
export function useDashboardPrefs() {
    const [value, setValue, status] = useUserPreference<unknown>(
        'books',
        'dashboard',
        DEFAULT_DASHBOARD_PREFS,
        { onSaveError: reportSaveError }
    )
    const prefs = parseDashboardPrefs(value)
    const save = (next: DashboardPrefs) => {
        if (!status.isReady) return
        setValue(next)
    }
    const retry = () => {
        void status.retry()
    }
    return { prefs, isReady: status.isReady, isError: status.isError, retry, save }
}
