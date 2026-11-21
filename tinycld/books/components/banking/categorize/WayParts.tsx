import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { Text, View } from 'react-native'

const MEMO_WRAPPER = { className: 'gap-1.5' } as const
const MEMO_WRAPPER_DISABLED = { className: 'gap-1.5 opacity-60', 'aria-disabled': true } as const

// Memo's wrapper (core TextInput `wrapperProps`): while the write is sent it reads as
// disabled, as the pickers' triggers do (SearchPicker's `opacity-60`).
export function memoWrapperProps(isDisabled: boolean) {
    return isDisabled ? MEMO_WRAPPER_DISABLED : MEMO_WRAPPER
}

// The server's refusal of the form, or the transport text, read out at once.
export function RefusalLine({ text }: { text: string | null }) {
    if (!text) return null
    return (
        <Text testID="bank-cat-refusal" accessibilityRole="alert" className="text-sm text-danger">
            {text}
        </Text>
    )
}

// ⌘↵ from any field of the form, Memo included.
const SUBMIT_KEY = { keys: '$mod+Enter', scope: 'list', allowInInputs: true } as const

type WaySubmitProps = {
    testID: string
    label: string
    busyLabel: string
    isSending: boolean
    state: { isDisabled: boolean; hint: string | undefined }
    scopeOwner: ScopeOwner
    onPress: () => void
}

// Categorize and Record transfer. ShortcutButton has no spinner, so while the write is
// sent a disabled Button with core ButtonSpinner takes its place (as MatchSubmit does),
// and ⌘↵ is not registered then.
export function WaySubmit({
    testID,
    label,
    busyLabel,
    isSending,
    state,
    scopeOwner,
    onPress,
}: WaySubmitProps) {
    if (isSending) {
        return (
            <View className="flex-row">
                <Button testID={testID} isDisabled className="min-h-11">
                    <ButtonSpinner />
                    <ButtonText>{busyLabel}</ButtonText>
                </Button>
            </View>
        )
    }
    return (
        <View className="flex-row">
            <ShortcutButton
                testID={testID}
                label={label}
                shortcut={SUBMIT_KEY}
                scopeOwner={scopeOwner}
                serverAction
                isDisabled={state.isDisabled}
                accessibilityHint={state.hint}
                className="min-h-11"
                onPress={onPress}
            />
        </View>
    )
}
