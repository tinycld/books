import { useScopeOwner } from '@tinycld/core/lib/shortcuts'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { ItemPageState } from '../../hooks/useItemPage'
import type { DetailSurface } from '../../lib/detail-surface'
import type { BooksProducts } from '../../types'
import { StatusBadge } from '../StatusBadge'
import { ItemMoreMenu } from './ItemMoreMenu'

const PREFIX = 'product'
const BACK_LABEL = 'Products and services'

// Adjust stock (A), in the item page's `modal` scope (RecordSurface's).
const ADJUST_KEY = { keys: 'a', scope: 'modal', group: 'Item' } as const

function BackLink({ isVisible, onPress }: { isVisible: boolean; onPress: () => void }) {
    if (!isVisible) return null
    return (
        <Pressable
            testID={`${PREFIX}-back`}
            accessibilityRole="button"
            accessibilityLabel={`Back to ${BACK_LABEL.toLowerCase()}`}
            onPress={onPress}
            className="-ml-1 min-h-11 justify-center self-start px-1"
        >
            <Text className="text-sm text-muted-foreground">{`‹ ${BACK_LABEL}`}</Text>
        </Pressable>
    )
}

function Badge({ isVisible, label, tone, testID }: BadgeProps) {
    if (!isVisible) return null
    return <StatusBadge label={label} tone={tone} testID={testID} />
}

type BadgeProps = {
    isVisible: boolean
    label: string
    tone: 'muted' | 'warning'
    testID: string
}

interface AdjustButtonProps {
    isVisible: boolean
    isPhone: boolean
    onPress: () => void
}

// A writer's Adjust stock: idle while writes cannot reach the server (`serverAction`).
function AdjustButton({ isVisible, isPhone, onPress }: AdjustButtonProps) {
    const scopeOwner = useScopeOwner() ?? undefined
    if (!isVisible) return null
    return (
        <ShortcutButton
            testID="item-adjust-stock"
            label="Adjust stock"
            shortcut={ADJUST_KEY}
            onPress={onPress}
            scopeOwner={scopeOwner}
            serverAction
            className={isPhone ? 'flex-1' : ''}
        />
    )
}

function TitleRow({ record, trailing }: { record: BooksProducts; trailing: ReactNode }) {
    return (
        <View className="min-w-0 flex-row items-center gap-2">
            <Text
                testID={`${PREFIX}-title`}
                numberOfLines={2}
                className="shrink text-2xl font-semibold text-foreground"
            >
                {record.name}
            </Text>
            <Badge
                isVisible={record.inactive}
                label="Inactive"
                tone="muted"
                testID={`${PREFIX}-inactive-badge`}
            />
            <Badge
                isVisible={record.low_stock}
                label="Low stock"
                tone="warning"
                testID="item-low-stock"
            />
            {trailing}
        </View>
    )
}

interface ItemHeaderProps {
    record: BooksProducts
    page: ItemPageState
    surface: DetailSurface
    isPhone: boolean
}

/**
 * The item page's header, in the party page header's layout (PartyPageHeader, whose
 * contact actions an item has none of): "‹ Products and services" on the page surface,
 * the name (two lines, then truncated) with the Inactive and Low stock badges, and
 * "<code> · Inventory" under it. A writer gets Adjust stock and More; a reader no action.
 * On a phone More sits at the top right and Adjust stock fills a row of its own.
 */
export function ItemHeader({ record, page, surface, isPhone }: ItemHeaderProps) {
    const gutter = isPhone ? 'px-4' : 'px-6'
    const back = <BackLink isVisible={surface === 'page'} onPress={page.navigation.leave} />
    const more = <ItemMoreMenu record={record} page={page} />
    const adjust = (
        <AdjustButton isVisible={page.canWrite} isPhone={isPhone} onPress={page.adjustStock} />
    )
    const identity = (
        <Text testID="item-identity" className="text-sm text-muted-foreground">
            {`${record.code} · Inventory`}
        </Text>
    )
    if (isPhone) {
        const trailing = (
            <>
                <View className="flex-1" />
                <View className="self-start">{more}</View>
            </>
        )
        return (
            <View testID="item-header" className={`gap-3 pb-3 pt-2 ${gutter}`}>
                <View className="gap-1">
                    {back}
                    <TitleRow record={record} trailing={trailing} />
                    {identity}
                </View>
                <View className="flex-row gap-2">{adjust}</View>
            </View>
        )
    }
    return (
        <View testID="item-header" className={`gap-1 pb-3 pt-2 ${gutter}`}>
            {back}
            <View className="flex-row items-start justify-between gap-6">
                <View className="min-w-0 flex-1 gap-1">
                    <TitleRow record={record} trailing={null} />
                    {identity}
                </View>
                <View className="flex-row items-start gap-2">
                    {adjust}
                    {more}
                </View>
            </View>
        </View>
    )
}
