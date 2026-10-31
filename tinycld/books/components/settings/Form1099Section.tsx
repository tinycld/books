import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { useForm1099Section } from '../../hooks/useForm1099Section'
import type { BooksSettings } from '../../types'
import { ThresholdCard } from './ThresholdCard'

function SectionLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="books-1099-loading">
            <LoadingState />
        </View>
    )
}

function SectionError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View
            accessibilityRole="alert"
            className="items-center gap-3 p-6"
            testID="books-1099-error"
        >
            <Text className="text-sm text-foreground">1099 settings could not be loaded.</Text>
            <Button size="sm" variant="outline" testID="books-1099-retry" onPress={onRetry}>
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

interface SectionReadyProps {
    isVisible: boolean
    settings: BooksSettings | undefined
    editsThreshold: boolean
}

function SectionReady({ isVisible, settings, editsThreshold }: SectionReadyProps) {
    if (!isVisible || !settings) return null
    return (
        <View className="gap-4" testID="books-1099-section">
            <ThresholdCard settings={settings} editsThreshold={editsThreshold} />
        </View>
    )
}

// It takes no isAdmin from SectionBody: the threshold is admin-only but the boxes are for
// every writer, so the section reads the full access level through useForm1099Section.
export function Form1099Section() {
    const { part, settings, controls, retry } = useForm1099Section()
    return (
        <>
            <SectionLoading isVisible={part === 'loading'} />
            <SectionError isVisible={part === 'error'} onRetry={retry} />
            <SectionReady
                isVisible={part === 'ready'}
                settings={settings}
                editsThreshold={controls.editsThreshold}
            />
        </>
    )
}
