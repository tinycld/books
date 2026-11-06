import { useEffect, useRef } from 'react'
import type { TextInputInstance } from 'react-native'

// The first input of a dialog, focused when the dialog opens. An `autoFocus` prop fires
// while the dialog's layer is still mounting and loses the focus to it, so the focus
// waits one frame, as core PromptDialog's does.
//
// The result is spread onto core TextInput (`{...nameFocus}`). React 19 passes `ref` as
// a prop and core TextInput hands every prop it does not own to its React Native input,
// but its props type does not list `ref` yet (a core change request), so a spread
// carries it.
export function useFocusOnOpen() {
    const ref = useRef<TextInputInstance>(null)
    useEffect(() => {
        const frame = requestAnimationFrame(() => ref.current?.focus())
        return () => cancelAnimationFrame(frame)
    }, [])
    return { ref }
}
