// The Shortcuts section of the Books sidebar: one ordered list for each user, stored whole
// in books_sidebar_shortcuts.items. No icons and no routes here (lib/shortcut-catalog.ts
// has them), so this module stays plain data.
import { z } from '@tinycld/core/ui/form'

// screen: a Books screen, `ref` is its catalog id. new: a transaction form, `ref` is a
// NEW_ACTIONS id. report: a report, `ref` is the shipped_key of a shipped report or the
// row id of a saved one. register: an account's register, `ref` is the account id.
export const SHORTCUT_KINDS = ['screen', 'new', 'report', 'register'] as const
export type ShortcutKind = (typeof SHORTCUT_KINDS)[number]

// The sidebar is one column: more than this is a second navigation, not shortcuts.
export const MAX_SHORTCUTS = 30

const shortcutSchema = z.object({
    kind: z.enum(SHORTCUT_KINDS),
    ref: z.string().min(1).max(100),
})
export type Shortcut = z.infer<typeof shortcutSchema>

export function shortcutKey(shortcut: Shortcut): string {
    return `${shortcut.kind}:${shortcut.ref}`
}

// A user with no stored row gets these. None repeats an entry of the fixed navigation
// under it: each is a screen that is two presses away without a shortcut.
export const DEFAULT_SHORTCUTS: readonly Shortcut[] = [
    { kind: 'screen', ref: 'customers' },
    { kind: 'screen', ref: 'vendors' },
    { kind: 'screen', ref: 'products' },
    { kind: 'report', ref: 'books.profit_and_loss' },
    { kind: 'report', ref: 'books.balance_sheet' },
]

// The stored value as a list. Anything that is not a list is no shortcuts; an item that
// is not a shortcut, or that repeats an earlier one, is dropped, and the list stops at
// MAX_SHORTCUTS. A stored value is never an error for the reader: the row is written by
// the client, and an older or newer client may have written a kind this one does not know.
export function parseShortcuts(value: unknown): Shortcut[] {
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    const out: Shortcut[] = []
    for (const item of value) {
        const parsed = shortcutSchema.safeParse(item)
        if (!parsed.success) continue
        const key = shortcutKey(parsed.data)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ kind: parsed.data.kind, ref: parsed.data.ref })
        if (out.length === MAX_SHORTCUTS) break
    }
    return out
}

export function hasShortcut(list: readonly Shortcut[], shortcut: Shortcut): boolean {
    const key = shortcutKey(shortcut)
    return list.some(item => shortcutKey(item) === key)
}

export function canAddShortcut(list: readonly Shortcut[]): boolean {
    return list.length < MAX_SHORTCUTS
}

// At the end of the list. The same list when it is there already or the list is full.
export function addShortcut(list: readonly Shortcut[], shortcut: Shortcut): Shortcut[] {
    if (hasShortcut(list, shortcut) || !canAddShortcut(list)) return [...list]
    return [...list, shortcut]
}

export function removeShortcut(list: readonly Shortcut[], key: string): Shortcut[] {
    return list.filter(item => shortcutKey(item) !== key)
}

// To `index`, clamped to the list. The same order when `key` is not in it or `index` is not
// a finite number (splice would read NaN as 0 and send the item to the top).
export function placeShortcut(list: readonly Shortcut[], key: string, index: number): Shortcut[] {
    const from = list.findIndex(item => shortcutKey(item) === key)
    if (from < 0 || !Number.isFinite(index)) return [...list]
    const to = Math.max(0, Math.min(list.length - 1, index))
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
}

// One place up (-1) or down (1).
export function moveShortcut(list: readonly Shortcut[], key: string, by: -1 | 1): Shortcut[] {
    const from = list.findIndex(item => shortcutKey(item) === key)
    if (from < 0) return [...list]
    return placeShortcut(list, key, from + by)
}
