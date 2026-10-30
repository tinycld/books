import { useRef, useState } from 'react'
import { Platform, type ScrollViewInstance } from 'react-native'

/**
 * The content style of a table's sideways scroller, whose rows sit in a vertical scroller
 * with a stable scrollbar gutter (`web:[scrollbar-gutter:stable]`). Where the browser
 * draws classic scrollbars (Windows, Linux) that gutter takes its width from the rows, so
 * the table's minimum width grows by the measured gutter and the rows keep `minWidth`.
 * Overlay scrollbars (macOS) and native take no width, so there the gutter is 0.
 */
export function useTableMinWidth(minWidth: number) {
    const rowsScrollRef = useRef<ScrollViewInstance>(null)
    const [gutter, setGutter] = useState(0)
    // A layout change is the only time the gutter can change: a resize, or a browser zoom
    // that changes the scrollbar's width in CSS pixels.
    const onRowsLayout = () => {
        if (Platform.OS !== 'web') return
        // On web the ScrollView ref is the scrolling DOM element itself.
        const node = rowsScrollRef.current
        if (!node) return
        setGutter(node.offsetWidth - node.clientWidth)
    }
    return {
        rowsScrollRef,
        onRowsLayout,
        contentStyle: { width: '100%', minWidth: minWidth + gutter } as const,
    }
}
