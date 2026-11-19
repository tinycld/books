import { Text, View } from 'react-native'

// A read band's last row, ruled off as the form's Payment row: "Payment" over the
// payment line (paymentText). No row for an empty line (no method, reference or account).
export function DocumentPaymentRow({ testID, text }: { testID: string; text: string }) {
    if (text === '') return null
    return (
        <View className="gap-0.5 border-t border-border pt-3">
            <Text className="text-xs text-muted-foreground">Payment</Text>
            <Text testID={testID} className="text-sm text-foreground">
                {text}
            </Text>
        </View>
    )
}
