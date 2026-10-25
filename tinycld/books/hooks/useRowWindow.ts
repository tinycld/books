import { useRef, useState } from 'react'
import { indexAt, itemTop, windowRange } from '../lib/opening-window'

const OVERSCAN = 6

type ScrollEvent = { nativeEvent: { contentOffset: { y: number } } }
type LayoutEvent = { nativeEvent: { layout: { height: number } } }

type RowWindowOptions = { total: number; viewHeight: number } & (
    | { rowHeight: number; heights?: undefined }
    | { heights: readonly number[]; rowHeight?: undefined }
)

// Mounts only the rows near the scroll position. The rest are stood in for by two spacers
// and the scroll bar still spans the whole list. Rows have one fixed `rowHeight`, or, for
// a list that mixes heights, per-item `heights` (then `total` is `heights.length`).
export function useRowWindow(options: RowWindowOptions) {
    const { total, viewHeight, heights, rowHeight } = options
    // The row index, not the pixel offset, so scrolling within one row causes no render.
    const [firstVisible, setFirstVisible] = useState(0)
    // Height of the content above the sticky header (date block, helper, errors). It is a
    // height, not a y position: onLayout fires only when a size changes, so a y would go
    // stale when this block resizes while the element below it keeps its size. Only the
    // scroll handler reads it, so a ref is enough and measuring never renders. A resize
    // is picked up on the next scroll; the overscan rows cover the gap until then.
    // While the sticky header is pinned it covers the first `header` pixels of the
    // viewport, so the item just below it is the one at `scrollY - leading`; the header
    // height cancels out of `scrollY - (leading + header) + header`.
    const leading = useRef(0)

    if (heights) {
        const range = windowRange({
            heights,
            scrollY: itemTop(heights, firstVisible),
            offset: 0,
            viewHeight,
            overscan: OVERSCAN,
        })
        return {
            ...range,
            onScroll: (event: ScrollEvent) =>
                setFirstVisible(
                    indexAt(heights, event.nativeEvent.contentOffset.y - leading.current)
                ),
            onLeadingLayout: (event: LayoutEvent) => {
                leading.current = event.nativeEvent.layout.height
            },
        }
    }

    const height = rowHeight ?? 1
    const visibleCount = Math.ceil(viewHeight / height)
    const first = Math.min(Math.max(0, firstVisible - OVERSCAN), total)
    const last = Math.min(total, first + visibleCount + OVERSCAN * 2)
    return {
        firstVisible,
        first,
        last,
        topSpace: first * height,
        bottomSpace: (total - last) * height,
        onScroll: (event: ScrollEvent) =>
            setFirstVisible(Math.floor(event.nativeEvent.contentOffset.y / height)),
        onLeadingLayout: () => {},
    }
}
