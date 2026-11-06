import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

const STEPS = [
    'Connect a bank or credit card account from your chart of accounts.',
    "Sign in to your bank's website and export a statement as CSV, OFX, QFX or QBO.",
    'Upload the file here. Books keeps it until you import its transactions.',
]

function Step({ n, text }: { n: number; text: string }) {
    return (
        <View className="flex-row items-start gap-4">
            <Text className="w-6 text-2xl font-semibold tabular-nums text-muted-foreground">
                {n}
            </Text>
            <Text className="flex-1 pt-1 text-base text-foreground">{text}</Text>
        </View>
    )
}

function IntroAction({ canWrite, onConnect }: { canWrite: boolean; onConnect: () => void }) {
    if (canWrite) {
        return (
            <Button
                testID="bank-intro-connect"
                className="self-start"
                style={{ minHeight: 44 }}
                onPress={onConnect}
            >
                <ButtonText>Connect account</ButtonText>
            </Button>
        )
    }
    return (
        <Text className="text-sm text-muted-foreground">
            No bank accounts are connected yet. A bookkeeper or an admin can connect one.
        </Text>
    )
}

export function BankingIntro({
    canWrite,
    onConnect,
}: {
    canWrite: boolean
    onConnect: () => void
}) {
    const steps = STEPS.map((text, i) => <Step key={text} n={i + 1} text={text} />)
    return (
        <View
            testID="bank-intro"
            className="gap-5 rounded-xl border border-border bg-surface-secondary p-6"
            style={{ maxWidth: 760 }}
        >
            <Text className="text-xl font-semibold text-foreground">
                Bring in your bank transactions by file
            </Text>
            <View className="gap-4">{steps}</View>
            <IntroAction canWrite={canWrite} onConnect={onConnect} />
        </View>
    )
}
