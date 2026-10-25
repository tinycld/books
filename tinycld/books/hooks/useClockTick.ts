import { useEffect, useState } from 'react'

// setTimeout stores its delay in 32 bits; a longer delay fires at once.
const MAX_DELAY_MS = 2 ** 31 - 2

// Returns the time read at this render. The state only forces a re-render when
// the earliest time in `times` (epoch ms) later than that passes, so a row that
// arrives already expired is classified against the real clock, never stale state.
export function useClockTick(times: readonly number[]) {
    const [tick, setTick] = useState(0)
    const now = Date.now()
    const upcoming = times.filter(time => time > now)
    const nextAt = upcoming.length ? Math.min(...upcoming) : undefined

    useEffect(() => {
        if (nextAt === undefined) return
        const delay = Math.min(Math.max(nextAt - Date.now(), 0), MAX_DELAY_MS)
        const timer = setTimeout(() => setTick(tick + 1), delay)
        return () => clearTimeout(timer)
    }, [nextAt, tick])

    return now
}
