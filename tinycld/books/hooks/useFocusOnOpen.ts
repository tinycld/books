import { type RefObject, useEffect, useRef } from 'react'
import type { TextInputInstance } from 'react-native'

// An element focused when it opens: the first input of a dialog, or the select-all box of
// the bank import's Choose step. An `autoFocus` prop fires while a dialog's layer is still
// mounting and loses the focus to it, so the focus waits one frame, as core PromptDialog's
// does. With `isEnabled` false (a phone layout) nothing is focused. On native a view's
// `focus` does nothing.
//
// For a text input pass the ref as core TextInput's `inputRef`
// (`inputRef={nameFocus.ref}`): TextInput sets its input's `ref` from `inputRef` after
// the props spread, so a spread `ref` never reaches the input.
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
