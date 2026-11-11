import { useLayoutEffect, useRef } from 'react'
import { Platform, type TextInputFocusEvent } from 'react-native'

const IS_WEB = Platform.OS === 'web'

function inputOf(event: TextInputFocusEvent): HTMLInputElement | null {
    const node: unknown = event.target
    if (typeof HTMLInputElement === 'undefined') return null
    return node instanceof HTMLInputElement ? node : null
}

/**
 * A numeric line cell selects its whole value when it takes the focus, so typing
 * replaces it. On native the input's own `selectTextOnFocus` does it. On web,
 * react-native-web's `selectTextOnFocus` selects in a timer after the focus; when the
 * page is busy, typed keys run before that timer and the late select takes the text
 * typed so far. So on web the cell selects at once in the focus handler, again after a
 * render that changes the drawn text (Rate draws "1250.00" for "1,250.00" once focused),
 * and once more after the browser's own handling of a mouse focus, which places the
 * caret. Each select is skipped once the user has pressed a key or typed since the focus.
 */
export function useSelectAllOnFocus(text: string) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const isPendingRef = useRef(false)

    useLayoutEffect(() => {
        const input = inputRef.current
        if (!isPendingRef.current || input === null || input.value !== text) return
        input.select()
    }, [text])

    const selectIfPending = () => {
        const input = inputRef.current
        if (!isPendingRef.current || input === null) return
        if (document.activeElement === input) input.select()
    }
    const onFocus = (event: TextInputFocusEvent) => {
        const input = inputOf(event)
        if (input === null) return
        inputRef.current = input
        isPendingRef.current = true
        input.select()
        setTimeout(selectIfPending, 0)
    }
    const onTyped = () => {
        isPendingRef.current = false
    }
    return {
        selectTextOnFocus: !IS_WEB,
        onFocus,
        onKeyPress: onTyped,
        onTyped,
        onBlur: onTyped,
    }
}
