import { Button, ButtonText } from '@tinycld/core/ui/button'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

// `muted` is the calm message tone, for a state that is not a fault (read-only, not
// found, nothing to import); `danger` marks a fault (a load error, an unreadable file),
// and only a fault is announced as an alert.
const TONES = {
    muted: 'text-foreground',
    danger: 'text-danger',
} as const

interface BankImportMessageProps {
    testID: string
    text: string
    tone?: keyof typeof TONES
    children?: ReactNode
}

// A bordered message in place of the steps, with its actions under the text.
export function BankImportMessage({
    testID,
    text,
    tone = 'muted',
    children,
}: BankImportMessageProps) {
    const role = tone === 'danger' ? 'alert' : undefined
    return (
        <View
            testID={testID}
            accessibilityRole={role}
            className="items-center gap-3 rounded-xl border border-border p-6"
        >
            <Text className={`text-center text-base font-medium ${TONES[tone]}`}>{text}</Text>
            <View className="flex-row flex-wrap justify-center gap-2">{children}</View>
        </View>
    )
}

export function BankImportToBanking({ onPress }: { onPress: () => void }) {
    return (
        <Button testID="bank-import-to-banking" className="min-h-11" onPress={onPress}>
            <ButtonText>Back to Banking</ButtonText>
        </Button>
    )
}
