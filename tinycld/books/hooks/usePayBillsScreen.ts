import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useState } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'
import { PAY_BILLS_CHROME } from '../lib/pay-bills-kind'
import { payBillsScreenState } from '../lib/pay-bills-screen-state'
import { PAY_BILLS_MESSAGES } from '../lib/pay-bills-texts'
import { todayIso } from '../lib/register-range'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { useOpenBills } from './useOpenBills'
import { usePaidFromAccounts } from './usePaidFromAccounts'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

export type PayBillsScreenInput = {
    // `?vendor=`: the Vendor filter's vendor.
    vendor?: string
    // `?bill=`: that bill paid for its open balance, its vendor filtered.
    bill?: string
    // `?replaces=`: the bill payment a correction replaces (its form is checkpoint 3's).
    replaces?: string
}

type ReplacedStatus = 'posted' | 'void' | null

// The payment `?replaces` names: its status, null when no row has the id.
function useReplacedPayment(id: string) {
    const [paymentsCollection] = useStore('books_bill_payments')
    const query = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ payment: paymentsCollection })
                .where(({ payment }) => eq(payment.id, id))
                .findOne()
        },
        queryKey: ['books.payBills.replaces', id],
    })
    const isError = id !== '' && query.isError
    const status: ReplacedStatus = id ? (query.data?.status ?? null) : null
    return {
        status,
        read: {
            isReady: id === '' || query.isReady || isError,
            isError,
            recovery: isError
                ? { queries: [query.collection], sources: [paymentsCollection] }
                : NO_RECOVERY,
        },
    }
}

/**
 * Every read of the Pay Bills screen (spec §3.5 States, §4.4): access, settings (the
 * currency), the open bills and the vendors (useOpenBills), the Paid from accounts with
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
    const openBills = useOpenBills({ vendor: null, replaces: null })
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
    const reads = [accessRead, settingsRead, paidFromRead, replaced.read, ...openBills.reads]
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

    return {
        state,
        retry,
        chrome: PAY_BILLS_CHROME,
        title: PAY_BILLS_MESSAGES.title,
        canWrite: access.canWrite,
        // Pay and Pay & new disable while writes are unavailable (offline).
        writesAvailable: writes.available,
        currency: settings.settings?.currency ?? 'USD',
        today,
        rows: openBills.rows,
        vendorOptions: openBills.vendorOptions,
        startVendor: input.vendor ?? null,
        startBill: input.bill ?? null,
    }
}

export type PayBillsScreenData = ReturnType<typeof usePayBillsScreen>
