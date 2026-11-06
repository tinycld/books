import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { NO_ACTIVE_RATES, NO_RATES } from '../../lib/tax-messages'
import type { AgencyCardView, TaxRowView } from '../../lib/taxes-view'
import { TaxBadge } from './TaxBadge'
import { TaxRow } from './TaxRow'

interface AgencyCardProps {
    card: AgencyCardView
    menu: ReactNode
    footer: ReactNode
    renderRowTrailing(row: TaxRowView): ReactNode
}

// With no row shown, the card says whether the agency has no rate at all or only
// inactive ones that Show inactive hides.
function noRatesLine({ id, rates, hasRates }: AgencyCardView) {
    if (rates.length > 0) return null
    if (!hasRates) return { text: NO_RATES, testID: `tax-agency-no-rates-${id}` }
    return { text: NO_ACTIVE_RATES, testID: `tax-agency-no-active-rates-${id}` }
}

function NoRates({ card }: { card: AgencyCardView }) {
    const line = noRatesLine(card)
    if (!line) return null
    return (
        <Text testID={line.testID} className="py-3 text-sm text-muted-foreground">
            {line.text}
        </Text>
    )
}

export function AgencyCard({ card, menu, footer, renderRowTrailing }: AgencyCardProps) {
    const { id } = card
    // The texts are muted, not the badge, so the Inactive badge keeps its own contrast.
    const dim = card.inactive ? 'opacity-60' : ''
    const rows = card.rates.map(row => (
        <TaxRow key={row.id} row={row} trailing={renderRowTrailing(row)} />
    ))
    return (
        <View
            testID={`tax-agency-card-${id}`}
            className="rounded-xl border border-border bg-surface-secondary p-4"
        >
            <View className="flex-row items-start gap-2">
                <View className="min-w-0 flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                        <Text
                            testID={`tax-agency-title-${id}`}
                            className={`min-w-0 shrink text-base font-bold text-foreground ${dim}`}
                        >
                            {card.name}
                        </Text>
                        <TaxBadge
                            isVisible={card.inactive}
                            label="Inactive"
                            tone="muted"
                            testID={`tax-agency-inactive-${id}`}
                        />
                    </View>
                    <Text
                        testID={`tax-agency-account-${id}`}
                        className={`text-sm text-muted-foreground ${dim}`}
                    >
                        {card.accountLine}
                    </Text>
                </View>
                {menu}
            </View>
            <View className="mt-2">{rows}</View>
            <NoRates card={card} />
            {footer}
        </View>
    )
}
