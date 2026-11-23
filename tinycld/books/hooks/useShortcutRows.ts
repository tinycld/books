import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { mergeRecoveries } from '../lib/live-recovery'
import { shortcutRows } from '../lib/shortcut-rows'
import { useShortcutLookup } from './useShortcutLookup'
import { useSidebarShortcuts } from './useSidebarShortcuts'

/**
 * The Shortcuts section of the sidebar: the user's shortcuts as rows. `isError` is true
 * while a read the rows need failed (the list itself, the reports, or the accounts of the
 * register shortcuts); `retry` recovers every failed read in one call. With the list's own
 * read failed there is no row; with only the reports or the accounts failed, the other
 * rows stay.
 */
export function useShortcutRows() {
    const list = useSidebarShortcuts()
    const lookup = useShortcutLookup(list.shortcuts)
    const rows = shortcutRows(list.shortcuts, lookup.input)
    const recovery = mergeRecoveries([list.recovery, lookup.recovery])
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.sidebar.shortcuts', err),
        })
    }

    return {
        rows,
        isReady: list.isReady,
        isEmpty: list.isReady && !list.isError && list.shortcuts.length === 0,
        isError: list.isError || lookup.isError,
        retry,
    }
}
