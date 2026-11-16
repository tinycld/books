import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useButtonShortcut } from '@tinycld/core/ui/shortcut-button/useButtonShortcut'
import { type Ref, useMemo } from 'react'
import { Pressable, type PressableInstance, Text } from 'react-native'
import { PAYMENT_FORM_DESCRIPTIONS, PAYMENT_FORM_KEYS } from '../../lib/payment-shortcuts'
import { useDocumentChrome } from '../documents/document-chrome'

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
    const tone = isDisabled ? 'text-muted-foreground' : 'text-primary'
    return (
        <Pressable
            ref={linkRef}
            testID={`${chrome.testId}-clear`}
            accessibilityRole="button"
            accessibilityState={{ disabled: isDisabled }}
            disabled={isDisabled}
            onPress={onPress}
            className="justify-center self-start"
            style={{ minHeight: 44 }}
        >
            <Text className={`text-sm underline ${tone}`}>Clear payments</Text>
        </Pressable>
    )
}
