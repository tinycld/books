import type { StatementRecipientValue } from './statement-schema'
import type { StatementBalanceFilter } from './statement-texts'

// The create screen's recipients list (statements spec §3.2, §3.3, §3.10). Plain
// functions over the rows of hooks/useStatementRecipients, so the filter, the order and the
// way the form's field array follows the live rows are pinned by unit tests.

// One customer the run can make a statement for. `balance` is the open balance today in
// cents (a credit negative); `overdue` is true when it has a posted invoice with an open
// balance due before the statement date.
export type RecipientRow = {
    customer: string
    name: string
    parentName: string
    email: string
    inactive: boolean
    balance: number
    overdue: boolean
}

type LabelParts = Pick<RecipientRow, 'name' | 'parentName' | 'inactive'>

// "<parent>:<name>", with " (inactive)" at the end for an inactive customer.
export function recipientLabel(row: LabelParts): string {
    const parent = row.parentName === '' ? '' : `${row.parentName}:`
    const suffix = row.inactive ? ' (inactive)' : ''
    return `${parent}${row.name}${suffix}`
}

const KEEPS: Record<StatementBalanceFilter, (row: RecipientRow) => boolean> = {
    open: row => row.balance > 0,
    overdue: row => row.overdue,
    all: row => !row.inactive || row.balance !== 0,
}

export function filterRecipients(
    rows: readonly RecipientRow[],
    filter: StatementBalanceFilter
): RecipientRow[] {
    return rows.filter(KEEPS[filter])
}

function compareText(a: string, b: string): number {
    return a.toLowerCase().localeCompare(b.toLowerCase())
}

// By name ignoring case; a sub-customer sorts directly under its parent, its siblings by
// name.
export function sortRecipients(rows: readonly RecipientRow[]): RecipientRow[] {
    const groupOf = (row: RecipientRow) => (row.parentName === '' ? row.name : row.parentName)
    return [...rows].sort((a, b) => {
        const group = compareText(groupOf(a), groupOf(b))
        if (group !== 0) return group
        const isChildA = a.parentName === '' ? 0 : 1
        const isChildB = b.parentName === '' ? 0 : 1
        if (isChildA !== isChildB) return isChildA - isChildB
        return compareText(a.name, b.name) || a.customer.localeCompare(b.customer)
    })
}

// The form's field array for the rows now listed, in their order. A customer that stays
// keeps its tick and its address (typed or not); a new one is ticked with the customer's
// email; one that left the list is dropped. With `only` (the `?customer` of the first
// load), a new customer is ticked only when it is that one.
export function mergeRecipients(
    previous: readonly StatementRecipientValue[],
    rows: readonly RecipientRow[],
    only: string | undefined
): StatementRecipientValue[] {
    const kept = new Map(previous.map(recipient => [recipient.customer, recipient]))
    return rows.map(row => {
        const stays = kept.get(row.customer)
        if (stays !== undefined)
            return { customer: row.customer, ticked: stays.ticked, email: stays.email }
        const ticked = only === undefined || row.customer === only
        return { customer: row.customer, ticked, email: row.email }
    })
}

// The sum of the ticked rows' balances, in integer cents.
export function recipientTotal(
    rows: readonly RecipientRow[],
    recipients: readonly StatementRecipientValue[]
): number {
    const balances = new Map(rows.map(row => [row.customer, row.balance]))
    return recipients.reduce(
        (total, recipient) =>
            recipient.ticked ? total + (balances.get(recipient.customer) ?? 0) : total,
        0
    )
}

export function totalCaption(count: number): string {
    if (count === 0) return 'No customer selected'
    if (count === 1) return 'Total balance of 1 customer'
    return `Total balance of ${count} customers`
}

// The heading tick box: every row ticked, some, or none.
export function tickState(recipients: readonly StatementRecipientValue[]): 'all' | 'some' | 'none' {
    const ticked = recipients.filter(recipient => recipient.ticked).length
    if (ticked === 0) return 'none'
    return ticked === recipients.length ? 'all' : 'some'
}
