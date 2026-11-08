import { useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { useId, useMemo, useRef } from 'react'
import { dialogSubmitShortcut } from '../../lib/banking-shortcuts'

interface DialogSubmitKeyProps {
    description: string
    isEnabled: boolean
    onSubmit(): void
}

// ⌘↵ for a Banking dialog; renders nothing. Rendered inside the dialog's body, so the
// registration takes the scope owner that core's LayerScope publishes around the layer's
// content: the key fires only while that layer is on top, and it shares the scope with
// the layer's Escape. No scope is pushed here: a second `modal` scope above the layer's
// would stop the layer's Escape "Close" from matching. Each Banking dialog renders only
// while open, so the key unregisters when its dialog closes, also on a phone where the
// sheet slides out. `isEnabled` and `onSubmit` are read at press time, so a render never
// re-registers.
export function DialogSubmitKey({ description, isEnabled, onSubmit }: DialogSubmitKeyProps) {
    const instance = useId()
    const enabledRef = useRef(isEnabled)
    enabledRef.current = isEnabled
    const submitRef = useRef(onSubmit)
    submitRef.current = onSubmit
    const shortcuts = useMemo(
        () => [
            dialogSubmitShortcut({
                id: `books.banking.dialog.${instance}`,
                description,
                isEnabled: () => enabledRef.current,
                run: () => submitRef.current(),
            }),
        ],
        [instance, description]
    )
    useRegisterShortcuts(shortcuts)
    return null
}
