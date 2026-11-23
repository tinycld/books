// The web build of focus-return.ts: moves the focus ring.

const FOCUSABLE =
    'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], ' +
    '[tabindex]:not([tabindex="-1"])'

function isDrawn(element: HTMLElement): boolean {
    return element.getClientRects().length > 0
}

function takesFocus(element: HTMLElement): boolean {
    return element.getAttribute('aria-disabled') !== 'true' && isDrawn(element)
}

// The element itself when it takes focus (a core ShortcutButton is its focusable node),
// else its first focusable that is drawn.
function focusTargetIn(element: HTMLElement): HTMLElement | null {
    if (element.matches(FOCUSABLE) && takesFocus(element)) return element
    const inner = Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE))
    return inner.find(takesFocus) ?? null
}

/** True while no element holds the focus: it fell to the body (its element unmounted). */
export function isFocusUnclaimed(): boolean {
    if (typeof document === 'undefined') return false
    const active = document.activeElement
    return !active || active === document.body
}

/**
 * Focuses the first of `testIds` that is drawn inside `root` (a screen's node) and takes
 * focus: the element itself, or its first focusable. Books uses it to give focus back to a
 * screen whose dialog's opener is gone (a core ShortcutButton takes no ref).
 */
export function focusScreenControl(root: unknown, testIds: readonly string[]) {
    if (typeof HTMLElement === 'undefined' || !(root instanceof HTMLElement)) return
    for (const testId of testIds) {
        const element = root.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
        if (!element || !isDrawn(element)) continue
        const target = focusTargetIn(element)
        if (target) {
            target.focus()
            return
        }
    }
}
