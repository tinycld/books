import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { Pressable, Text } from 'react-native'
import { type DateOrder, REVIEW_CELLS, REVIEWED_CELLS } from '../../../lib/bank-review'

type DateOrderToggleProps = {
    order: DateOrder
    onToggle: () => void
    variant: 'header' | 'bar'
    // The header sits on the rows' Date cell, which is narrower on Reviewed
    // (REVIEWED_CELLS).
    isReviewed?: boolean
}

const HEADER_STYLE = [REVIEW_CELLS.date, { minHeight: 44 }]
const REVIEWED_HEADER_STYLE = [REVIEWED_CELLS.date, { minHeight: 44 }]
const BAR_STYLE = { minHeight: 44 }

function orderText(order: DateOrder): string {
    return order === 'newest' ? 'Newest first' : 'Oldest first'
}

// The wide table's Date header: the label and the order's arrow, as the register's. The
// label names the action; the value tells a screen reader the order now shown.
function HeaderToggle({ order, onToggle, isReviewed }: Omit<DateOrderToggleProps, 'variant'>) {
    const color = useThemeColor('muted-foreground')
    const Icon = order === 'newest' ? ArrowDown : ArrowUp
    const value = { text: orderText(order) }
    const style = isReviewed ? REVIEWED_HEADER_STYLE : HEADER_STYLE
    return (
        <Pressable
            testID="bank-review-sort-date"
            accessibilityRole="button"
            accessibilityLabel="Sort by date"
            accessibilityValue={value}
            onPress={onToggle}
            className="min-w-0 flex-row items-center gap-1 pr-3"
            style={style}
        >
            <Text
                numberOfLines={1}
                className="text-xs font-semibold uppercase text-muted-foreground"
            >
                Date
            </Text>
            <Icon size={12} color={color} />
        </Pressable>
    )
}

// The phone bar's toggle: the order in words.
function BarToggle({ order, onToggle }: Omit<DateOrderToggleProps, 'variant'>) {
    const text = orderText(order)
    const value = { text }
    return (
        <Pressable
            testID="bank-review-sort-date"
            accessibilityRole="button"
            accessibilityLabel="Sort by date"
            accessibilityValue={value}
            onPress={onToggle}
            className="justify-center px-1"
            style={BAR_STYLE}
        >
            <Text className="text-sm text-primary">{text}</Text>
        </Pressable>
    )
}

// Newest or oldest first: the only sort of the transaction tabs.
export function DateOrderToggle({ order, onToggle, variant, isReviewed }: DateOrderToggleProps) {
    if (variant === 'bar') return <BarToggle order={order} onToggle={onToggle} />
    return <HeaderToggle order={order} onToggle={onToggle} isReviewed={isReviewed} />
}
