import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { type FieldErrors, useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import {
    type CopyToBillFormValues,
    type CopyToBillRow,
    copyToBillChoiceOf,
    copyToBillFormValues,
    copyToBillRows,
    copyToBillSchemaFor,
    overOpenText,
} from '../lib/copy-to-bill'
import { orderReadActions } from '../lib/document-lifecycle'
import { lineAmount } from '../lib/document-lines'
import { formatMoney } from '../lib/money'
import { moneyInputCents } from '../lib/money-input'
import { isOrderLineOpen } from '../lib/purchase-order-status'
import { BILL_KIND } from '../lib/sales-document-kinds'
import { useCopyToBillStore } from '../stores/copy-to-bill-store'
import { useBooksAccess } from './useBooksAccess'
import { useOpenNewDocument } from './useOpenDocument'
import { usePurchaseOrderBills } from './usePurchaseOrderBills'

const LOG_CONTEXT = 'books.purchase-order'

// The dialog's body: the skeleton while a read loads, the load error with Retry when one
// failed, the notice when the order went away, closed or has nothing open while the
// dialog is open, else the rows.
export type CopyToBillBody = 'loading' | 'load-error' | 'gone' | 'nothing-open' | 'rows'

// The order and its lines, which the dialog reads. The lines' query key is the order's
// read view's (purchase-order-data.ts), so over the read view it sends no request.
function useCopyToBillReads(orderId: string) {
    const [ordersCollection, linesCollection, vendorsCollection] = useStore(
        'books_purchase_orders',
        'books_purchase_order_lines',
        'books_vendors'
    )
    const [productsCollection, accountsCollection] = useStore('books_products', 'books_accounts')
    const orderQuery = useLiveQuery({
        query: q => {
            if (!orderId) return undefined
            return q
                .from({ order: ordersCollection })
                .where(({ order }) => eq(order.id, orderId))
                .select(({ order }) => ({
                    id: order.id,
                    number: order.number,
                    status: order.status,
                    closed_reason: order.closed_reason,
                    vendorRow: materialize(
                        q
                            .from({ v: vendorsCollection })
                            .where(({ v }) => eq(v.id, order.vendor))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.purchase-order.copy-to-bill', orderId],
    })
    const linesQuery = useLiveQuery({
        query: q => {
            if (!orderId) return undefined
            return q
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.purchase_order, orderId))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    ...line,
                    productRow: materialize(
                        q
                            .from({ p: productsCollection })
                            .where(({ p }) => eq(p.id, line.product))
                            .findOne()
                    ),
                    accountRow: materialize(
                        q
                            .from({ a: accountsCollection })
                            .where(({ a }) => eq(a.id, line.account))
                            .findOne()
                    ),
                }))
        },
        queryKey: ['books.purchase-order.lines', orderId],
    })
    const retry = () => {
        void recoverLiveQueries({
            queries: [orderQuery.collection, linesQuery.collection],
            sources: [
                ordersCollection,
                linesCollection,
                vendorsCollection,
                productsCollection,
                accountsCollection,
            ],
            onError: err => log.error(LOG_CONTEXT, err, { operation: 'copy-to-bill' }),
        })
    }
    return {
        order: orderQuery.data,
        lines: linesQuery.data,
        isReady: orderQuery.isReady && linesQuery.isReady,
        isError: orderQuery.isError || linesQuery.isError,
        retry,
    }
}

function bodyOf(state: {
    isReady: boolean
    isError: boolean
    hasOrder: boolean
    isOpen: boolean
    rowCount: number
}): CopyToBillBody {
    if (state.isError) return 'load-error'
    if (!state.isReady) return 'loading'
    if (!state.hasOrder) return 'gone'
    if (!state.isOpen || state.rowCount === 0) return 'nothing-open'
    return 'rows'
}

/**
 * Copy to bill of one purchase order (purchase order spec §3.7): its open lines (each
 * stored line with its product and account rows; isOrderLineOpen), the lines of its draft
 * bills (usePurchaseOrderBills), whether Copy to bill is offered (orderReadActions, the read
 * bar's rule: a writer on an open order with an open line), and `open(owner)`, which opens
 * the dialog of the screen `owner` through useCopyToBillStore. `orderId` '' reads nothing
 * and offers nothing. Retry recovers every read. Checkpoint 5's row menu opens the dialog
 * through it too.
 */
export function useCopyToBill(orderId: string) {
    const openStore = useCopyToBillStore(state => state.open)
    const access = useBooksAccess()
    const reads = useCopyToBillReads(orderId)
    const bills = usePurchaseOrderBills(orderId)
    const order = reads.order
    const lines = reads.lines
    const openLines = useMemo(() => (lines ?? []).filter(isOrderLineOpen), [lines])
    const isOffered =
        order !== undefined &&
        orderReadActions({
            status: order.status === 'closed' ? 'closed' : 'open',
            closedReason: order.closed_reason,
            canWrite: access.canWrite,
            isAdmin: access.isAdmin,
            hasOpenLine: openLines.length > 0,
        }).includes('copy_to_bill')
    const retry = () => {
        reads.retry()
        bills.retry()
    }
    const open = (owner: string) => openStore(orderId, owner)
    return {
        order,
        lines,
        openLines,
        draftLines: bills.draftLines,
        isOffered,
        isReady: reads.isReady && bills.isReady,
        isError: reads.isError || bills.isError,
        retry,
        open,
    }
}

/**
 * The Copy to bill dialog of a screen (purchase order spec §3.7): open while
 * useCopyToBillStore names an order for this `owner`. It reads the order through
 * useCopyToBill (its number, status and vendor, its lines and the lines of its draft
 * bills), and gives the rows (copyToBillRows: each open line at what is open less what the
 * drafts hold). Create bill stores the choice for the bill form and opens
 * `books/bills/new?purchase_order=<id>` with useOpenNewDocument (pushed, so Back returns to
 * the screen); nothing is written.
 */
export function useCopyToBillDialog(owner: string, currency: string) {
    const openFor = useCopyToBillStore(state => state.openFor)
    const closeStore = useCopyToBillStore(state => state.close)
    const put = useCopyToBillStore(state => state.put)
    const openNewBill = useOpenNewDocument(BILL_KIND)
    const orderId = openFor?.owner === owner ? openFor.orderId : ''
    const copy = useCopyToBill(orderId)
    const lines = copy.lines
    const draftLines = copy.draftLines
    const rows = useMemo(
        () => copyToBillRows(lines ?? [], draftLines, currency),
        [lines, draftLines, currency]
    )
    const order = copy.order
    const isOpen = order?.status === 'open' && copy.openLines.length > 0
    const body = bodyOf({
        isReady: copy.isReady,
        isError: copy.isError,
        hasOrder: order !== undefined,
        isOpen,
        rowCount: rows.length,
    })
    const vendorName = order?.vendorRow?.display_name ?? ''
    const summary = order
        ? `Choose what this bill covers. Purchase order ${order.number} · ${vendorName}`
        : 'Choose what this bill covers.'
    const retry = copy.retry
    const create = (values: CopyToBillFormValues) => {
        put(orderId, copyToBillChoiceOf(values, currency))
        closeStore()
        openNewBill({ purchase_order: orderId })
    }
    return {
        isOpen: orderId !== '',
        body,
        rows,
        summary,
        currency,
        close: closeStore,
        retry,
        create,
    }
}

export type CopyToBillModel = ReturnType<typeof useCopyToBillDialog>

// A row's value now, as the form holds it.
type WatchedRow = CopyToBillFormValues['rows'][number]

// What a ticked row adds to the bill, in cents: Qty to bill × rate, or Amount to bill; 0
// while its value does not read.
function rowCents(row: CopyToBillRow, value: WatchedRow | undefined, currency: string): number {
    if (!value?.isTicked) return 0
    if (row.kind === 'item') {
        return typeof value.quantity === 'number' ? lineAmount(value.quantity, row.rate) : 0
    }
    return moneyInputCents(value.amount, currency) ?? 0
}

/**
 * The dialog's form (useForm + zodResolver of copyToBillSchemaFor): its rows start at
 * copyToBillFormValues. The count ("2 of 3 lines"), the all-rows tick box's state, the
 * total ("Bill total $x") and each row's hint ("More than the 6 still open.") are derived
 * during render from the watched rows.
 */
export function useCopyToBillForm(model: CopyToBillModel) {
    const { rows, currency } = model
    const schema = useMemo(() => copyToBillSchemaFor(currency), [currency])
    const defaultValues = useMemo(() => copyToBillFormValues(rows), [rows])
    const form = useForm<CopyToBillFormValues>({
        resolver: zodResolver(schema),
        defaultValues,
    })
    const watched = useWatch({ control: form.control, name: 'rows' }) ?? defaultValues.rows
    const ticked = watched.filter(row => row.isTicked).length
    const allState: 'empty' | 'checked' | 'mixed' =
        ticked === 0 ? 'empty' : ticked === rows.length ? 'checked' : 'mixed'
    const total = rows.reduce((sum, row, index) => sum + rowCents(row, watched[index], currency), 0)
    const hints = rows.map((row, index) => {
        const value = watched[index]
        if (!value?.isTicked) return null
        return overOpenText(row, value, currency)
    })
    const setAll = () => {
        const next = allState !== 'checked'
        rows.forEach((_row, index) => {
            form.setValue(`rows.${index}.isTicked`, next, { shouldDirty: true })
        })
    }
    const submit = form.handleSubmit(values => model.create(values))
    // The schema files "Choose at least one line." at `rows` (copyToBillSchemaFor). The
    // dialog's FormErrorSummary shows only it, after a submit: each row's own message is
    // drawn under its input.
    const rowsError = form.formState.errors.rows
    const chooseLineError = rowsError?.message ?? rowsError?.root?.message ?? ''
    const rootError = { type: 'custom', message: chooseLineError } as const
    const summaryErrors: FieldErrors<CopyToBillFormValues> =
        chooseLineError === '' ? {} : { root: rootError }
    const isSummaryEnabled = form.formState.isSubmitted
    return {
        form,
        rows,
        currency,
        watched,
        count: `${ticked} of ${rows.length} lines`,
        totalText: `Bill total ${formatMoney(total, currency)}`,
        allState,
        hints,
        summaryErrors,
        isSummaryEnabled,
        setAll,
        submit,
    }
}
