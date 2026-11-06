import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { GROUPS_HINT } from '../../lib/tax-messages'
import type { TaxRowView } from '../../lib/taxes-view'
import { TaxRow } from './TaxRow'

interface GroupsCardProps {
    rows: TaxRowView[]
    hint: string | null
    renderRowTrailing(row: TaxRowView): ReactNode
}

function NeedRates({ hint }: { hint: string | null }) {
    if (hint === null) return null
    return (
        <Text testID="tax-groups-need-rates" className="py-3 text-sm text-muted-foreground">
            {hint}
        </Text>
    )
}

export function GroupsCard({ rows, hint, renderRowTrailing }: GroupsCardProps) {
    const shown = rows.map(row => (
        <TaxRow key={row.id} row={row} trailing={renderRowTrailing(row)} />
    ))
    return (
        <View
            testID="tax-groups-card"
            className="rounded-xl border border-border bg-surface-secondary p-4"
        >
            <Text className="text-base font-bold text-foreground">Tax groups</Text>
            <Text className="text-sm text-muted-foreground">{GROUPS_HINT}</Text>
            <View className="mt-2">{shown}</View>
            <NeedRates hint={hint} />
        </View>
    )
}
