import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import type { DepositItemRow } from '../../hooks/useDepositRecord'
import { type DepositReadItem, depositReadItems } from '../../lib/deposit'
import { DEPOSIT_ITEM_COLUMNS, depositItemsMinWidth } from '../../lib/deposit-columns'

const TAP = { minHeight: 44 }
const LINK_TAP = { minHeight: 44, maxWidth: '100%' } as const
const HEAD = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const MONEY_CELL = 'text-right text-sm tabular-nums'
const CARD = 'gap-1 rounded-xl border border-border bg-background p-3'
const SECTION_HEADING = 'text-sm font-semibold text-foreground'

// One deposited item as the grid and the cards draw it (lib/deposit.ts).
type ReadItem = DepositReadItem

// The Transaction link: it pushes the item's document (or entry) over the deposit.
function ItemLink({ text, href, testID }: { text: string; href: string; testID: string }) {
    const orgHref = useOrgHref()
    const open = () => router.push(orgHref(href))
    return (
        <Pressable
            testID={testID}
            accessibilityRole="link"
            onPress={open}
            className="justify-center self-start"
            style={LINK_TAP}
        >
            <Text className="text-sm text-primary underline" numberOfLines={1}>
                {text}
            </Text>
        </Pressable>
    )
}

function MutedLine({ text }: { text: string }) {
    if (text === '') return null
    return (
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {text}
        </Text>
    )
}

function GridHeader() {
    const col = DEPOSIT_ITEM_COLUMNS
    return (
        <View className="flex-row items-center gap-3 border-b border-border px-2 py-2">
            <Text className={HEAD} style={col.party}>
                Received from
            </Text>
            <Text className={HEAD} style={col.transaction}>
                Transaction
            </Text>
            <Text className={HEAD} style={col.date}>
                Date
            </Text>
            <Text className={HEAD} style={col.payment}>
                Payment
            </Text>
            <Text className={`${HEAD} text-right`} style={col.amount}>
                Amount
            </Text>
        </View>
    )
}

// The read grid has no tick column: its cells are the form grid's data columns.
function GridRow({ item }: { item: ReadItem }) {
    const col = DEPOSIT_ITEM_COLUMNS
    return (
        <View
            testID={`deposit-read-item-${item.id}`}
            className="flex-row items-start gap-3 border-b border-border px-2 py-1"
        >
            <View className="justify-center" style={[col.party, TAP]}>
                <Text className="text-sm text-foreground" numberOfLines={1}>
                    {item.party}
                </Text>
            </View>
            <View style={col.transaction}>
                <ItemLink
                    text={item.label}
                    href={item.href}
                    testID={`deposit-item-link-${item.lineId}`}
                />
                <MutedLine text={item.account} />
            </View>
            <View className="justify-center" style={[col.date, TAP]}>
                <Text className="text-sm text-foreground" numberOfLines={1}>
                    {item.date}
                </Text>
            </View>
            <View className="justify-center" style={[col.payment, TAP]}>
                <Text className="text-sm text-foreground" numberOfLines={1}>
                    {item.payment}
                </Text>
            </View>
            <View className="justify-center" style={[col.amount, TAP]}>
                <Text className={`${MONEY_CELL} ${item.tone}`}>{item.amount}</Text>
            </View>
        </View>
    )
}

function ItemGrid({ items }: { items: ReadItem[] }) {
    const rows = items.map(item => <GridRow key={item.id} item={item} />)
    return (
        <View testID="deposit-read-items-grid">
            <GridHeader />
            {rows}
        </View>
    )
}

function ItemCard({ item }: { item: ReadItem }) {
    const linkText = `${item.label} · ${item.date}`
    return (
        <View testID={`deposit-read-item-${item.id}`} className={CARD}>
            <View className="flex-row items-center gap-2">
                <Text
                    className="min-w-0 flex-1 text-sm font-semibold text-foreground"
                    numberOfLines={1}
                >
                    {item.party}
                </Text>
                <Text className={`text-sm font-semibold tabular-nums ${item.tone}`}>
                    {item.amount}
                </Text>
            </View>
            <View className="min-w-0">
                <ItemLink
                    text={linkText}
                    href={item.href}
                    testID={`deposit-item-link-${item.lineId}`}
                />
                <MutedLine text={item.account} />
                <MutedLine text={item.payment} />
            </View>
        </View>
    )
}

function ItemCards({ items }: { items: ReadItem[] }) {
    const cards = items.map(item => <ItemCard key={item.id} item={item} />)
    return (
        <View testID="deposit-read-items-cards" className="gap-3">
            {cards}
        </View>
    )
}

function ItemsBody({ items, isCards }: { items: ReadItem[]; isCards: boolean }) {
    if (isCards) return <ItemCards items={items} />
    return <ItemGrid items={items} />
}

interface DepositItemsReadProps {
    isVisible: boolean
    items: readonly DepositItemRow[]
    currency: string
}

/**
 * Items deposited (bank deposit spec §3.8): a grid of Received from, Transaction (a link
 * to the item's document), Date, Payment and Amount at or above the items grid's least
 * width (lib/deposit-columns.ts), measured on the section; one card per item below it.
 * The header and every row read the one column constant, and nothing scrolls sideways.
 */
export function DepositItemsRead({ isVisible, items, currency }: DepositItemsReadProps) {
    const { width, onLayout } = useContainerWidth()
    if (!isVisible) return null
    const isCards = width > 0 && width < depositItemsMinWidth
    const drawn = depositReadItems(items, currency)
    return (
        <View className="gap-2" onLayout={onLayout}>
            <Text className={SECTION_HEADING}>Items deposited</Text>
            <ItemsBody items={drawn} isCards={isCards} />
        </View>
    )
}
