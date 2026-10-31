import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ChevronRight } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import {
    type TrackedVendorRow,
    trackedVendorRows,
    trackedVendorsSummary,
} from '../../lib/tracked-vendors'
import { CardEmptyState } from './CardEmptyState'
import { SectionCard } from './SectionCard'

const VENDORS_EMPTY = 'No vendors are tracked for 1099 yet.'
const VENDORS_EMPTY_HINT = 'Turn on Track payments for 1099 on a vendor.'

interface Tracked1099VendorsCardProps {
    vendors: Parameters<typeof trackedVendorRows>[0]
    onOpen(id: string): void
    onOpenVendors(): void
}

function VendorDetail({ detail }: { detail: string }) {
    if (detail === '') return null
    return (
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {detail}
        </Text>
    )
}

function TaxIdStatus({ row }: { row: TrackedVendorRow }) {
    if (row.lastFour !== null) {
        return (
            <Text
                className="text-sm tabular-nums text-foreground"
                testID={`books-1099-vendor-last-four-${row.id}`}
            >
                {row.lastFour}
            </Text>
        )
    }
    return (
        <View
            className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5"
            testID={`books-1099-vendor-missing-${row.id}`}
        >
            <Text className="text-xs font-medium text-foreground">Missing tax ID</Text>
        </View>
    )
}

function TrackedVendorItem({ row, onOpen }: { row: TrackedVendorRow; onOpen(id: string): void }) {
    const chevronColor = useThemeColor('muted-foreground')
    return (
        <Pressable
            accessibilityRole="button"
            testID={`books-1099-vendor-row-${row.id}`}
            onPress={() => onOpen(row.id)}
            className="min-h-14 flex-row items-center gap-3 border-b border-border py-2"
        >
            <View className="min-w-0 flex-1 gap-0.5">
                <Text
                    className="text-sm text-foreground"
                    numberOfLines={1}
                    testID={`books-1099-vendor-name-${row.id}`}
                >
                    {row.name}
                </Text>
                <VendorDetail detail={row.detail} />
            </View>
            <TaxIdStatus row={row} />
            <ChevronRight size={16} color={chevronColor} />
        </Pressable>
    )
}

function TrackedVendorRows({
    isVisible,
    rows,
    onOpen,
}: {
    isVisible: boolean
    rows: TrackedVendorRow[]
    onOpen(id: string): void
}) {
    if (!isVisible) return null
    // Not windowed: only tracked vendors are listed, dozens in practice.
    const items = rows.map(row => <TrackedVendorItem key={row.id} row={row} onOpen={onOpen} />)
    return (
        <>
            <Text className="text-xs text-muted-foreground" testID="books-1099-vendors-summary">
                {trackedVendorsSummary(rows)}
            </Text>
            <View className="mt-1">{items}</View>
        </>
    )
}

export function Tracked1099VendorsCard({
    vendors,
    onOpen,
    onOpenVendors,
}: Tracked1099VendorsCardProps) {
    const rows = trackedVendorRows(vendors)
    const hasRows = rows.length > 0
    return (
        <SectionCard title="1099 vendors">
            <View testID="books-1099-vendors">
                <TrackedVendorRows isVisible={hasRows} rows={rows} onOpen={onOpen} />
                <CardEmptyState
                    isVisible={!hasRows}
                    title={VENDORS_EMPTY}
                    hint={VENDORS_EMPTY_HINT}
                    action="Vendors"
                    testID="books-1099-vendors-empty"
                    actionTestID="books-1099-vendors-open"
                    onAction={onOpenVendors}
                />
            </View>
        </SectionCard>
    )
}
