import { useState } from 'react'

const OVERSCAN = 6

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
    const visibleCount = Math.ceil(viewHeight / rowHeight)
    const first = Math.min(Math.max(0, firstVisible - OVERSCAN), total)
    const last = Math.min(total, first + visibleCount + OVERSCAN * 2)
    return {
        first,
        last,
        topSpace: first * rowHeight,
        bottomSpace: (total - last) * rowHeight,
        onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) =>
            setFirstVisible(Math.floor(event.nativeEvent.contentOffset.y / rowHeight)),
    }
}
