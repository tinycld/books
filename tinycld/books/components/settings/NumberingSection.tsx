import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { useDocSequences } from '../../hooks/useDocSequences'
import type { BooksDocSequences } from '../../types'
import { SectionCard } from './SectionCard'
import { SequenceCard } from './SequenceCard'

function NumberingError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View
            accessibilityRole="alert"
            className="items-center gap-3 p-4"
            testID="books-settings-numbering-error"
        >
            <Text className="text-sm text-foreground">Document numbers could not be loaded.</Text>
            <Button
                size="sm"
                variant="outline"
                testID="books-settings-numbering-retry"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function NumberingEmpty({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <SectionCard>
            <Text className="text-sm text-muted-foreground" testID="books-settings-numbering-empty">
                No document numbers to set yet.
            </Text>
        </SectionCard>
    )
}

function NumberingCards({
    rows,
    isAdmin,
    isVisible,
}: {
    rows: BooksDocSequences[]
    isAdmin: boolean
    isVisible: boolean
}) {
    if (!isVisible) return null
    return (
        <>
            {rows.map(sequence => (
                <SequenceCard key={sequence.id} sequence={sequence} isAdmin={isAdmin} />
            ))}
        </>
    )
}

export function NumberingSection({ isAdmin }: { isAdmin: boolean }) {
    const { sequences, isReady, hasLoadError, retryLoad } = useDocSequences()
    const rows = sequences ?? []
    return (
        <View className="gap-4" testID="books-settings-numbering">
            <NumberingError isVisible={hasLoadError} onRetry={retryLoad} />
            <NumberingEmpty isVisible={isReady && !hasLoadError && rows.length === 0} />
            <NumberingCards rows={rows} isAdmin={isAdmin} isVisible={!hasLoadError} />
        </View>
    )
}
