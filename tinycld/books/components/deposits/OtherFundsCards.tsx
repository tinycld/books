import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import {
    LineAccountField,
    LineAmountField,
    LineDescriptionField,
    LinePartyField,
    lineHandlers,
    RemoveLineButton,
} from './OtherFundsLineFields'
import type { OtherFundsLinesProps } from './OtherFundsSection'

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
    return (
        <View className="min-w-0">
            <Text className="mb-1 text-sm font-semibold text-foreground">{label}</Text>
            {children}
        </View>
    )
}

type LineCardProps = Omit<OtherFundsLinesProps, 'fields'> & { id: string; index: number }

function LineCard({
    id,
    index,
    control,
    accounts,
    depositTo,
    currency,
    isDisabled,
    lineFocus,
}: LineCardProps) {
    const field = { control, index, isDisabled }
    const handlers = lineHandlers(lineFocus, id, index)
    const heading = `Line ${index + 1}`
    return (
        <View
            testID={`deposit-line-${index}`}
            className="gap-3 rounded-xl border border-border bg-background p-3"
            onFocus={handlers.onFocus}
            onBlur={handlers.onBlur}
        >
            <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-foreground">{heading}</Text>
                <RemoveLineButton
                    index={index}
                    isDisabled={isDisabled}
                    onPress={handlers.onRemove}
                />
            </View>
            <FieldLabel label="Received from">
                <LinePartyField {...field} triggerRef={handlers.partyRef} />
            </FieldLabel>
            <FieldLabel label="Account">
                <LineAccountField {...field} accounts={accounts} depositTo={depositTo} />
            </FieldLabel>
            <FieldLabel label="Description">
                <LineDescriptionField {...field} />
            </FieldLabel>
            <FieldLabel label="Amount">
                <LineAmountField {...field} currency={currency} onNext={handlers.onNext} />
            </FieldLabel>
        </View>
    )
}

/**
 * The other funds lines as cards (bank deposit spec §3.5), below the table's least width:
 * one card per line, "Line N" with Remove in its first row, then Received from, Account,
 * Description and Amount stacked, each with its label.
 */
export function OtherFundsCards({ fields, ...line }: OtherFundsLinesProps) {
    const cards = fields.map((row, index) => (
        <LineCard key={row.key} id={row.id} index={index} {...line} />
    ))
    return (
        <View testID="deposit-lines-cards" className="gap-3">
            {cards}
        </View>
    )
}
