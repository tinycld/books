import type { ReactNode } from 'react'
import { type GestureResponderEvent, Pressable } from 'react-native'

export function stopPress(event: GestureResponderEvent) {
    event.stopPropagation()
}

/**
 * Wraps a menu that sits inside a pressable row. The menu's content is portalled, but
 * React still bubbles its presses up the tree to the row's Pressable, which would open the
 * record behind the action just chosen; this Pressable swallows the presses that reach it.
 * It is no control of its own: out of the accessibility tree and, with `tabIndex={-1}`, out
 * of the web Tab order (RN-web ignores `focusable={false}` and gives a Pressable tabIndex 0).
 */
export function PressBoundary({ children }: { children: ReactNode }) {
    return (
        <Pressable accessible={false} focusable={false} tabIndex={-1} onPress={stopPress}>
            {children}
        </Pressable>
    )
}
