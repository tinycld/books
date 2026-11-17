import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useState } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'
import { PAY_BILLS_CHROME } from '../lib/pay-bills-kind'
import { payBillsScreenState } from '../lib/pay-bills-screen-state'
import { editTitleText, PAY_BILLS_MESSAGES } from '../lib/pay-bills-texts'
import { todayIso } from '../lib/register-range'
import { type BillPaymentLineRow, useBillPaymentRecord } from './useBillPaymentRecord'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { useOpenBills, usePayBillsVendors } from './useOpenBills'
import { usePaidFromAccounts } from './usePaidFromAccounts'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
const NO_LINES: readonly BillPaymentLineRow[] = []

export type PayBillsScreenInput = {
    // `?vendor=`: the Vendor filter's vendor.
    vendor?: string
    // `?bill=`: that bill paid for its open balance, its vendor filtered.
    bill?: string
    // `?replaces=`: the posted bill payment a correction replaces (spec §3.6).
    replaces?: string
}

// The payment `?replaces` names, with its lines and their bills: its status (null when no
// row has the id) and the read's state for the screen's merged Retry.
function useReplacedPayment(id: string) {
    const record = useBillPaymentRecord(id)
    return {
        record,
        status: record.payment?.status ?? null,
        read: {
            isReady: !record.isLoading,
            isError: record.isError,
            recovery: record.recovery,
        },
    }
}

/**
 * Every read of the Pay Bills screen (spec §3.5 States, §4.4): access, settings (the
 * currency), the open bills (useOpenBills) and the vendors (usePayBillsVendors), the Paid from accounts with
 * their balances and, on `?replaces`, the payment. Returns the surface to show
 * (`payBillsScreenState`: no access, one error with one Retry over every failed read,
 * loading, not found, cannot edit, or the form), and what the form starts from. The form's
 * list state (rows, empty, filtered-empty) is the form's own (usePayBillsForm `list`),
 * because the filters and a row's refusal decide it.
 */
export function usePayBillsScreen(input: PayBillsScreenInput) {
    const replacesId = input.replaces ?? ''
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const paidFrom = usePaidFromAccounts()
    const replaced = useReplacedPayment(replacesId)
    const original = replaced.record.payment
    // The original's lines widen the open balances only while it is posted: once a
    // correction of it posts, it is void and its lines no longer hold any bill's balance.
    const heldLines = original?.status === 'posted' ? replaced.record.lines : NO_LINES
    const openBills = useOpenBills({
        vendor: original?.vendor ?? null,
        replaces:
            replacesId === ''
                ? null
                : { vendorName: original?.vendorRow?.display_name ?? '', lines: heldLines },
    })
    const vendors = usePayBillsVendors(openBills.rows)
    const writes = useWritesAvailable()
    // The day the screen opened: the default Payment date and the Due filters' today.
    const [today] = useState(todayIso)

    const accessRead = {
        isReady: access.isReady || access.isError,
        isError: access.isError,
        recovery: access.isError ? { queries: [access.collection], sources: [] } : NO_RECOVERY,
    }
    const settingsRead = {
        isReady: settings.isReady || settings.hasLoadError,
        isError: settings.hasLoadError,
        recovery: settings.recovery,
    }
    const paidFromRead = {
        isReady: paidFrom.isReady || paidFrom.isError,
        isError: paidFrom.isError,
        recovery: paidFrom.recovery,
    }
    const reads = [
        accessRead,
        settingsRead,
        paidFromRead,
        replaced.read,
        openBills.read,
        vendors.read,
    ]
    // A non-writer is told so only once access is known; until then the screen loads.
    const canWrite = access.canWrite || !access.isReady
    const state = payBillsScreenState({
        canWrite,
        reads,
        replaces: replacesId === '' ? null : { status: replaced.status },
        rowCount: openBills.rows.length,
        shownCount: openBills.rows.length,
        paidFromOptionCount: paidFrom.optionsFor('').options.length,
    })

    const retry = () => {
        if (state.kind !== 'error') return
        void recoverLiveQueries({
            ...state.recovery,
            onError: err => log.error('books.billPayment', err),
        })
    }

    const isReplacing = replacesId !== '' && original !== null
    return {
        state,
        retry,
        chrome: PAY_BILLS_CHROME,
        mode: replacesId === '' ? ('new' as const) : ('replaces' as const),
        title: isReplacing ? editTitleText(original.number) : PAY_BILLS_MESSAGES.title,
        // `?replaces`: the posted payment the form corrects and its lines (the form's start
        // values, the fixed vendor, the "Payment 1004 now" line); null on a new screen.
        original: isReplacing ? { payment: original, lines: heldLines } : null,
        canWrite: access.canWrite,
        // Pay, Pay & new and Save disable while writes are unavailable (offline).
        writesAvailable: writes.available,
        currency: settings.settings?.currency ?? 'USD',
        today,
        rows: openBills.rows,
        vendorOptions: vendors.vendorOptions,
        startVendor: input.vendor ?? null,
        startBill: input.bill ?? null,
    }
}

export type PayBillsScreenData = ReturnType<typeof usePayBillsScreen>
