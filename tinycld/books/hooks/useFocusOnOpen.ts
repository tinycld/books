import { type RefObject, useEffect, useRef } from 'react'
import type { TextInputInstance } from 'react-native'

// An element focused when it opens: the first input of a dialog, or the select-all box of
// the bank import's Choose step. An `autoFocus` prop fires while a dialog's layer is still
// mounting and loses the focus to it, so the focus waits one frame, as core PromptDialog's
// does. With `isEnabled` false (a phone layout) nothing is focused. On native a view's
// `focus` does nothing.
//
// For a text input the result is spread onto core TextInput (`{...nameFocus}`). React 19
// passes `ref` as a prop and core TextInput hands every prop it does not own to its React
// Native input, but its props type does not list `ref` yet (a core change request), so a
// spread carries it.
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
