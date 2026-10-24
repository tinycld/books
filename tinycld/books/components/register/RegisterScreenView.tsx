import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import type { RegisterScreenModel } from '../../hooks/useRegisterScreen'
import { RegisterEmptyState } from './RegisterEmptyState'
import { BackOnlyHeader, RegisterHeader } from './RegisterHeader'
import { RegisterTable } from './RegisterTable'

function LoadingBody({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="register-loading" className="flex-1">
            <LoadingState />
        </View>
    )
}

function ErrorBody({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View testID="register-error" accessibilityRole="alert" className="items-center gap-3 p-6">
            <Text className="text-base font-medium text-foreground">
                Could not load this register
            </Text>
            <Button
                testID="register-retry"
                variant="outline"
                style={{ minHeight: 44 }}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function EmptyBody({ model }: { model: RegisterScreenModel }) {
    if (model.state !== 'empty' && model.state !== 'empty-range') return null
    return (
        <RegisterEmptyState
            kind={model.state}
            canCreate={model.isNewEntryVisible}
            onNewEntry={model.onNewEntry}
            onShowFiscalYear={() => model.onPreset('this-fiscal-year')}
            isOtherPresetSelected={model.isOtherPresetSelected}
        />
    )
}

function TableBody({ model }: { model: RegisterScreenModel }) {
    if (model.state !== 'ready') return null
    return (
        <View className="min-w-0 flex-1">
            <RegisterTable
                rows={model.register.rows}
                showOpeningRow={model.register.showOpeningRow}
                openingBalance={model.register.openingBalance}
                currency={model.currency}
                order={model.order}
                onToggleOrder={model.onToggleOrder}
                onOpenEntry={model.onOpenEntry}
                selectedEntryId={model.selectedEntryId}
            />
        </View>
    )
}

function NotFound({ model }: { model: RegisterScreenModel }) {
    return (
        <View className="flex-1 bg-background">
            <BackOnlyHeader onBack={model.onBack} />
            <View className="items-center p-8">
                <Text testID="register-not-found" className="text-base text-foreground">
                    This account does not exist
                </Text>
            </View>
        </View>
    )
}

export function RegisterScreenView(model: RegisterScreenModel) {
    if (model.state === 'not-found') return <NotFound model={model} />
    return (
        <View className="flex-1 bg-background">
            <RegisterHeader model={model} />
            <LoadingBody isVisible={model.state === 'loading'} />
            <ErrorBody isVisible={model.state === 'error'} onRetry={model.onRetry} />
            <EmptyBody model={model} />
            <TableBody model={model} />
        </View>
    )
}
