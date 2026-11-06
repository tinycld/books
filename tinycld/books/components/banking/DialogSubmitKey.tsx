import { type ScopeOwner, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { nextScopeId } from '@tinycld/core/lib/shortcuts/scopes'
import { useId, useMemo, useRef } from 'react'
import { dialogSubmitShortcut } from '../../lib/banking-shortcuts'

interface DialogSubmitKeyProps {
    description: string
    isEnabled: boolean
    onSubmit(): void
}

// The open layer's own `modal` scope id, read when the key registers. Core Dialog and
// Sheet render their LayerEscape before the body, and nothing between it and this key
// takes a scope id, so the layer's id is the newest one assigned when this key's register
// effect runs (also when StrictMode re-runs the effects and LayerEscape takes a new id).
// `currentScopeId('modal')` cannot be used: LayerEscape assigns its id on mount but joins
// the stack one commit later (expo-router's useFocusEffect waits for its navigation
// state), so the stack has no modal entry yet. The key registers only when the dialog
// body mounts, together with its layer: each Banking dialog renders only while open and
// its description is fixed. No scope is pushed here: a second `modal` scope above the
// layer's would stop the layer's Escape "Close" from matching.
const layerScopeOwner: ScopeOwner = () => nextScopeId() - 1

// ⌘↵ for a Banking dialog; renders nothing. Rendered inside the dialog's body and
// stamped with the layer's modal scope, so it fires only while that layer is on top, and
// it shares the scope with the layer's Escape. Each Banking dialog renders only while
// open, so the key unregisters when its dialog closes, also on a phone where the sheet
// slides out. `isEnabled` and `onSubmit` are read at press time, so a render never
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
    useRegisterShortcuts(shortcuts, layerScopeOwner)
    return null
}
