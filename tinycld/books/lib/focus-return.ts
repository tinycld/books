// Native has no focus ring to move, so this is a no-op here; the web build is
// focus-return.web.ts (Metro picks it by platform).

/** Web: focuses a screen's control by test id (focus-return.web.ts). Native: nothing. */
export function focusScreenControl(_root: unknown, _testIds: readonly string[]) {}
