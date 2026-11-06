import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Plus } from 'lucide-react-native'
import { Text, View } from 'react-native'

interface ConnectButtonProps {
    isVisible: boolean
    isWide: boolean
    onConnect: () => void
}

// On a phone the header has no room for the words, so the button is an icon that keeps
// "Connect account" as its name for screen readers.
function ConnectButton({ isVisible, isWide, onConnect }: ConnectButtonProps) {
    const color = useThemeColor('primary-foreground')
    if (!isVisible) return null
    if (isWide) {
        return (
            <Button testID="bank-connect" style={{ minHeight: 44 }} onPress={onConnect}>
                <ButtonText>Connect account</ButtonText>
            </Button>
        )
    }
    return (
        <Button
            testID="bank-connect"
            accessibilityLabel="Connect account"
            size="icon"
            style={{ minHeight: 44, minWidth: 44 }}
            onPress={onConnect}
        >
            <Plus size={20} color={color} />
        </Button>
    )
}

interface BankingHeaderProps {
    canConnect: boolean
    isWide: boolean
    onConnect: () => void
}

export function BankingHeader({ canConnect, isWide, onConnect }: BankingHeaderProps) {
    return (
        <View className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center gap-2">
                <Text className="text-2xl font-semibold text-foreground">Banking</Text>
                <HelpIcon topic="books:banking" />
            </View>
            <ConnectButton isVisible={canConnect} isWide={isWide} onConnect={onConnect} />
        </View>
    )
}
