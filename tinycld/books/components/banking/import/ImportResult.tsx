import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { BankImportFlow } from '../../../hooks/useBankImportFlow'

type Result = NonNullable<BankImportFlow['result']>

function DetailText({ text }: { text: string }) {
    if (!text) return null
    return (
        <Text testID="bank-import-result-detail" className="text-sm text-foreground">
            {text}
        </Text>
    )
}

function ImportMoreButton({ isVisible, onPress }: { isVisible: boolean; onPress: () => void }) {
    if (!isVisible) return null
    return (
        <Button testID="bank-import-more" variant="outline" className="min-h-11" onPress={onPress}>
            <ButtonText>Import more from this file</ButtonText>
        </Button>
    )
}

interface ImportResultProps {
    result: Result
    onBack: () => void
    onMore: () => void
}

export function ImportResult({ result, onBack, onMore }: ImportResultProps) {
    return (
        <View
            testID="bank-import-result"
            accessibilityRole="summary"
            className="gap-3 rounded-xl border border-border p-4"
        >
            <Text
                testID="bank-import-result-text"
                className="text-lg font-semibold text-foreground"
            >
                {result.headline}
            </Text>
            <DetailText text={result.detail} />
            <View className="flex-row flex-wrap gap-2 pt-1">
                <Button testID="bank-import-to-banking" className="min-h-11" onPress={onBack}>
                    <ButtonText>Back to Banking</ButtonText>
                </Button>
                <ImportMoreButton isVisible={result.hasMore} onPress={onMore} />
            </View>
        </View>
    )
}
