import { Button, ButtonSpinner, ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { Text, View } from 'react-native'
import type { BankImportFlow } from '../../../hooks/useBankImportFlow'
import { errorBandText } from '../../../lib/bank-import-view'
import type { BooksBankFiles } from '../../../types'
import { BankImportMessage, BankImportToBanking } from './BankImportMessage'
import { BankImportRowList } from './BankImportRowList'

// A CSV file's rows are read with the person's mapping, so a new mapping may read them.
function ChangeMappingButton({
    isVisible,
    isDisabled = false,
    size,
    onPress,
}: {
    isVisible: boolean
    isDisabled?: boolean
    size?: 'sm'
    onPress: () => void
}) {
    if (!isVisible) return null
    return (
        <Button
            testID="bank-import-change-mapping"
            variant="outline"
            size={size}
            className="min-h-11"
            isDisabled={isDisabled}
            onPress={onPress}
        >
            <ButtonText>Change mapping</ButtonText>
        </Button>
    )
}

function ErrorBand({
    count,
    format,
    isBusy,
    onChangeMapping,
}: {
    count: number
    format: BooksBankFiles['format']
    isBusy: boolean
    onChangeMapping: () => void
}) {
    if (count === 0) return null
    const text = errorBandText(count, format)
    const isCsv = format === 'csv'
    return (
        <View
            testID="bank-import-band"
            className="flex-row flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3"
        >
            <Text className="min-w-0 shrink text-sm text-foreground">{text}</Text>
            <ChangeMappingButton
                isVisible={isCsv}
                isDisabled={isBusy}
                size="sm"
                onPress={onChangeMapping}
            />
        </View>
    )
}

// CSV goes back one step to its mapping, keeping the choice; OFX has no mapping, so it
// leaves for Banking.
function BackOrCancel({
    format,
    isBusy,
    onBack,
    onCancel,
}: {
    format: BooksBankFiles['format']
    isBusy: boolean
    onBack: () => void
    onCancel: () => void
}) {
    if (format === 'csv') {
        return (
            <Button
                testID="bank-import-step-back"
                variant="outline"
                className="min-h-11"
                isDisabled={isBusy}
                onPress={onBack}
            >
                <ButtonText>Back</ButtonText>
            </Button>
        )
    }
    return (
        <Button
            testID="bank-import-cancel"
            variant="outline"
            className="min-h-11"
            isDisabled={isBusy}
            onPress={onCancel}
        >
            <ButtonText>Cancel</ButtonText>
        </Button>
    )
}

function ImportButtonContent({ isBusy, text }: { isBusy: boolean; text: string }) {
    if (isBusy) {
        return (
            <>
                <ButtonSpinner />
                <ButtonText>Importing…</ButtonText>
            </>
        )
    }
    return <ButtonText>{text}</ButtonText>
}

interface ChooseStepProps {
    flow: BankImportFlow
    format: BooksBankFiles['format']
    isWide: boolean
}

export function ChooseStep({ flow, format, isWide }: ChooseStepProps) {
    // "Is the first row a header?" may be wrong, so an empty CSV file offers its mapping.
    const isCsv = format === 'csv'
    if (flow.nothing === 'empty') {
        return (
            <BankImportMessage testID="bank-import-empty" text="This file has no transactions.">
                <BankImportToBanking onPress={flow.onCancel} />
                <ChangeMappingButton isVisible={isCsv} onPress={flow.onChangeMapping} />
            </BankImportMessage>
        )
    }
    if (flow.nothing === 'allImported') {
        return (
            <BankImportMessage
                testID="bank-import-all-imported"
                text="Every transaction in this file is already imported."
            >
                <BankImportToBanking onPress={flow.onCancel} />
            </BankImportMessage>
        )
    }
    return (
        <View testID="bank-import-choose" className="gap-3">
            <Text testID="bank-import-summary" className="text-sm text-foreground">
                {flow.summary.text}
                <Text className="text-muted-foreground">{flow.summary.tail}</Text>
            </Text>
            <ErrorBand
                count={flow.errorCount}
                format={format}
                isBusy={flow.isBusy}
                onChangeMapping={flow.onChangeMapping}
            />
            <Text testID="bank-import-selection" className="text-sm font-medium text-foreground">
                {flow.selection}
            </Text>
            <BankImportRowList
                rows={flow.rows}
                isWide={isWide}
                isBusy={flow.isBusy}
                selectState={flow.selectState}
                onToggle={flow.onToggle}
                onToggleAll={flow.onToggleAll}
            />
            <FormErrorSummary
                testID="bank-import-form-errors"
                errors={flow.form.formState.errors}
                isEnabled={flow.isSubmitted}
                showFieldNames={false}
            />
            <View className="flex-row justify-end gap-2">
                <BackOrCancel
                    format={format}
                    isBusy={flow.isBusy}
                    onBack={flow.onBack}
                    onCancel={flow.onCancel}
                />
                <ServerActionButton
                    testID="bank-import-submit"
                    className="min-h-11"
                    isDisabled={flow.isBusy}
                    onPress={flow.onImport}
                >
                    <ImportButtonContent isBusy={flow.isBusy} text={flow.submitText} />
                </ServerActionButton>
            </View>
        </View>
    )
}
