// What one Pay writes (spec §3.2, §3.5, §9): one bill payment per vendor, in vendor
// display-name order (case-insensitive, then vendor id), each with its lines in list
// order. With method Check and a Starting check no., the vendors take consecutive check
// numbers in that order. The batch carries the vendors in reverse (`writeOrder`): the last
// payment in a batch posts first, so the numbers follow display-name order.
// `payBillsGroups` is pure; `payBillsWritePlan` adds a new record id to each payment and
// line, so it is called only when a Pay writes.

import { newRecordId } from 'pbtsdb/core'
import { compareNames, compareText, type PayBillsRow } from './pay-bills-rows'
import { entryCents, type Payments } from './payment-allocation'
import type { PaymentMethodKey } from './payment-methods'

export type PayBillsGroupLine = {
    bill: string
    billNumber: string
    // Cents.
    amount: number
    position: number
}

export type PayBillsGroup = {
    vendor: string
    // The vendor's display name.
    name: string
    reference_no: string
    lines: PayBillsGroupLine[]
}

export type PayBillsPlanLine = PayBillsGroupLine & { id: string }

export type PayBillsPlanVendor = Omit<PayBillsGroup, 'lines'> & {
    paymentId: string
    lines: PayBillsPlanLine[]
}

export type PayBillsWritePlan = { vendors: PayBillsPlanVendor[] }

export type PayBillsPlanInput = {
    rows: readonly PayBillsRow[]
    payments: Payments
    currency: string
    startCheckNo: string
    method: PaymentMethodKey | ''
}

const DIGITS = /^\d+$/

// The check number `offset` places after `start`; '' with no (digit) start. The server
// stores plain numbers, so a leading zero is not kept.
function checkNumberAfter(start: string, offset: number): string {
    if (!DIGITS.test(start)) return ''
    return String(BigInt(start) + BigInt(offset))
}

/**
 * The payments of a Pay, one per vendor in display-name order, with their lines and check
 * numbers: `rows` are every listed row in list order (a row a filter hides keeps its
 * payment, so it is paid too); a row at zero, with no entry, or with an amount that does
 * not parse is not paid. Pure.
 */
export function payBillsGroups(input: PayBillsPlanInput): PayBillsGroup[] {
    const byVendor = new Map<
        string,
        { name: string; rows: { row: PayBillsRow; cents: number }[] }
    >()
    for (const row of input.rows) {
        const cents = entryCents(input.payments[row.id], input.currency)
        if (cents <= 0) continue
        const group = byVendor.get(row.vendor) ?? { name: row.party, rows: [] }
        group.rows.push({ row, cents })
        byVendor.set(row.vendor, group)
    }
    const ordered = [...byVendor.entries()].sort(
        ([idA, a], [idB, b]) => compareNames(a.name, b.name) || compareText(idA, idB)
    )
    const numbersChecks = input.method === 'check'
    return ordered.map(([vendor, group], index) => ({
        vendor,
        name: group.name,
        reference_no: numbersChecks ? checkNumberAfter(input.startCheckNo, index) : '',
        lines: group.rows.map(({ row, cents }, position) => ({
            bill: row.id,
            billNumber: row.number,
            amount: cents,
            position,
        })),
    }))
}

/**
 * The plan a Pay writes: `payBillsGroups` with a new record id for each payment and line.
 * The schema has checked every amount, so each parses here.
 */
export function payBillsWritePlan(input: PayBillsPlanInput): PayBillsWritePlan {
    const vendors = payBillsGroups(input).map(group => ({
        ...group,
        paymentId: newRecordId(),
        lines: group.lines.map(line => ({ ...line, id: newRecordId() })),
    }))
    return { vendors }
}

// The vendors in batch order: reversed, each payment before its lines.
export function writeOrder(plan: PayBillsWritePlan): PayBillsPlanVendor[] {
    return [...plan.vendors].reverse()
}

// Starting check no. after a Pay & new: the number after the last one used; empty stays
// empty.
export function nextStartCheckNo(start: string, vendorCount: number): string {
    return checkNumberAfter(start, vendorCount)
}

// "Pacific Power gets check 1050, Office Supply World check 1051."; '' while the payments
// take no check number.
export function checkPlanText(plan: {
    vendors: readonly Pick<PayBillsGroup, 'name' | 'reference_no'>[]
}): string {
    const numbered = plan.vendors.filter(vendor => vendor.reference_no !== '')
    if (numbered.length === 0) return ''
    const parts = numbered.map((vendor, index) => {
        const verb = index === 0 ? 'gets check' : 'check'
        return `${vendor.name} ${verb} ${vendor.reference_no}`
    })
    return `${parts.join(', ')}.`
}
