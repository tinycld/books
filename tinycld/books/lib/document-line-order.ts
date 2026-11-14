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
//
// A kind with more than one line table (a bill's account and product lines) sends the
// writes of all its tables as one set: the server checks each write against the whole
// document, so a table's writes are ordered against every table's lines. The default
// order takes the tables in form order.

import type { TableRowWrite, TableWritePlan } from '@tinycld/core/lib/forms/table-rows'
import type { DocumentLineRow } from './document-line-columns'
import {
    type DocumentLineInput,
    type DocumentLineKind,
    type DocumentTax,
    documentTotals,
    MAX_DOCUMENT_LINES,
} from './document-lines'
import { documentLinesOf } from './document-values'
import { maxStoredAmount } from './money-text'
import type { TableWriteOps, TableWriteStep } from './table-writes'

type StoredLine = { id: string; position: number; line: DocumentLineInput }

type PendingWrite = { table: string } & (
    | { kind: 'remove'; id: string; position: number }
    | { kind: 'update' | 'insert'; write: TableRowWrite }
)

// A stored line of any line kind; `amount` is read only on an account line, whose amount
// is typed. A purchase line (a bill's) has no percent and no tax flag.
function storedLineOf(
    line: Pick<DocumentLineRow, 'id' | 'quantity' | 'rate' | 'position'> &
        Partial<Pick<DocumentLineRow, 'percent_ppm' | 'taxable'>> & {
            kind: DocumentLineKind
            amount?: number
        }
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
            amount: line.amount,
        },
    }
}

// The line a write stores, as the totals read a form row (documentLinesOf: an account
// line's typed amount, an item's quantity and rate).
function writtenLineOf(write: TableRowWrite): StoredLine {
    const [line] = documentLinesOf([write.row])
    return { id: write.row.id, position: write.position, line }
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

function defaultOrder(
    table: string,
    plan: TableWritePlan,
    stored: readonly StoredLine[]
): PendingWrite[] {
    const positions = new Map(stored.map(line => [line.id, line.position]))
    const removes = plan.remove
        .map(id => ({ table, kind: 'remove' as const, id, position: positions.get(id) ?? 0 }))
        .sort((a, b) => b.position - a.position)
    const updates = [...plan.update]
        .sort(byPosition)
        .map(write => ({ table, kind: 'update' as const, write }))
    const inserts = [...plan.insert]
        .sort(byPosition)
        .map(write => ({ table, kind: 'insert' as const, write }))
    return [...removes, ...updates, ...inserts]
}

type StoredLineInput = Parameters<typeof storedLineOf>[0]

// A line write of a save, with the id of its row and the line table that row belongs to:
// a refused batch names the record of the operation that failed, and the save shows the
// refusal under that row.
export type DocumentLineStep<T> = TableWriteStep<T> & { rowId: string; table: string }

// One line table's plan, with the ops that write its rows (each table's rows convert
// through its own mapper).
type TablePlan<T> = { table: string; plan: TableWritePlan | undefined; ops: TableWriteOps<T> }

type TablesOrderInput<T> = {
    storedLines: readonly StoredLineInput[]
    plans: readonly TablePlan<T>[]
    tax: DocumentTax
}

// The ordered writes of every table, and whether every one keeps the stored document
// valid.
function orderedSteps<T>(input: TablesOrderInput<T>): {
    steps: DocumentLineStep<T>[]
    holds: boolean
} {
    const { tax } = input
    const opsByTable = new Map(input.plans.map(({ table, ops }) => [table, ops]))
    const stepOf = (pending: PendingWrite) => {
        const ops = opsByTable.get(pending.table)
        if (!ops) throw new Error(`no line writes for table ${pending.table}`)
        return tableStepOf(pending, ops)
    }
    let lines = input.storedLines.map(storedLineOf).sort(byStoredOrder)
    const stored = lines
    const pending = input.plans.flatMap(({ table, plan }) =>
        plan ? defaultOrder(table, plan, stored) : []
    )
    const steps: DocumentLineStep<T>[] = []
    while (pending.length > 0) {
        const index = nextWriteIndex(pending, lines, tax)
        if (index < 0) {
            // The server refuses the next write and the save stops at it.
            for (const write of pending) steps.push(stepOf(write))
            return { steps, holds: false }
        }
        const [next] = pending.splice(index, 1)
        lines = applied(lines, next)
        steps.push(stepOf(next))
    }
    return { steps, holds: true }
}

type OrderInput<T> = {
    storedLines: readonly StoredLineInput[]
    plan: TableWritePlan | undefined
    tax: DocumentTax
    ops: TableWriteOps<T>
}

// One table's input as the tables' input: the table has no key of its own.
function oneTable<T>({ plan, ops, ...rest }: OrderInput<T>): TablesOrderInput<T> {
    return { ...rest, plans: [{ table: '', plan, ops }] }
}

/**
 * The line writes of a save in an order the server accepts one by one: `storedLines` are
 * the document's lines as stored before the save (none for a new document), `tax` the
 * header tax the server holds while the lines are written. A step's `itemNumber` is its
 * row's place in the table from 1; a removed row has none.
 */
export function documentLineWriteSteps<T>(input: OrderInput<T>): DocumentLineStep<T>[] {
    return orderedSteps(oneTable(input)).steps
}

/**
 * The line writes of a save over every line table of a kind, as documentLineWriteSteps
 * orders one table's: `storedLines` are the document's lines of all its tables, `plans`
 * each table's plan in form order with the ops that write its rows, and each step names
 * its table.
 */
export function documentTablesWriteSteps<T>(input: TablesOrderInput<T>): DocumentLineStep<T>[] {
    return orderedSteps(input).steps
}

export type DocumentSavePlan<T> = { headerFirst: boolean; steps: DocumentLineStep<T>[] }

type SavePlanInput<T> = {
    storedLines: readonly StoredLineInput[]
    plans: readonly TablePlan<T>[]
    storedTax: DocumentTax
    nextTax: DocumentTax
}

/**
 * The line writes of a save of a stored document, and where its one header write goes.
 * The header goes last: a post reads the lines, and the server checks each line write
 * with the tax it stores then (`storedTax`). A save that also changes the tax rate can
 * have no order that holds with the stored tax and one that holds with the new one
 * (`nextTax`); then the header goes first, when the stored lines hold with the new tax
 * too. When neither holds, the header stays last and the server's refusal names the line.
 */
export function documentSavePlan<T>(input: {
    storedLines: readonly StoredLineInput[]
    plan: TableWritePlan | undefined
    storedTax: DocumentTax
    nextTax: DocumentTax
    ops: TableWriteOps<T>
}): DocumentSavePlan<T> {
    const { plan, ops, ...rest } = input
    return documentTablesSavePlan({ ...rest, plans: [{ table: '', plan, ops }] })
}

/**
 * documentSavePlan over every line table of a kind, with `plans` as
 * documentTablesWriteSteps takes them.
 */
export function documentTablesSavePlan<T>(input: SavePlanInput<T>): DocumentSavePlan<T> {
    const { storedLines, plans } = input
    const last = orderedSteps({ storedLines, plans, tax: input.storedTax })
    if (last.holds) return { headerFirst: false, steps: last.steps }
    const stored = storedLines.map(storedLineOf).sort(byStoredOrder)
    if (!isStorable(stored, input.nextTax)) return { headerFirst: false, steps: last.steps }
    const first = orderedSteps({ storedLines, plans, tax: input.nextTax })
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

function tableStepOf<T>(pending: PendingWrite, ops: TableWriteOps<T>): DocumentLineStep<T> {
    const { table } = pending
    if (pending.kind === 'remove') {
        return { table, rowId: pending.id, itemNumber: null, run: () => ops.remove(pending.id) }
    }
    const { write } = pending
    const run = pending.kind === 'update' ? () => ops.update(write) : () => ops.insert(write)
    return { table, rowId: write.row.id, itemNumber: write.position + 1, run }
}
