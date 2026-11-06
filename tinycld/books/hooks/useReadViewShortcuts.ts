import { useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useId, useMemo, useRef } from 'react'
import type { EntryActionId } from '../lib/entry-actions'
import {
    offeredReadActions,
    type ReadKeyState,
    readShortcuts,
    shortcutGroupSlug,
} from '../lib/entry-shortcuts'

interface ReadViewShortcutsInput {
    // The shortcut list's group, e.g. `Transfer`.
    group: string
    actions: readonly EntryActionId[]
    isBusy: boolean
    onEdit(): void
    onVoid(): void
    onReverse(): void
}

// The read view's keys (E Edit, V Void, R Reverse), each only while its action is
// offered. The read view owns a `thread` scope; over a draft's hidden form it is pushed
// after the form's, so the read view holds the keys. State and handlers are read at press
// time through refs; the keys re-register only when the offered read keys change (after
// a void or a reversal), never on an ordinary render.
export function useReadViewShortcuts({
    group,
    actions,
    isBusy,
    onEdit,
    onVoid,
    onReverse,
}: ReadViewShortcutsInput) {
    const owner = useShortcutScope('thread')
    const instance = useId()
    const stateRef = useRef<ReadKeyState>({ actions, isBusy })
    stateRef.current = { actions, isBusy }
    const runRef = useRef({ onEdit, onVoid, onReverse })
    runRef.current = { onEdit, onVoid, onReverse }
    const slug = shortcutGroupSlug(group)
    // A new `actions` array comes with most renders; the joined names change only when
    // the offered read keys do.
    const offeredNames = offeredReadActions(actions).join(',')
    const shortcuts = useMemo(
        () =>
            readShortcuts({
                id: `books.${slug}.read.${instance}`,
                group,
                offered: offeredReadActions(offeredNames.split(',')),
                read: () => stateRef.current,
                run: {
                    edit: () => runRef.current.onEdit(),
                    void: () => runRef.current.onVoid(),
                    reverse: () => runRef.current.onReverse(),
                },
            }),
        [group, instance, slug, offeredNames]
    )
    useRegisterShortcuts(shortcuts, owner)
}
