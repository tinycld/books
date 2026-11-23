import type { LucideIcon } from 'lucide-react-native'
import { shortcutRows } from '../lib/shortcut-rows'
import {
    addShortcut,
    DEFAULT_SHORTCUTS,
    moveShortcut,
    removeShortcut,
    type Shortcut,
    shortcutKey,
} from '../lib/sidebar-shortcuts'
import { useShortcutsDialogStore } from '../stores/shortcuts-dialog-store'
import { useOpenRule } from './useOpenRule'
import { useShortcutLookup } from './useShortcutLookup'
import { useSidebarShortcuts } from './useSidebarShortcuts'

export interface CustomizeRow {
    key: string
    shortcut: Shortcut
    label: string
    // Null for a shortcut that has nothing to open now (a deleted report or account, a
    // form for a reader): the sidebar does not draw it, the dialog shows it so that the
    // user can remove it.
    icon: LucideIcon | null
}

const NO_DRAFT: Shortcut[] = []
const MISSING_LABEL = 'Not available'

function sameList(a: readonly Shortcut[], b: readonly Shortcut[]) {
    return a.length === b.length && a.every((item, i) => shortcutKey(item) === shortcutKey(b[i]))
}

/**
 * The Customize shortcuts dialog. It edits a draft: remove, move and reorder change only
 * the draft, `save` writes the draft one time, and `cancel` drops it. A change that was
 * computed from the saved list for each press would lose fast changes, because a write
 * that waits behind an earlier one is not in the saved list yet. A draft equal to the
 * defaults is saved as "no row" (`reset`), so later changes of the defaults reach the user.
 */
export function useCustomizeShortcuts() {
    const list = useSidebarShortcuts()
    const draft = useShortcutsDialogStore(state => state.draft)
    const { canOpen, open } = useOpenRule(list)
    const setDraft = useShortcutsDialogStore(state => state.setDraft)
    const close = useShortcutsDialogStore(state => state.close)
    const items = draft ?? NO_DRAFT
    const lookup = useShortcutLookup(items)

    const drawn = new Map(shortcutRows(items, lookup.input).map(row => [row.key, row]))
    const rows: CustomizeRow[] = items.map(shortcut => {
        const key = shortcutKey(shortcut)
        const row = drawn.get(key)
        return { key, shortcut, label: row?.label ?? MISSING_LABEL, icon: row?.icon ?? null }
    })

    // The dialog closes only after the write is saved: a refused write (the hook shows the
    // toast) leaves the dialog open with the draft, so the user's changes are not lost.
    const canSave = canOpen && !list.isSaving
    const save = () => {
        if (!draft || !canSave) return
        const isDefault = sameList(draft, DEFAULT_SHORTCUTS)
        if (isDefault && list.isCustomized) list.reset(close)
        else if (!isDefault && !sameList(draft, list.shortcuts)) list.save(draft, close)
        else close()
    }
    // A write in progress closes the dialog when it is saved; a Cancel then would let that
    // close hit a dialog the user opened again.
    const cancel = () => {
        if (!list.isSaving) close()
    }

    return {
        isOpen: draft !== null,
        canOpen,
        open,
        draft: items,
        rows,
        isDefault: sameList(items, DEFAULT_SHORTCUTS),
        isEmpty: items.length === 0,
        canSave,
        setDraft,
        add: (shortcut: Shortcut) => setDraft(addShortcut(items, shortcut)),
        remove: (key: string) => setDraft(removeShortcut(items, key)),
        move: (key: string, by: -1 | 1) => setDraft(moveShortcut(items, key, by)),
        reorder: (next: CustomizeRow[]) => setDraft(next.map(row => row.shortcut)),
        resetToDefaults: () => setDraft([...DEFAULT_SHORTCUTS]),
        cancel,
        save,
    }
}
