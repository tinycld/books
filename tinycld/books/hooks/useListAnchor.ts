import { type RefObject, useRef } from 'react'
import {
    type LayoutChangeEvent,
    Platform,
    type ScrollViewInstance,
    type ViewInstance,
} from 'react-native'
import { scrollIntoViewY } from '../lib/scroll-into-view'

/**
 * For a windowed list that mounts with an anchor item (the register's open entry, when the
 * list changes between table and cards). Only the `index` of the list's first render counts:
 * the first layout of the scroller scrolls that item into view, and on web the item takes the
 * focus the first time it mounts. An anchor set later in the life of the same list (a press on a
 * row of a table that stays a table) scrolls nothing and focuses nothing, and a first index
 * of -1 does nothing for the life of the list. No state and no effect: both run from the
 * layout event and the ref callback.
 */
export function useListAnchor(input: {
    scrollRef: RefObject<ScrollViewInstance | null>
    index: number
    rowHeight: number
}) {
    const { scrollRef, index, rowHeight } = input
    const mountIndex = useRef(index).current
    const measured = useRef(false)
    const focused = useRef(false)

    const onViewLayout = (event: LayoutChangeEvent) => {
        if (measured.current) return
        measured.current = true
        if (mountIndex < 0) return
        const y = scrollIntoViewY({
            top: mountIndex * rowHeight,
            bottom: (mountIndex + 1) * rowHeight,
            scrollY: 0,
            viewHeight: event.nativeEvent.layout.height,
            cover: 0,
        })
        if (y !== null) scrollRef.current?.scrollTo({ y, animated: false })
    }

    // A windowed item that unmounts and mounts again while the user scrolls does not take
    // the focus back: only the first node of the list's life is focused.
    const focusOnce = (node: ViewInstance | null) => {
        if (!node || focused.current) return
        focused.current = true
        // Only web has a keyboard focus on a row; native `focus()` on a View goes to
        // TextInputState and sends a TextInput focus command to a view that is no TextInput.
        if (Platform.OS === 'web') node.focus()
    }

    return { onViewLayout, mountIndex, itemRef: mountIndex < 0 ? undefined : focusOnce }
}
