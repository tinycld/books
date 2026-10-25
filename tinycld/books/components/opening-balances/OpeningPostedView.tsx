import { useWindowWidth } from '@tinycld/core/components/workspace/useBreakpoint'
import { type Href, router } from 'expo-router'
import { type ReactNode, useMemo } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { formatMoney } from '../../lib/money'
import {
    amountsFromLines,
    buildOpening,
    centsFromAmounts,
    OPENING_BALANCE_EQUITY_NAME,
    type OpeningAccount,
    type OpeningBand,
    type OpeningBuild,
    type SavedLine,
} from '../../lib/opening-balances'
import { accountDisplay } from '../accounts/account-display'
import { ColumnHeader, TABLE_MIN_WIDTH } from './OpeningAccountTable'
import { OpeningSectionBand, subtotalTone } from './OpeningSectionBand'
import { OpeningTotals } from './OpeningTotals'
import {
    AMOUNT_STYLE,
    DETAIL_STYLE,
    isWideWindow,
    NAME_STYLE,
    OPENING_ITEM_HEIGHT,
} from './opening-grid-style'

interface PostedRow {
    id: string
    number: string
    name: string
    typeLabel: string
    detailLabel: string
    cents: number
}

interface PostedBand {
    band: OpeningBand
    subtotal: number
    rows: PostedRow[]
}

interface OpeningPostedViewProps {
    bands: OpeningBand[]
    accounts: OpeningAccount[]
    savedLines: SavedLine[]
    equityAccountId: string
    currency: string
    entryHref: Href | null
}

function rowOf(row: OpeningBand['rows'][number], cents: number): PostedRow {
    const { account } = row
    const { typeLabel, detailLabel } = accountDisplay(account.type, account.detail_type)
    return {
        id: account.id,
        number: account.number,
        name: account.name,
        typeLabel,
        detailLabel,
        cents,
    }
}

function balancingRows(build: OpeningBuild): PostedRow[] {
    if (build.totals.balancing === 0) return []
    return [
        {
            id: 'balancing',
            number: '',
            name: OPENING_BALANCE_EQUITY_NAME,
            typeLabel: '',
            detailLabel: '',
            cents: build.totals.balancing,
        },
    ]
}

// Only accounts with an amount are listed, so a chart of hundreds of accounts renders
// at most the number of lines the entry holds.
function postedBands(
    bands: readonly OpeningBand[],
    amounts: Record<string, number>,
    build: OpeningBuild
): PostedBand[] {
    return bands.map(band => {
        const rows = band.rows
            .filter(row => (amounts[row.account.id] ?? 0) !== 0)
            .map(row => rowOf(row, amounts[row.account.id] ?? 0))
        if (band.group === 'asset') return { band, subtotal: build.totals.assets, rows }
        if (band.group === 'liability') return { band, subtotal: build.totals.liabilities, rows }
        return {
            band,
            subtotal: build.totals.equityWithBalancing,
            rows: [...rows, ...balancingRows(build)],
        }
    })
}

function AccountTitle({ row }: { row: PostedRow }) {
    return (
        <View className="min-w-0 flex-row items-baseline gap-2">
            <NumberText number={row.number} />
            <Text className="min-w-0 flex-1 text-sm text-foreground">{row.name}</Text>
        </View>
    )
}

function NumberText({ number }: { number: string }) {
    if (number === '') return null
    return <Text className="text-sm text-muted-foreground">{number}</Text>
}

function AmountText({ cents, currency }: { cents: number; currency: string }) {
    return <Text className={`text-sm ${subtotalTone(cents)}`}>{formatMoney(cents, currency)}</Text>
}

function PostedTableRow({ row, currency }: { row: PostedRow; currency: string }) {
    return (
        <View
            testID={`opening-posted-row-${row.id}`}
            className="flex-row items-center gap-3 border-b border-border px-4 py-3"
        >
            <View style={NAME_STYLE}>
                <AccountTitle row={row} />
            </View>
            <Text style={DETAIL_STYLE} className="text-sm text-muted-foreground">
                {row.detailLabel}
            </Text>
            <View style={AMOUNT_STYLE} className="items-end">
                <AmountText cents={row.cents} currency={currency} />
            </View>
        </View>
    )
}

function TypeLabel({ label }: { label: string }) {
    if (label === '') return null
    return <Text className="text-xs text-muted-foreground">{label}</Text>
}

function PostedCard({ row, currency }: { row: PostedRow; currency: string }) {
    return (
        <View className="px-4 py-1">
            <View
                testID={`opening-posted-row-${row.id}`}
                className="gap-0.5 rounded-lg border border-border bg-background p-2"
            >
                <AccountTitle row={row} />
                <TypeLabel label={row.typeLabel} />
                <View className="items-end">
                    <AmountText cents={row.cents} currency={currency} />
                </View>
            </View>
        </View>
    )
}

function PostedBandSection({
    item,
    currency,
    isWide,
}: {
    item: PostedBand
    currency: string
    isWide: boolean
}) {
    const heights = isWide ? OPENING_ITEM_HEIGHT.wide : OPENING_ITEM_HEIGHT.phone
    const lines: ReactNode[] = []
    for (const row of item.rows) {
        lines.push(
            isWide ? (
                <PostedTableRow key={row.id} row={row} currency={currency} />
            ) : (
                <PostedCard key={row.id} row={row} currency={currency} />
            )
        )
    }
    return (
        <View>
            <OpeningSectionBand
                band={item.band}
                subtotal={item.subtotal}
                currency={currency}
                height={heights.band}
            />
            {lines}
        </View>
    )
}

function ViewEntryLink({ href, isVisible }: { href: Href | null; isVisible: boolean }) {
    if (!isVisible || href === null) return null
    return (
        <View className="px-4 pt-3">
            <Pressable
                testID="opening-view-entry"
                accessibilityRole="link"
                onPress={() => router.push(href)}
                className="self-start justify-center"
                style={{ minHeight: 44 }}
            >
                <Text className="text-sm font-medium text-primary">View journal entry</Text>
            </Pressable>
        </View>
    )
}

// Computed here, not in the screen hook, so only the posted and read-only views pay
// for it; the form reads its own amounts.
function usePostedBands({ bands, accounts, savedLines, equityAccountId }: OpeningPostedViewProps) {
    return useMemo(() => {
        const amounts = centsFromAmounts(amountsFromLines(accounts, savedLines, equityAccountId))
        const build = buildOpening(accounts, amounts)
        return { build, items: postedBands(bands, amounts, build) }
    }, [bands, accounts, savedLines, equityAccountId])
}

function PostedBody({ isWide, children }: { isWide: boolean; children: ReactNode }) {
    if (!isWide) return <View>{children}</View>
    return (
        <ScrollView horizontal contentContainerStyle={{ width: '100%', minWidth: TABLE_MIN_WIDTH }}>
            <View className="flex-1">{children}</View>
        </ScrollView>
    )
}

export function OpeningPostedView(props: OpeningPostedViewProps) {
    const { currency, entryHref } = props
    const isWide = isWideWindow(useWindowWidth())
    const { build, items } = usePostedBands(props)
    const sections = items.map(item => (
        <PostedBandSection key={item.band.group} item={item} currency={currency} isWide={isWide} />
    ))
    return (
        <View testID="opening-posted" className="min-h-0 flex-1">
            <ScrollView className="min-h-0 flex-1">
                <ViewEntryLink href={entryHref} isVisible={entryHref !== null} />
                <PostedBody isWide={isWide}>
                    <ColumnHeader isVisible={isWide} />
                    {sections}
                </PostedBody>
            </ScrollView>
            <OpeningTotals
                build={build}
                currency={currency}
                isBlocked={false}
                blockMessage={null}
            />
        </View>
    )
}
