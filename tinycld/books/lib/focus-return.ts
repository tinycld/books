// Native has no focus ring to move, so both are no-ops here; the web build is
// focus-return.web.ts (Metro picks it by platform).

/** Web: true while the focus fell to the body. Native: always false. */
export function isFocusUnclaimed(): boolean {
    return false
}

/** Web: focuses a screen's control by test id (focus-return.web.ts). Native: nothing. */
export function focusScreenControl(_root: unknown, _testIds: readonly string[]) {}
