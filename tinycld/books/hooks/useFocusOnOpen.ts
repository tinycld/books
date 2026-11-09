import { type RefObject, useEffect, useRef } from 'react'
import type { TextInputInstance } from 'react-native'

// An element outside a dialog focused when it opens: the select-all box of the bank
// import's Choose step. The focus waits one frame, so the step has mounted. With
// `isEnabled` false (a phone layout) nothing is focused. On native a view's `focus` does
// nothing. A dialog's first input uses core Dialog's `initialFocusRef` instead: core
// focuses the dialog's first focusable when it opens, unless that ref names another.
export function useFocusOnOpen<T extends { focus(): void } = TextInputInstance>(
    isEnabled = true
): { ref: RefObject<T | null> } {
    const ref = useRef<T>(null)
    useEffect(() => {
        if (!isEnabled) return
        const frame = requestAnimationFrame(() => ref.current?.focus())
        return () => cancelAnimationFrame(frame)
    }, [isEnabled])
    return { ref }
}
