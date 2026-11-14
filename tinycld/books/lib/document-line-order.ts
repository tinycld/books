// The order a draft's line writes go to the server. The server checks each line write
// against the whole document as it stands after that one write (server/sales_documents.go
// validateSalesDocLine and checkSalesDocLineDelete): every percent line has an Item or a
// Subtotal right above it, the amounts and totals stay inside what Books can store, the
// total is not below zero, and the document holds at most 250 lines. A rearranged document
// that is valid at the end can pass through a state that breaks one of these (a Percent
// line moved with its target, an item removed before the percent line under it, a
// discount line inserted before the item it offsets), so the writes are not sent in a
// fixed order. Each step sends the default order's next write (removes bottom-up, then
// updates, then inserts, each by position) when it leaves the stored document valid, and
// searches the other pending writes, in that order, only when it does not. When no
// pending write keeps it valid, the next write goes anyway and the server's refusal names
// the line; the save stops there, so the writes after it keep the default order with no
// further search.
//
// A save of a stored document writes its header last (documentSavePlan), so the server
// checks each line write with the tax it stores then, not the tax the form chose.
//
// Cost: a check is one pass over the lines in server order, which the module keeps
// sorted as writes apply (no copy, no sort per check), so a document the default order
// suits costs one pass per write. Only a write the default order cannot send now adds a
// search over the pending writes.

import type { TableRowWrite, TableWritePlan } from '@tinycld/core/lib/forms/table-rows'
import { DOCUMENT_LINE_MAPPER, type DocumentLineRow } from './document-line-columns'
import {
    type DocumentLineInput,
    type DocumentTax,
    documentTotals,
    MAX_DOCUMENT_LINES,
} from './document-lines'
import { maxStoredAmount } from './money-text'
import type { TableWriteOps, TableWriteStep } from './table-writes'

type StoredLine = { id: string; position: number; line: DocumentLineInput }

type PendingWrite =
    | { kind: 'remove'; id: string; position: number }
    | { kind: 'update' | 'insert'; write: TableRowWrite }

function storedLineOf(
    line: Pick<
        DocumentLineRow,
        'id' | 'kind' | 'quantity' | 'rate' | 'percent_ppm' | 'taxable' | 'position'
    >
): StoredLine {
    return {
        id: line.id,
        position: line.position,
        line: {
            kind: line.kind,
            quantity: line.quantity,
            rate: line.rate,
            percentPpm: line.percent_ppm,
            taxable: line.taxable,
        },
    }
}

function writtenLineOf(write: TableRowWrite): StoredLine {
    const record = DOCUMENT_LINE_MAPPER.toRecord(write.row, write.position)
    return {
        id: write.row.id,
        position: write.position,
        line: {
            kind: record.kind,
            quantity: Number.isFinite(record.quantity) ? record.quantity : 0,
            rate: record.rate,
            percentPpm: record.percent_ppm,
            taxable: record.taxable,
        },
    }
}

// The server's line order: position, then id (server/sales_documents.go compareLines).
function byStoredOrder(a: StoredLine, b: StoredLine) {
    if (a.position !== b.position) return a.position - b.position
    if (a.id === b.id) return 0
    return a.id < b.id ? -1 : 1
}

// The server's whole-document checks of one line write (checkSalesDocTotals and the line
// count), over the lines as they would be stored, in server order.
function isStorable(lines: readonly StoredLine[], tax: DocumentTax): boolean {
    if (lines.length > MAX_DOCUMENT_LINES) return false
    const totals = documentTotals(
        lines.map(stored => stored.line),
        tax
    )
    if (totals.percentTargetErrors.length > 0 || totals.isTooLarge) return false
    if (totals.total > maxStoredAmount || totals.subtotal > maxStoredAmount) return false
    return totals.total >= 0
}

// The lines after one write, still in server order: the written line leaves its old
// place and goes in before the first line that sorts after it.
function applied(lines: readonly StoredLine[], pending: PendingWrite): StoredLine[] {
    const id = pending.kind === 'remove' ? pending.id : pending.write.row.id
    const rest = lines.filter(stored => stored.id !== id)
    if (pending.kind === 'remove') return rest
    const written = writtenLineOf(pending.write)
    const at = rest.findIndex(stored => byStoredOrder(written, stored) < 0)
    if (at < 0) return [...rest, written]
    return [...rest.slice(0, at), written, ...rest.slice(at)]
}

const byPosition = (a: TableRowWrite, b: TableRowWrite) => a.position - b.position

function defaultOrder(plan: TableWritePlan, stored: readonly StoredLine[]): PendingWrite[] {
    const positions = new Map(stored.map(line => [line.id, line.position]))
    const removes = plan.remove
        .map(id => ({ kind: 'remove' as const, id, position: positions.get(id) ?? 0 }))
        .sort((a, b) => b.position - a.position)
    const updates = [...plan.update]
        .sort(byPosition)
        .map(write => ({ kind: 'update' as const, write }))
    const inserts = [...plan.insert]
        .sort(byPosition)
        .map(write => ({ kind: 'insert' as const, write }))
    return [...removes, ...updates, ...inserts]
}

// A line write of a save, with the id of its row: a refused batch names the record of
// the operation that failed, and the save shows the refusal under that row.
export type DocumentLineStep<T> = TableWriteStep<T> & { rowId: string }

type OrderInput<T> = {
    storedLines: readonly Parameters<typeof storedLineOf>[0][]
    plan: TableWritePlan | undefined
    tax: DocumentTax
    ops: TableWriteOps<T>
}

// The ordered writes, and whether every one keeps the stored document valid.
function orderedSteps<T>(input: OrderInput<T>): { steps: DocumentLineStep<T>[]; holds: boolean } {
    const { plan, ops, tax } = input
    if (!plan) return { steps: [], holds: true }
    let lines = input.storedLines.map(storedLineOf).sort(byStoredOrder)
    const pending = defaultOrder(plan, lines)
    const steps: DocumentLineStep<T>[] = []
    while (pending.length > 0) {
        const index = nextWriteIndex(pending, lines, tax)
        if (index < 0) {
            // The server refuses the next write and the save stops at it.
            for (const write of pending) steps.push(stepOf(write, ops))
            return { steps, holds: false }
        }
        const [next] = pending.splice(index, 1)
        lines = applied(lines, next)
        steps.push(stepOf(next, ops))
    }
    return { steps, holds: true }
}

/**
 * The line writes of a save in an order the server accepts one by one: `storedLines` are
 * the document's lines as stored before the save (none for a new document), `tax` the
 * header tax the server holds while the lines are written. A step's `itemNumber` is its
 * row's place in the table from 1; a removed row has none.
 */
export function documentLineWriteSteps<T>(input: OrderInput<T>): DocumentLineStep<T>[] {
    return orderedSteps(input).steps
}

export type DocumentSavePlan<T> = { headerFirst: boolean; steps: DocumentLineStep<T>[] }

/**
 * The line writes of a save of a stored document, and where its one header write goes.
 * The header goes last: a post reads the lines, and the server checks each line write
 * with the tax it stores then (`storedTax`). A save that also changes the tax rate can
 * have no order that holds with the stored tax and one that holds with the new one
 * (`nextTax`); then the header goes first, when the stored lines hold with the new tax
 * too. When neither holds, the header stays last and the server's refusal names the line.
 */
export function documentSavePlan<T>(input: {
    storedLines: OrderInput<T>['storedLines']
    plan: TableWritePlan | undefined
    storedTax: DocumentTax
    nextTax: DocumentTax
    ops: TableWriteOps<T>
}): DocumentSavePlan<T> {
    const { storedLines, plan, ops } = input
    const last = orderedSteps({ storedLines, plan, tax: input.storedTax, ops })
    if (last.holds) return { headerFirst: false, steps: last.steps }
    const stored = storedLines.map(storedLineOf).sort(byStoredOrder)
    if (!isStorable(stored, input.nextTax)) return { headerFirst: false, steps: last.steps }
    const first = orderedSteps({ storedLines, plan, tax: input.nextTax, ops })
    if (!first.holds) return { headerFirst: false, steps: last.steps }
    return { headerFirst: true, steps: first.steps }
}

// The default next write when it keeps the stored document valid, else the first pending
// write that does; -1 when none does.
function nextWriteIndex(
    pending: readonly PendingWrite[],
    lines: readonly StoredLine[],
    tax: DocumentTax
): number {
    return pending.findIndex(write => isStorable(applied(lines, write), tax))
}

function stepOf<T>(pending: PendingWrite, ops: TableWriteOps<T>): DocumentLineStep<T> {
    if (pending.kind === 'remove') {
        return { rowId: pending.id, itemNumber: null, run: () => ops.remove(pending.id) }
    }
    const { write } = pending
    const run = pending.kind === 'update' ? () => ops.update(write) : () => ops.insert(write)
    return { rowId: write.row.id, itemNumber: write.position + 1, run }
}
