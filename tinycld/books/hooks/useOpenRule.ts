import { useShortcutsDialogStore } from '../stores/shortcuts-dialog-store'
import type { useSidebarShortcuts } from './useSidebarShortcuts'

type SidebarShortcuts = ReturnType<typeof useSidebarShortcuts>
export type OpenableList = Pick<SidebarShortcuts, 'shortcuts' | 'isReady' | 'isError'>

// The one rule for opening the dialog: the list is read, so there is a copy to edit. It
// takes the list from its caller, so the sidebar and the dialog each read it only once.
export function useOpenRule(list: OpenableList) {
    const openDraft = useShortcutsDialogStore(state => state.open)
    const canOpen = list.isReady && !list.isError
    const open = () => {
        if (canOpen) openDraft(list.shortcuts)
    }
    return { canOpen, open }
}
