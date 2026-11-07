import { Button, ButtonText } from '@tinycld/core/ui/button'
import {
    type Control,
    FormErrorSummary,
    SelectInput,
    type SelectOption,
} from '@tinycld/core/ui/form'
import { Text, View, type ViewStyle } from 'react-native'
import type { BankImportFlow } from '../../../hooks/useBankImportFlow'
import type { BankImportFormValues } from '../../../lib/bank-import-form'
import { AMOUNT_COLUMNS_OPTIONS, HEADER_OPTIONS, SIGN_OPTIONS } from '../../../lib/bank-import-view'
import { MappingPreview } from './MappingPreview'
import { SampleTable } from './SampleTable'

const COLUMN_PLACEHOLDER = 'Choose a column'
const CHOICE_PLACEHOLDER = 'Choose one'
const WIDE_FIELD: ViewStyle = { flexGrow: 1, flexBasis: 240, minWidth: 220 }
const PHONE_FIELD: ViewStyle = {}
const WIDE_QUESTIONS: ViewStyle = { flex: 1, minWidth: 0 }
const SAMPLE_WIDTH = 480

function SectionHeading({ text }: { text: string }) {
    return <Text className="text-base font-semibold text-foreground">{text}</Text>
}

interface FieldsProps {
    control: Control<BankImportFormValues>
    options: SelectOption[]
    fieldStyle: ViewStyle
    onAnswerChange: () => void
}

function OneAmountFields({
    isVisible,
    control,
    options,
    fieldStyle,
    onAnswerChange,
}: FieldsProps & { isVisible: boolean }) {
    if (!isVisible) return null
    const wrapperProps = { style: fieldStyle }
    return (
        <>
            <SelectInput
                testID="bank-import-f-amount"
                control={control}
                name="amount_column"
                label="Amount"
                options={options}
                placeholder={COLUMN_PLACEHOLDER}
                wrapperProps={wrapperProps}
                onValueChange={onAnswerChange}
            />
            <SelectInput
                testID="bank-import-f-sign"
                control={control}
                name="amount_sign"
                label="Positive amounts are"
                options={SIGN_OPTIONS}
                placeholder={CHOICE_PLACEHOLDER}
                wrapperProps={wrapperProps}
                onValueChange={onAnswerChange}
            />
        </>
    )
}

function TwoAmountFields({
    isVisible,
    control,
    options,
    fieldStyle,
    onAnswerChange,
}: FieldsProps & { isVisible: boolean }) {
    if (!isVisible) return null
    const wrapperProps = { style: fieldStyle }
    return (
        <>
            <SelectInput
                testID="bank-import-f-in"
                control={control}
                name="money_in_column"
                label="Money in"
                options={options}
                placeholder={COLUMN_PLACEHOLDER}
                wrapperProps={wrapperProps}
                onValueChange={onAnswerChange}
            />
            <SelectInput
                testID="bank-import-f-out"
                control={control}
                name="money_out_column"
                label="Money out"
                options={options}
                placeholder={COLUMN_PLACEHOLDER}
                wrapperProps={wrapperProps}
                onValueChange={onAnswerChange}
            />
        </>
    )
}

// The amount selects of the layout the person chose; none until they choose one.
function AmountFields({ amountColumns, ...props }: FieldsProps & { amountColumns: string }) {
    const isOne = amountColumns === 'one'
    const isTwo = amountColumns === 'two'
    return (
        <>
            <OneAmountFields isVisible={isOne} {...props} />
            <TwoAmountFields isVisible={isTwo} {...props} />
        </>
    )
}

function Questions({ flow, isWide }: { flow: BankImportFlow; isWide: boolean }) {
    const { control } = flow.form
    const { map } = flow
    const fieldStyle = isWide ? WIDE_FIELD : PHONE_FIELD
    const wrapperProps = { style: fieldStyle }
    const rowClass = isWide ? 'flex-row flex-wrap gap-x-4' : ''
    const columnStyle = isWide ? WIDE_QUESTIONS : undefined
    return (
        <View className="gap-4" style={columnStyle}>
            <View className="gap-2">
                <SectionHeading text="About your file" />
                <View className={rowClass}>
                    <SelectInput
                        testID="bank-import-q-header"
                        control={control}
                        name="header_row"
                        label="Is the first row a header?"
                        options={HEADER_OPTIONS}
                        placeholder={CHOICE_PLACEHOLDER}
                        wrapperProps={wrapperProps}
                        onValueChange={map.onAnswerChange}
                    />
                    <SelectInput
                        testID="bank-import-q-amounts"
                        control={control}
                        name="amount_columns"
                        label="How many columns show amounts?"
                        options={AMOUNT_COLUMNS_OPTIONS}
                        placeholder={CHOICE_PLACEHOLDER}
                        wrapperProps={wrapperProps}
                        onValueChange={map.onAnswerChange}
                    />
                    <SelectInput
                        testID="bank-import-q-format"
                        control={control}
                        name="date_format"
                        label="What date format does your file use?"
                        options={map.dateOptions}
                        placeholder={CHOICE_PLACEHOLDER}
                        wrapperProps={wrapperProps}
                        onValueChange={map.onAnswerChange}
                    />
                </View>
            </View>
            <View className="gap-2">
                <SectionHeading text="Match the columns" />
                <View className={rowClass}>
                    <SelectInput
                        testID="bank-import-f-date"
                        control={control}
                        name="date_column"
                        label="Date"
                        options={map.columnOptions}
                        placeholder={COLUMN_PLACEHOLDER}
                        wrapperProps={wrapperProps}
                        onValueChange={map.onAnswerChange}
                    />
                    <SelectInput
                        testID="bank-import-f-description"
                        control={control}
                        name="description_column"
                        label="Description"
                        options={map.columnOptions}
                        placeholder={COLUMN_PLACEHOLDER}
                        wrapperProps={wrapperProps}
                        onValueChange={map.onAnswerChange}
                    />
                    <AmountFields
                        amountColumns={map.amountColumns}
                        control={control}
                        options={map.columnOptions}
                        fieldStyle={fieldStyle}
                        onAnswerChange={map.onAnswerChange}
                    />
                </View>
            </View>
            <MappingPreview preview={map.preview} />
        </View>
    )
}

function MapBody({ flow, isWide }: { flow: BankImportFlow; isWide: boolean }) {
    const { sample } = flow.map
    const table = (
        <SampleTable rows={sample.rows} columns={sample.columns} headerRow={sample.headerRow} />
    )
    const questions = <Questions flow={flow} isWide={isWide} />
    if (isWide) {
        return (
            <View className="flex-row items-start gap-6">
                {questions}
                <View style={{ width: SAMPLE_WIDTH }}>{table}</View>
            </View>
        )
    }
    return (
        <View className="gap-4">
            {table}
            {questions}
        </View>
    )
}

// The Map columns step of a CSV file: the sample, the questions with Books' first answers,
// the first rows read with them, and Continue to the Choose step.
export function MapColumnsStep({ flow, isWide }: { flow: BankImportFlow; isWide: boolean }) {
    const onContinue = () => {
        void flow.onContinue()
    }
    return (
        <View testID="bank-import-map" className="gap-4">
            <Text testID="bank-import-intro" className="text-sm text-foreground">
                {flow.map.intro}
            </Text>
            <MapBody flow={flow} isWide={isWide} />
            <FormErrorSummary
                testID="bank-import-form-errors"
                errors={flow.map.errors}
                isEnabled={flow.map.continueTried}
                showFieldNames={false}
            />
            <View className="flex-row justify-end gap-2">
                <Button
                    testID="bank-import-cancel"
                    variant="outline"
                    className="min-h-11"
                    onPress={flow.onCancel}
                >
                    <ButtonText>Cancel</ButtonText>
                </Button>
                <Button testID="bank-import-continue" className="min-h-11" onPress={onContinue}>
                    <ButtonText>Continue</ButtonText>
                </Button>
            </View>
        </View>
    )
}
