import { useState } from 'react'

export const ROW_OVERSCAN = 6

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

// Mounts only the rows near the scroll position. The rows have one fixed height, so the
// rest are stood in for by two spacers and the scroll bar still spans the whole list.
export function useRowWindow({
    total,
    rowHeight,
    viewHeight,
}: {
    total: number
    rowHeight: number
    viewHeight: number
}) {
    // The row index, not the pixel offset, so scrolling within one row causes no render.
    const [firstVisible, setFirstVisible] = useState(0)
    return {
        ...rowWindowBounds({ firstVisible, total, rowHeight, viewHeight }),
        onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) =>
            setFirstVisible(Math.floor(event.nativeEvent.contentOffset.y / rowHeight)),
    }
}
