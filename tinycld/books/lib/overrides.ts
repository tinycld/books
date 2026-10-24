import { formatDay } from './register-range'

export type LastsFor = '24h' | '7d' | '30d'

const HOUR_MS = 60 * 60 * 1000

export const LASTS_FOR_OPTIONS: { value: LastsFor; label: string; ms: number }[] = [
    { value: '24h', label: '24 hours', ms: 24 * HOUR_MS },
    { value: '7d', label: '7 days', ms: 7 * 24 * HOUR_MS },
    { value: '30d', label: '30 days', ms: 30 * 24 * HOUR_MS },
]

export const DEFAULT_LASTS: LastsFor = '24h'

export function splitOverrides<T extends { expires_at: string }>(
    rows: readonly T[],
    now: Date
): { active: T[]; past: T[] } {
    const active: T[] = []
    const past: T[] = []
    for (const row of rows) {
        if (parseExpiry(row.expires_at) > now.getTime()) active.push(row)
        else past.push(row)
    }
    return { active, past }
}

// PocketBase datetimes are "YYYY-MM-DD HH:mm:ss.SSSZ"; the space blocks Date parsing in some engines.
export function parseExpiry(expiresAt: string): number {
    return new Date(expiresAt.replace(' ', 'T')).getTime()
}

export function toPocketBaseTime(date: Date): string {
    return date.toISOString().replace('T', ' ')
}

export function expiryFrom(lasts: LastsFor, now: Date): string {
    const option = LASTS_FOR_OPTIONS.find(o => o.value === lasts) ?? LASTS_FOR_OPTIONS[0]
    return toPocketBaseTime(new Date(now.getTime() + option.ms))
}

export function formatExpiry(expiresAt: string): string {
    return (
        new Date(parseExpiry(expiresAt))
            .toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            })
            // Newer ICU emits U+202F before AM/PM; the spec text uses a plain space.
            .replace(/\u202f/g, ' ')
    )
}

export function ownOverrideLine(row: { expires_at: string; reason: string }): string {
    const expiry = new Date(parseExpiry(row.expires_at))
    const month = String(expiry.getMonth() + 1).padStart(2, '0')
    const date = String(expiry.getDate()).padStart(2, '0')
    const until = formatDay(`${expiry.getFullYear()}-${month}-${date}`)
    return `You can post into the closed period until ${until} (reason: ${row.reason}).`
}
