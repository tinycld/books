import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import { showsTableCards } from '../lib/table-fit'

/**
 * Whether a list draws cards in place of its table (`showsTableCards`): on a phone, and
 * when the list's own container (the one `onLayout` is on) is narrower than the table's
 * minimum width plus the scrollbar gutter `ListTable` reports through `onGutter`. The
 * last gutter is kept while cards show (no table measures one then), so the choice does
 * not flap between table and cards. Before the first layout it follows the breakpoint.
 */
export function useFitsTable(minWidth: number) {
    const isPhone = useBreakpoint() === 'mobile'
    // Local layout state: the container's measured width and the table's last gutter.
    const [width, setWidth] = useState<number | null>(null)
    const [gutter, setGutter] = useState(0)
    const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)
    const showCards = showsTableCards({ isPhone, width, minWidth, gutter })
    return { onLayout, onGutter: setGutter, showCards }
}
