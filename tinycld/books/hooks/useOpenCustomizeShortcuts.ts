import { useShortcutsDialogStore } from '../stores/shortcuts-dialog-store'
import { useSidebarShortcuts } from './useSidebarShortcuts'

type SidebarShortcuts = ReturnType<typeof useSidebarShortcuts>

// The one rule for opening the dialog: the list is read, so there is a copy to edit.
export function useOpenRule(list: SidebarShortcuts) {
    const openDraft = useShortcutsDialogStore(state => state.open)
    const canOpen = list.isReady && !list.isError
    const open = () => {
        if (canOpen) openDraft(list.shortcuts)
    }
    return { canOpen, open }
}

/**
 * Only what the pencil in the sidebar needs. It does not read the shortcut lookup that
 * the dialog's rows need, so the sidebar runs no second query while the dialog is open.
 */
export function useOpenCustomizeShortcuts() {
    return useOpenRule(useSidebarShortcuts())
}
