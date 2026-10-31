import { useRef, useState } from 'react'
import { isNearEnd } from '../lib/near-end'
import { indexAt, itemTop, windowRange } from '../lib/opening-window'

export const ROW_OVERSCAN = 6

// React Native's scroll event carries all three; only the offset moves the window, so a
// caller with no `onNearEnd` may send the offset alone.
type ScrollEvent = {
    nativeEvent: {
        contentOffset: { y: number }
        layoutMeasurement?: { height: number }
        contentSize?: { height: number }
    }
}
type LayoutEvent = { nativeEvent: { layout: { height: number } } }

export function rowWindowBounds({
    firstVisible,
    total,
    rowHeight,
    viewHeight,
}: {
    firstVisible: number
    total: number
    rowHeight: number
    viewHeight: number
}) {
    const visibleCount = Math.ceil(viewHeight / rowHeight)
    // The upper clamp keeps the window from going empty when the list shrinks under a stale scroll position.
    const first = Math.min(
        Math.max(0, firstVisible - ROW_OVERSCAN),
        Math.max(0, total - visibleCount)
    )
    const last = Math.min(total, first + visibleCount + ROW_OVERSCAN * 2)
    return { first, last, topSpace: first * rowHeight, bottomSpace: (total - last) * rowHeight }
}

type RowWindowOptions = {
    total: number
    viewHeight: number
    // Called on each scroll that ends near the end of the content (lib/near-end.ts).
    onNearEnd?(): void
} & (
    | { rowHeight: number; heights?: undefined }
    | { heights: readonly number[]; rowHeight?: undefined }
)

function reportNearEnd(event: ScrollEvent, onNearEnd: (() => void) | undefined) {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent
    if (!onNearEnd || !layoutMeasurement || !contentSize) return
    if (isNearEnd({ contentOffset, layoutMeasurement, contentSize })) onNearEnd()
}

// Mounts only the rows near the scroll position. The rest are stood in for by two spacers
// and the scroll bar still spans the whole list. Rows have one fixed `rowHeight`, or, for
// a list that mixes heights, per-item `heights` (then `total` is `heights.length`).
export function useRowWindow(options: RowWindowOptions) {
    const { total, viewHeight, heights, rowHeight, onNearEnd } = options
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
            overscan: ROW_OVERSCAN,
        })
        return {
            ...range,
            onScroll: (event: ScrollEvent) => {
                setFirstVisible(
                    indexAt(heights, event.nativeEvent.contentOffset.y - leading.current)
                )
                reportNearEnd(event, onNearEnd)
            },
            onLeadingLayout: (event: LayoutEvent) => {
                leading.current = event.nativeEvent.layout.height
            },
        }
    }

    const height = rowHeight ?? 1
    return {
        firstVisible,
        ...rowWindowBounds({ firstVisible, total, rowHeight: height, viewHeight }),
        onScroll: (event: ScrollEvent) => {
            setFirstVisible(Math.floor(event.nativeEvent.contentOffset.y / height))
            reportNearEnd(event, onNearEnd)
        },
        onLeadingLayout: () => {},
    }
}
