import { useRef, useState } from 'react'
import { Platform, type ScrollViewInstance } from 'react-native'

/**
 * The content style of a table's sideways scroller, whose rows sit in a vertical scroller
 * with a stable scrollbar gutter (`web:[scrollbar-gutter:stable]`). Where the browser
 * draws classic scrollbars (Windows, Linux) that gutter takes its width from the rows, so
 * the table's minimum width grows by the measured gutter and the rows keep `minWidth`.
 * Overlay scrollbars (macOS) and native take no width, so there the gutter is 0.
 * `onGutter` hears each measured gutter that differs from the last one, so a list that
 * picks between table and cards can add it to the width the table needs.
 */
export function useTableMinWidth(minWidth: number, onGutter?: (gutter: number) => void) {
    const rowsScrollRef = useRef<ScrollViewInstance>(null)
    const [gutter, setGutter] = useState(0)
    // The last gutter given to `onGutter`; a ref, since only the layout handler reads it.
    const reported = useRef<number | null>(null)
    // A layout change is the only time the gutter can change: a resize, or a browser zoom
    // that changes the scrollbar's width in CSS pixels.
    const onRowsLayout = () => {
        if (Platform.OS !== 'web') return
        // On web the ScrollView ref is the scrolling DOM element itself.
        const node = rowsScrollRef.current
        if (!node) return
        const measured = node.offsetWidth - node.clientWidth
        setGutter(measured)
        // The first measure is always reported: the listener may hold a gutter from a
        // table that was drawn before this one.
        if (measured === reported.current) return
        reported.current = measured
        onGutter?.(measured)
    }
    return {
        rowsScrollRef,
        onRowsLayout,
        contentStyle: { width: '100%', minWidth: minWidth + gutter } as const,
    }
}
