import { useRef } from 'react'
import { Platform } from 'react-native'

// A line's first cell (a picker trigger), focused by script (web: the button element).
type FocusTarget = { focus: () => void }

function isFocusTarget(node: unknown): node is FocusTarget {
    return typeof node === 'object' && node !== null && 'focus' in node
}

// Add line is a core ShortcutButton, which takes no ref, so its wrapper's node is held and
// the button inside it is found on web. A phone has no focus ring to move.
function focusAddLine(node: unknown) {
    if (Platform.OS !== 'web') return
    if (typeof HTMLElement === 'undefined' || !(node instanceof HTMLElement)) return
    const button = node.querySelector<HTMLElement>('[tabindex="0"]') ?? node
    button.focus()
}

/**
 * The focus moves of a form's lines (the deposit's other funds lines, an inventory
 * adjustment's lines): a new line (Add line, ⌥↵, Enter in the last line) takes the focus in
 * its first cell once it mounts; `next` moves from a line to the next line's first cell, or
 * adds a line after the last; Remove (the row menu or ⌘⌥⌫) moves it to the line before, or
 * the line after for the first, or Add line when no line is left (web). The line that holds
 * the focus is a ref set by the line's own focus events (no render per Tab), read by ⌘⌥⌫'s
 * `when`. `addLine` appends a line and returns its id, or null when no line may be added.
 */
export function useLineFocus(
    fields: readonly { id: string }[],
    addLine: () => string | null,
    remove: (index: number) => void
) {
    const triggers = useRef(new Map<string, FocusTarget>())
    const refs = useRef(new Map<string, (node: unknown) => void>())
    const pending = useRef<string | null>(null)
    const focused = useRef<string | null>(null)
    const addLineNode = useRef<unknown>(null)
    const fieldsRef = useRef(fields)
    fieldsRef.current = fields

    const focusLine = (id: string | undefined) => {
        if (id === undefined) return
        const node = triggers.current.get(id)
        if (node) node.focus()
        else pending.current = id
    }
    // One stable ref callback per line, so a render does not detach and attach it.
    const triggerRef = (id: string) => {
        const known = refs.current.get(id)
        if (known) return known
        const attach = (node: unknown) => {
            if (!isFocusTarget(node)) {
                triggers.current.delete(id)
                return
            }
            triggers.current.set(id, node)
            if (pending.current !== id) return
            pending.current = null
            node.focus()
        }
        refs.current.set(id, attach)
        return attach
    }
    const addFocused = () => focusLine(addLine() ?? undefined)
    const removeAt = (index: number) => {
        const lines = fieldsRef.current
        const line = lines[index]
        if (line === undefined) return
        const neighbour = lines[index - 1]?.id ?? lines[index + 1]?.id
        // The last line gone: the focus goes to Add line, so the keyboard keeps its place.
        if (neighbour === undefined) focusAddLine(addLineNode.current)
        else focusLine(neighbour)
        refs.current.delete(line.id)
        if (focused.current === line.id) focused.current = null
        remove(index)
    }
    return {
        triggerRef,
        // The ref of the View that wraps Add line.
        addLineRef: (node: unknown) => {
            addLineNode.current = node
        },
        add: addFocused,
        // Moves the focus to a line just placed by the caller (a duplicate) once it mounts.
        focusLine,
        removeAt,
        removeFocused: () => {
            const index = fieldsRef.current.findIndex(line => line.id === focused.current)
            if (index !== -1) removeAt(index)
        },
        // Enter in line `index`'s last cell.
        next: (index: number) => {
            const after = fieldsRef.current[index + 1]
            if (after) focusLine(after.id)
            else addFocused()
        },
        onFocus: (id: string) => {
            focused.current = id
        },
        onBlur: (id: string) => {
            if (focused.current === id) focused.current = null
        },
        isFocused: () => focused.current !== null,
    }
}

export type LineFocus = ReturnType<typeof useLineFocus>
