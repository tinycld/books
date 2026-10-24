import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'

interface RegisterEmptyStateProps {
    kind: 'empty' | 'empty-range'
    canCreate: boolean
    onNewEntry(): void
    onShowFiscalYear(): void
    isOtherPresetSelected: boolean
}

function NewEntryAction({ isVisible, onNewEntry }: { isVisible: boolean; onNewEntry: () => void }) {
    if (!isVisible) return null
    return (
        <Button style={{ minHeight: 44 }} onPress={onNewEntry}>
            <ButtonText>New journal entry</ButtonText>
        </Button>
    )
}

function NoCreateNote({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text className="text-center text-sm text-muted-foreground">
            Transactions appear here once journal entries are posted.
        </Text>
    )
}

function EmptyAccount({
    canCreate,
    onNewEntry,
}: Pick<RegisterEmptyStateProps, 'canCreate' | 'onNewEntry'>) {
    return (
        <View testID="register-empty" className="items-center gap-3 p-8">
            <Text className="text-base font-medium text-foreground">No transactions yet</Text>
            <NewEntryAction isVisible={canCreate} onNewEntry={onNewEntry} />
            <NoCreateNote isVisible={!canCreate} />
        </View>
    )
}

function ShowFiscalYearAction({
    isVisible,
    onShowFiscalYear,
}: {
    isVisible: boolean
    onShowFiscalYear: () => void
}) {
    if (!isVisible) return null
    return (
        <Button
            testID="register-show-fiscal-year"
            variant="outline"
            style={{ minHeight: 44 }}
            onPress={onShowFiscalYear}
        >
            <ButtonText>Show this fiscal year</ButtonText>
        </Button>
    )
}

function EmptyRange({
    isOtherPresetSelected,
    onShowFiscalYear,
}: Pick<RegisterEmptyStateProps, 'isOtherPresetSelected' | 'onShowFiscalYear'>) {
    return (
        <View testID="register-empty-range" className="items-center gap-3 p-8">
            <Text className="text-base font-medium text-foreground">
                No transactions in this range
            </Text>
            <ShowFiscalYearAction
                isVisible={isOtherPresetSelected}
                onShowFiscalYear={onShowFiscalYear}
            />
        </View>
    )
}

export function RegisterEmptyState(props: RegisterEmptyStateProps) {
    if (props.kind === 'empty') {
        return <EmptyAccount canCreate={props.canCreate} onNewEntry={props.onNewEntry} />
    }
    return (
        <EmptyRange
            isOtherPresetSelected={props.isOtherPresetSelected}
            onShowFiscalYear={props.onShowFiscalYear}
        />
    )
}
