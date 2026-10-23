import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { useBackToAccounts } from '../../../hooks/useBackToAccounts'

interface ImportSummaryProps {
    result: { created: number; skipped: number } | null
}

export function ImportSummary({ result }: ImportSummaryProps) {
    const backToAccounts = useBackToAccounts()
    if (!result) return null
    return (
        <View className="items-start gap-3">
            <Text className="text-lg font-semibold text-foreground">Import complete</Text>
            <View accessibilityRole="summary" className="gap-1">
                <Text className="text-sm text-foreground">{`${result.created} created`}</Text>
                <Text className="text-sm text-foreground">{`${result.skipped} skipped`}</Text>
            </View>
            <Button testID="account-import-done" className="min-h-11" onPress={backToAccounts}>
                <ButtonText>Chart of Accounts</ButtonText>
            </Button>
        </View>
    )
}
