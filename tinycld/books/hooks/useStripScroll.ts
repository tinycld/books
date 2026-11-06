import { useCallback, useEffect, useRef } from 'react'
import type { ScrollViewInstance } from 'react-native'

// On a phone the account strip scrolls sideways. Whatever changes the selection (a press,
// the URL, a new connection), the selected card scrolls into view. Phone cards have a fixed
// width and gap, so a card's x comes from its index: on web, react-native-web fires
// onLayout only on a size change, so a card that moves sideways (a connection added or
// removed in front of it) would keep a stale x. The strip also scrolls again when its
// content size changes: the first layout after a deep link, or a card added or removed
// before the selected one.
export const PHONE_CARD_WIDTH = 240
export const PHONE_CARD_GAP = 12
const LEAD = 16

export function useStripScroll(selectedIndex: number) {
    const scrollRef = useRef<ScrollViewInstance>(null)

    const scrollToSelected = useCallback(() => {
        if (selectedIndex < 0) return
        const x = selectedIndex * (PHONE_CARD_WIDTH + PHONE_CARD_GAP)
        scrollRef.current?.scrollTo({ x: Math.max(0, x - LEAD), animated: true })
    }, [selectedIndex])

    // An imperative scroll on a selection change; it sets no state.
    useEffect(() => {
        scrollToSelected()
    }, [scrollToSelected])

    return { scrollRef, onContentSizeChange: scrollToSelected }
}
