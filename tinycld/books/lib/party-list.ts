import type { BooksCustomers } from '../types'

export type PartyField = 'id' | 'display_name' | 'company' | 'email' | 'phone' | 'inactive'

// A vendor row carries the same columns with the same types.
export type PartyRecord = Pick<BooksCustomers, PartyField>

// What every list's records carry: the list frame and the row menus need no other column.
export type ListRecord = { id: string; inactive: boolean }

export type PartyListRow<T extends PartyRecord> = { party: T; depth: 0 | 1 }

export type PartyListCopy = {
    title: string
    singular: string
    plural: string
    searchPlaceholder: string
    emptyHint: string
}

// Shared by the header and every row, so the columns line up. Name and Email shrink
// with an ellipsis but keep a minimum width, so neither collapses to blank.
export const PARTY_COLUMNS = {
    name: { flexGrow: 3, flexShrink: 1, flexBasis: 0, minWidth: 180 },
    email: { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 140 },
    phone: { width: 150, flexShrink: 0 },
    menu: { width: 44, flexShrink: 0 },
} as const

// Below this the table scrolls sideways.
export const PARTY_TABLE_MIN_WIDTH = 540

export const PARTY_ROW_HEIGHT = 56

// Pads the header so it lines up with the rows; with the column minimums it stays inside
// the table's 540 px minimum width. A row puts the same left padding inside its open
// button (so the press area reaches the row's edge) and the right padding on the row.
export const PARTY_ROW_CLASS = 'flex-row items-center pl-4 pr-2'

// The company under the display name, only when it says something the name does not.
export function companyLine(party: Pick<PartyRecord, 'display_name' | 'company'>): string {
    const company = party.company ?? ''
    if (company === party.display_name) return ''
    return company
}

// The space around the text: the card centres its text in a fixed height (its 1 px bottom
// border included). With the name line it makes a name-only card 44 px tall at font
// scale 1, the touch target.
const CARD_PADDING = 24
// text-sm line height.
const CARD_NAME_LINE_HEIGHT = 20
// text-xs line height.
const CARD_MUTED_LINE_HEIGHT = 16

// A missing field and an empty one both draw no line.
export function isShownLine(value: string | undefined): value is string {
    return typeof value === 'string' && value !== ''
}

// The windowed card list needs every card's height before it renders, so the card is
// drawn at exactly this height. The name line and the muted lines grow with the native
// font scale and the padding does not, so a card is never shorter than its text.
export function recordCardHeight(lines: readonly (string | undefined)[], fontScale = 1): number {
    const shownLines = lines.filter(isShownLine).length
    const textHeight = CARD_NAME_LINE_HEIGHT + shownLines * CARD_MUTED_LINE_HEIGHT
    return CARD_PADDING + textHeight * fontScale
}

export function partyCardHeight(party: PartyRecord, fontScale = 1): number {
    return recordCardHeight([companyLine(party), party.email, party.phone], fontScale)
}

export function partyTitle(party: Pick<PartyRecord, 'display_name'>): string {
    return party.display_name
}

export function comparePartyNames(a: PartyRecord, b: PartyRecord): number {
    const byName = a.display_name.localeCompare(b.display_name, undefined, {
        sensitivity: 'base',
    })
    if (byName !== 0) return byName
    if (a.id === b.id) return 0
    return a.id < b.id ? -1 : 1
}

export function partyMatches(party: PartyRecord, query: string): boolean {
    const term = query.trim().toLowerCase()
    if (term === '') return true
    const fields = [party.display_name, party.company, party.email, party.phone]
    // A row can arrive without company, email or phone; searching must not throw on it.
    return fields.some(value => (value ?? '').toLowerCase().includes(term))
}

// One flat level: inactive rows dropped unless shown, then matched, then sorted by name.
export function partyRows<T extends PartyRecord>(
    records: readonly T[],
    filters: { query: string; showInactive: boolean }
): PartyListRow<T>[] {
    return records
        .filter(r => filters.showInactive || !r.inactive)
        .filter(r => partyMatches(r, filters.query))
        .sort(comparePartyNames)
        .map(party => ({ party, depth: 0 }))
}

export type PartyListViewState =
    | 'loading'
    | 'error'
    | 'empty'
    | 'no-match'
    | 'all-inactive'
    | 'ready'

// 'all-inactive' is only the default view hiding every record: a search that finds
// nothing is 'no-match' whatever the inactive filter.
export function partyListViewState(input: {
    isReady: boolean
    isError: boolean
    records: readonly ListRecord[]
    rowCount: number
    query: string
    showInactive: boolean
}): PartyListViewState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    if (input.records.length === 0) return 'empty'
    if (input.rowCount > 0) return 'ready'
    const hidesOnlyInactive =
        input.query.trim() === '' && !input.showInactive && input.records.every(r => r.inactive)
    if (hidesOnlyInactive) return 'all-inactive'
    return 'no-match'
}

export function emptyKindFor(
    viewState: PartyListViewState
): 'none' | 'no-match' | 'all-inactive' | null {
    if (viewState === 'empty') return 'none'
    if (viewState === 'no-match') return 'no-match'
    if (viewState === 'all-inactive') return 'all-inactive'
    return null
}

// The toolbar shows once at least one record exists, so it stays while a search or the
// inactive filter hides every row.
const TOOLBAR_STATES: ReadonlySet<PartyListViewState> = new Set([
    'ready',
    'no-match',
    'all-inactive',
])

export function showsToolbar(viewState: PartyListViewState): boolean {
    return TOOLBAR_STATES.has(viewState)
}

// A reader sees neither the header's New button nor the empty state's.
export function listWriteControls(canWrite: boolean): {
    showNewButton: boolean
    showEmptyNew: boolean
} {
    return { showNewButton: canWrite, showEmptyNew: canWrite }
}
