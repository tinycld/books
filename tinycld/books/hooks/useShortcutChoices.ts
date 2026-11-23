import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { mergeRecoveries } from '../lib/live-recovery'
import { staticTargets } from '../lib/shortcut-catalog'
import { searchChoices, shortcutChoices } from '../lib/shortcut-choices'
import { canAddShortcut, type Shortcut } from '../lib/sidebar-shortcuts'
import { useAccountOptions } from './useAccountOptions'
import { useBooksAccess } from './useBooksAccess'
import { useBooksReports } from './useBooksReports'

/**
 * The "Add shortcut" choices of the Customize shortcuts dialog for the draft `list` and
 * the search `term`. `isFull` is true when the list holds the most it can (no choice
 * then). While a read is loading or failed, the choices of the kinds that did load are
 * still returned; the picker shows its loading or error row in place of the options.
 */
export function useShortcutChoices(list: readonly Shortcut[], term: string) {
    const { canWrite } = useBooksAccess()
    const reports = useBooksReports()
    const accounts = useAccountOptions()
    const all = shortcutChoices(list, {
        targets: staticTargets(canWrite),
        reports: reports.reports,
        accounts: accounts.options,
    })
    const recovery = mergeRecoveries([reports.recovery, accounts.recovery])
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.sidebar.shortcuts', err),
        })
    }
    const isError = reports.isError || accounts.isError
    return {
        choices: searchChoices(all, term),
        isFull: !canAddShortcut(list),
        isLoading: !isError && !(reports.isReady && accounts.isReady),
        isError,
        retry,
    }
}
