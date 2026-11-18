import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useButtonShortcut } from '@tinycld/core/ui/shortcut-button/useButtonShortcut'
import { type Ref, useMemo } from 'react'
import { Pressable, type PressableInstance, Text } from 'react-native'
import { PAYMENT_FORM_DESCRIPTIONS, PAYMENT_FORM_KEYS } from '../../lib/payment-shortcuts'
import { useDocumentChrome } from '../documents/document-chrome'

const TAP = { minHeight: 44 }

interface ClearPaymentsLinkProps {
    isVisible: boolean
    isDisabled: boolean
    onPress: () => void
    scopeOwner: ScopeOwner
    // The last row's Enter moves focus here.
    linkRef: Ref<PressableInstance>
}

/**
 * "Clear payments" under the list: a link-styled button with a ref (core ShortcutButton
 * takes none), whose ⌥⌫ is registered through the hook ShortcutButton uses, so the key,
 * the ⇧? entry and the disabled rule match a ShortcutButton. The screen's document chrome
 * gives its test id (`<chrome>-clear`) and its ⇧? group (receive payment, Pay Bills).
 */
export function ClearPaymentsLink({
    isVisible,
    isDisabled,
    onPress,
    scopeOwner,
    linkRef,
}: ClearPaymentsLinkProps) {
    const chrome = useDocumentChrome()
    const group = chrome.shortcutGroup
    const shortcut = useMemo(
        () =>
            ({
                keys: PAYMENT_FORM_KEYS.clearPayments,
                scope: 'compose',
                allowInInputs: true,
                group,
            }) as const,
        [group]
    )
    useButtonShortcut({
        label: PAYMENT_FORM_DESCRIPTIONS.clearPayments,
        shortcut,
        isDisabled: isDisabled || !isVisible,
        onPress,
        scopeOwner,
    })
    if (!isVisible) return null
    return (
        <ClearLink
            label="Clear payments"
            testID={`${chrome.testId}-clear`}
            isDisabled={isDisabled}
            onPress={onPress}
            linkRef={linkRef}
        />
    )
}

interface ClearLinkProps {
    label: string
    testID: string
    isDisabled: boolean
    onPress: () => void
    linkRef: Ref<PressableInstance>
}

// The link-styled button under a list of amounts: primary, muted while disabled.
export function ClearLink({ label, testID, isDisabled, onPress, linkRef }: ClearLinkProps) {
    const tone = isDisabled ? 'text-muted-foreground' : 'text-primary'
    return (
        <Pressable
            ref={linkRef}
            testID={testID}
            accessibilityRole="button"
            accessibilityState={{ disabled: isDisabled }}
            disabled={isDisabled}
            onPress={onPress}
            className="justify-center self-start"
            style={TAP}
        >
            <Text className={`text-sm underline ${tone}`}>{label}</Text>
        </Pressable>
    )
}
