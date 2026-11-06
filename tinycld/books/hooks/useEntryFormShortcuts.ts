import { useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { useId, useMemo, useRef } from 'react'
import {
    type FormKeyAction,
    type FormKeyState,
    formShortcuts,
    shortcutGroupSlug,
} from '../lib/entry-shortcuts'

interface EntryFormShortcutsInput {
    // The shortcut list's group, e.g. `Transfer`.
    group: string
    isPending: boolean
    hasDraft: boolean
    run: Record<FormKeyAction, () => void>
}

// The form's keys (⌘↵ Post, ⌘⇧↵ Post & new, ⌘S Save draft, Esc Cancel, ⌘⌫ Delete draft).
// The form owns a `compose` scope. Core dialogs and sheets push a `modal` scope above it,
// so no form key fires while one is open. Core menus push no scope: while a menu is open,
// its search field and its focused trigger still stop the keys, but a key pressed on a
// focused menu row reaches the form. While any layer is open, core's layer stack alone
// takes Escape, so Escape closes only that layer and Cancel does not run. The state and
// handlers are read at press time through refs, so a render never re-registers; the id
// is per instance, so a form replacing another cannot unregister the new one's keys.
export function useEntryFormShortcuts({
    group,
    isPending,
    hasDraft,
    run,
}: EntryFormShortcutsInput) {
    const owner = useShortcutScope('compose')
    const instance = useId()
    const writes = useServerActionState()
    const stateRef = useRef<FormKeyState>({
        isPending,
        isWriteBlocked: writes.isDisabled,
        hasDraft,
    })
    stateRef.current = { isPending, isWriteBlocked: writes.isDisabled, hasDraft }
    const runRef = useRef(run)
    runRef.current = run
    const slug = shortcutGroupSlug(group)
    const shortcuts = useMemo(
        () =>
            formShortcuts({
                id: `books.${slug}.form.${instance}`,
                group,
                read: () => stateRef.current,
                run: {
                    post: () => runRef.current.post(),
                    postAndNew: () => runRef.current.postAndNew(),
                    saveDraft: () => runRef.current.saveDraft(),
                    cancel: () => runRef.current.cancel(),
                    deleteDraft: () => runRef.current.deleteDraft(),
                },
            }),
        [group, instance, slug]
    )
    useRegisterShortcuts(shortcuts, owner)
}
