import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { INVOICE_MESSAGES } from '../../lib/invoice-messages'
import { EntryBackLink } from '../entries/EntryHeader'

export function InvoiceLoadError({ onRetry }: { onRetry(): void }) {
    return (
        <View className="flex-1 bg-background px-4 pt-2">
            <EntryBackLink />
            <View
                testID="invoice-error"
                accessibilityRole="alert"
                className="flex-1 items-center gap-3 p-6"
            >
                <Text className="text-base font-medium text-foreground">
                    {INVOICE_MESSAGES.loadFailed}
                </Text>
                <Button
                    testID="invoice-retry"
                    variant="outline"
                    style={{ minHeight: 44 }}
                    onPress={onRetry}
                >
                    <ButtonText>Retry</ButtonText>
                </Button>
            </View>
        </View>
    )
}
