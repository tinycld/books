// On the web, a mouse press leaves DOM focus on the pressed row, check box, tab, button or
// menu trigger, and react-native-web presses that element on plain Enter (and Space on a
// button) before the list sees the key. A movement key makes the stripe the place the
// keys act on, so it drops that focus: ↵ and Space then reach the list and act on the
// striped row. A text field keeps its focus (no list key fires inside one anyway). Native
// has no `document` and no such focus. Used by hooks/useReviewShortcuts.ts,
// hooks/useReconcileShortcuts.ts and hooks/useReconcileAccounts.ts.
export function releaseDomFocus() {
    if (typeof document === 'undefined') return
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || active === document.body) return
    if (active.isContentEditable || active.matches('input, textarea, select')) return
    active.blur()
}

// Whether the element with DOM focus matches `selector`; false on native (no `document`).
export function activeElementMatches(selector: string): boolean {
    if (typeof document === 'undefined') return false
    const active = document.activeElement
    return active !== null && typeof active.matches === 'function' && active.matches(selector)
}
