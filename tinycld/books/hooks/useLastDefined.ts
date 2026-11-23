import { useLayoutEffect, useRef } from 'react'

/**
 * The value, or while it is undefined the last value of a committed render. The ref is
 * written only after a commit, so a render that React discards cannot change it.
 */
export function useLastDefined<T>(value: T | undefined): T | undefined {
    const last = useRef(value)
    useLayoutEffect(() => {
        if (value !== undefined) last.current = value
    })
    return value ?? last.current
}
