import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { SelectInput } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import type { ReactNode } from 'react'
import { type Control, useController } from 'react-hook-form'
import { Text, View, type ViewStyle } from 'react-native'
import type { CreateStatementsFormValues } from '../../hooks/useCreateStatementsForm'
import { STATEMENT_BALANCE_LABELS, STATEMENT_TYPE_LABELS } from '../../lib/statement-texts'

const BAND = 'rounded-xl border border-border bg-surface-secondary p-4'
const NO_MARGIN = { className: 'gap-1.5' }

const TYPE_OPTIONS = [
    { label: STATEMENT_TYPE_LABELS.balance_forward, value: 'balance_forward' },
    { label: STATEMENT_TYPE_LABELS.open_items, value: 'open_items' },
]
const FILTER_OPTIONS = [
    { label: STATEMENT_BALANCE_LABELS.open, value: 'open' },
    { label: STATEMENT_BALANCE_LABELS.overdue, value: 'overdue' },
    { label: STATEMENT_BALANCE_LABELS.all, value: 'all' },
]

const OPTION_WIDTHS = {
    type: { width: 190 },
    date: { width: 152 },
    filter: { width: 150 },
} as const

type DateName = 'statementDate' | 'startDate' | 'endDate'

function DateError({ message }: { message?: string }) {
    if (!message) return null
    return <Text className="text-xs text-danger">{message}</Text>
}

type OptionsControl = Control<CreateStatementsFormValues>

interface DateOptionProps {
    control: OptionsControl
    name: DateName
    label: string
    testID: string
    isDisabled: boolean
    // Called after the field's own value changed, with the new text.
    onDateChange?: (value: string) => void
}

// Core DateField reports a cleared field as null; the schema's date is a string, so a
// cleared field reaches it as '' and shows "Enter a date" under the field.
function DateOption({ control, name, label, testID, isDisabled, onDateChange }: DateOptionProps) {
    const { field, fieldState } = useController({ control, name })
    const change = (next: string | null) => {
        const value = next ?? ''
        field.onChange(value)
        onDateChange?.(value)
    }
    return (
        <View className="min-w-0 gap-1.5">
            <Text className="text-sm font-semibold text-foreground">{label}</Text>
            <DateField
                value={field.value || null}
                onChange={change}
                withTime={false}
                disabled={isDisabled}
                accessibilityLabel={label}
                testID={testID}
            />
            <DateError message={fieldState.error?.message} />
        </View>
    )
}

// One option of the band: its fixed width on a wide screen, a share of the line on a phone.
function OptionSlot({
    isVisible = true,
    style,
    children,
}: {
    isVisible?: boolean
    style: ViewStyle | undefined
    children: ReactNode
}) {
    if (!isVisible) return null
    const fill = style === undefined ? 'min-w-0 flex-1' : 'min-w-0'
    return (
        <View className={fill} style={style}>
            {children}
        </View>
    )
}

function PeriodLine({
    isVisible,
    start,
    end,
}: {
    isVisible: boolean
    start: ReactNode
    end: ReactNode
}) {
    if (!isVisible) return null
    return (
        <View className="flex-row gap-3">
            <OptionSlot style={undefined}>{start}</OptionSlot>
            <OptionSlot style={undefined}>{end}</OptionSlot>
        </View>
    )
}

interface StatementOptionsProps {
    control: OptionsControl
    hasPeriod: boolean
    isDisabled: boolean
    onStatementDateChange(value: string): void
    // The user typed or picked a day in End date.
    onEndDateChange(): void
}

/**
 * The options band of Create statements (spec §3.2): Statement type (focus starts on it),
 * Statement date, Start date and End date (Balance forward only) and Customer balance; one
 * wrapping row on a wide screen, two to a line on a phone. Each date's error shows under it.
 */
export function StatementOptions(props: StatementOptionsProps) {
    const { control, hasPeriod, isDisabled, onStatementDateChange, onEndDateChange } = props
    const isPhone = useBreakpoint() === 'mobile'
    const widths = isPhone ? undefined : OPTION_WIDTHS
    const typeSelect = (
        <SelectInput
            control={control}
            name="type"
            label="Statement type"
            options={TYPE_OPTIONS}
            disabled={isDisabled}
            wrapperProps={NO_MARGIN}
            testID="statements-type"
            autoFocus
        />
    )
    const filterSelect = (
        <SelectInput
            control={control}
            name="balanceFilter"
            label="Customer balance"
            options={FILTER_OPTIONS}
            disabled={isDisabled}
            wrapperProps={NO_MARGIN}
            testID="statements-filter"
        />
    )
    const statementDate = (
        <DateOption
            control={control}
            name="statementDate"
            label="Statement date"
            testID="statements-date"
            isDisabled={isDisabled}
            onDateChange={onStatementDateChange}
        />
    )
    const startDate = (
        <DateOption
            control={control}
            name="startDate"
            label="Start date"
            testID="statements-start"
            isDisabled={isDisabled}
        />
    )
    const endDate = (
        <DateOption
            control={control}
            name="endDate"
            label="End date"
            testID="statements-end"
            isDisabled={isDisabled}
            onDateChange={onEndDateChange}
        />
    )
    if (isPhone) {
        return (
            <View testID="statements-options" className={`${BAND} gap-3`}>
                <View className="flex-row gap-3">
                    <OptionSlot style={undefined}>{typeSelect}</OptionSlot>
                    <OptionSlot style={undefined}>{statementDate}</OptionSlot>
                </View>
                <PeriodLine isVisible={hasPeriod} start={startDate} end={endDate} />
                {filterSelect}
            </View>
        )
    }
    return (
        <View
            testID="statements-options"
            className={`${BAND} flex-row flex-wrap items-start gap-4`}
        >
            <OptionSlot style={widths?.type}>{typeSelect}</OptionSlot>
            <OptionSlot style={widths?.date}>{statementDate}</OptionSlot>
            <OptionSlot isVisible={hasPeriod} style={widths?.date}>
                {startDate}
            </OptionSlot>
            <OptionSlot isVisible={hasPeriod} style={widths?.date}>
                {endDate}
            </OptionSlot>
            <OptionSlot style={widths?.filter}>{filterSelect}</OptionSlot>
        </View>
    )
}
