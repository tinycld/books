import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import type { Control } from 'react-hook-form'
import { Text, View } from 'react-native'
import type { DepositForm, DepositLineFocus } from '../../hooks/useDepositForm'
import { canAddLine, itemAmountText } from '../../lib/deposit'
import type { DepositAccountRow } from '../../lib/deposit-accounts'
import { depositLinesMinWidth } from '../../lib/deposit-columns'
import {
    DEPOSIT_FORM_DESCRIPTIONS,
    DEPOSIT_FORM_KEYS,
    DEPOSIT_SHORTCUT_GROUP,
} from '../../lib/deposit-shortcuts'
import { DEPOSIT_MESSAGES } from '../../lib/deposit-texts'
import type { DepositFormValues } from '../../lib/deposit-values'
import { TotalLine } from '../payments/PaymentTotals'
import { OtherFundsCards } from './OtherFundsCards'
import { OtherFundsTable } from './OtherFundsTable'

const TOTALS_WIDTH = { minWidth: 320 }

const ADD_LINE_SHORTCUT = {
    keys: DEPOSIT_FORM_KEYS.addLine,
    scope: 'compose',
    allowInInputs: true,
    group: DEPOSIT_SHORTCUT_GROUP,
} as const

// What a table row and a card read.
export interface OtherFundsLinesProps {
    fields: DepositForm['lineFields']
    control: Control<DepositFormValues>
    accounts: readonly DepositAccountRow[]
    depositTo: string
    currency: string
    isDisabled: boolean
    lineFocus: DepositLineFocus
}

function LinesBody({ isCards, ...lines }: OtherFundsLinesProps & { isCards: boolean }) {
    if (lines.fields.length === 0) return null
    if (isCards) return <OtherFundsCards {...lines} />
    return <OtherFundsTable {...lines} />
}

// A sum below zero reads "−$6.60" in the danger tone, as DepositTotals does.
function LinesTotal({
    isVisible,
    cents,
    currency,
}: {
    isVisible: boolean
    cents: number
    currency: string
}) {
    if (!isVisible) return null
    const text = itemAmountText(cents, currency)
    return (
        <View className="self-end" style={TOTALS_WIDTH}>
            <TotalLine
                label="Other funds"
                amount={text}
                isStrong={false}
                isDanger={cents < 0}
                testID="deposit-lines-total"
            />
        </View>
    )
}

function LimitHint({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="deposit-lines-limit" className="text-xs text-muted-foreground">
            {DEPOSIT_MESSAGES.lineLimit}
        </Text>
    )
}

interface OtherFundsSectionProps {
    depositForm: DepositForm
    accounts: readonly DepositAccountRow[]
    currency: string
    // A save, post or delete runs: every field and button waits for it.
    isWriting: boolean
    // depositFormKeysOffered lists `addLine` (a writer, under the line limit).
    canAdd: boolean
    scopeOwner: ScopeOwner
}

/**
 * The Other funds section (bank deposit spec §3.5): its heading and hint, the lines (the
 * table at or above `depositLinesMinWidth`, from the section's own width, and cards below
 * it; nothing while the deposit has no line), then Add line (⌥↵, a ShortcutButton in the
 * screen's scope) and the lines' total, shown only with lines. At 100 lines Add line is
 * disabled and the limit hint shows.
 */
export function OtherFundsSection({
    depositForm,
    accounts,
    currency,
    isWriting,
    canAdd,
    scopeOwner,
}: OtherFundsSectionProps) {
    const { width, onLayout } = useContainerWidth()
    const isCards = width > 0 && width < depositLinesMinWidth
    const fields = depositForm.lineFields
    const hasLines = fields.length > 0
    const isAtLimit = !canAddLine(fields.length)
    return (
        <View testID="deposit-other-funds" className="gap-2" onLayout={onLayout}>
            <View className="gap-1">
                <Text className="text-sm font-semibold text-foreground">Other funds</Text>
                <Text className="text-xs text-muted-foreground">
                    {DEPOSIT_MESSAGES.otherFundsHint}
                </Text>
            </View>
            <LinesBody
                isCards={isCards}
                fields={fields}
                control={depositForm.form.control}
                accounts={accounts}
                depositTo={depositForm.values.deposit_to}
                currency={currency}
                isDisabled={isWriting}
                lineFocus={depositForm.lineFocus}
            />
            <View className="flex-row flex-wrap items-start justify-between gap-2">
                <View ref={depositForm.lineFocus.addLineRef}>
                    <ShortcutButton
                        label={DEPOSIT_FORM_DESCRIPTIONS.addLine}
                        shortcut={ADD_LINE_SHORTCUT}
                        onPress={depositForm.lineFocus.add}
                        variant="outline"
                        isDisabled={isWriting || !canAdd}
                        testID="deposit-add-line"
                        scopeOwner={scopeOwner}
                    />
                </View>
                <LinesTotal
                    isVisible={hasLines}
                    cents={depositForm.totals.linesTotal}
                    currency={currency}
                />
            </View>
            <LimitHint isVisible={isAtLimit} />
        </View>
    )
}
