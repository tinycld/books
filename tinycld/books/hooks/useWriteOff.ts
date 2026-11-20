import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { extractValidationErrors, handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { materialize } from 'pbtsdb'
import { newRecordId } from 'pbtsdb/core'
import { useMemo } from 'react'
import { filteredAccountOptions } from '../lib/account-options'
import { writeOffOffered } from '../lib/document-actions'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { formatMoney } from '../lib/money'
import { formatDay, todayIso } from '../lib/register-range'
import {
    type WriteOffValues,
    writeOffDefaultAccount,
    writeOffDefaultDate,
    writeOffDialogState,
    writeOffNoBalanceText,
    writeOffRefusalErrors,
    writeOffSchema,
} from '../lib/write-off-schema'
import { useWriteOffStore } from '../stores/write-off-store'
import { useBooksSettings } from './useBooksSettings'
import { useMyCloseOverride } from './useMyCloseOverride'

const LOG_CONTEXT = 'books.writeOff'
const TOAST_MS = 4000
const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }
// The account types a write-off may name (write-off spec §3.2, Q3; Go's create guard).
const WRITE_OFF_ACCOUNT_TYPES = new Set(['expense', 'other_expense'])

type WriteOffVariables = WriteOffValues & {
    invoice: string
    // The open balance the dialog showed, in cents: the whole of it is written off (Q1).
    amount: number
    number: string
    currency: string
}

function isWriteOffAccount(account: { type: string; inactive: boolean }): boolean {
    return !account.inactive && WRITE_OFF_ACCOUNT_TYPES.has(account.type)
}

// The notice under the fields: the invoice stays posted at a balance of zero, and, for an
// invoice with sales tax, the tax stays owed (Q2).
function noticeText(taxTotal: number, currency: string): string {
    const posted = `The invoice stays posted. Its balance due becomes ${formatMoney(0, currency)}.`
    if (taxTotal <= 0) return posted
    const tax = `Its sales tax of ${formatMoney(taxTotal, currency)} stays owed to the tax agency.`
    return `${posted} ${tax}`
}

function toastText(number: string, amount: number, currency: string): string {
    return `Invoice ${number} written off: ${formatMoney(amount, currency)}`
}

function recoveryOf(
    isError: boolean,
    query: LiveRecovery['queries'][number] | undefined,
    sources: LiveRecovery['sources']
): LiveRecovery {
    return isError && query ? { queries: [query], sources } : NO_RECOVERY
}

/**
 * The reads and the drawn state of the Write off dialog of the screen `owner` (write-off
 * spec §3.2, §3.3). Reads, each one live query: the invoice the store names (by id, with
 * its customer's name through `materialize()`, so the figure follows its balance on every
 * screen), the chart's active expense and other expense accounts in chart order
 * (filteredAccountOptions), the settings' close date, the user's close-date override, and
 * the newest posted write-off, whose account is the default. Until the invoice lands the
 * dialog loads: no figure, no number in the title or the button. A failed read of any of
 * them shows the load error with one Retry. `ready` is set once every read has landed: the
 * dialog then mounts the form part (useWriteOffForm), which starts from it.
 */
export function useWriteOff(owner: string) {
    const openFor = useWriteOffStore(state => state.openFor)
    const isHeld = useWriteOffStore(state => state.isHeld)
    const invoiceId = openFor?.owner === owner ? openFor.invoiceId : ''
    const isOpen = invoiceId !== ''
    const [invoicesCollection, customersCollection, accountsCollection, writeOffsCollection] =
        useStore('books_invoices', 'books_customers', 'books_accounts', 'books_write_offs')
    const settings = useBooksSettings()
    const closeOverride = useMyCloseOverride()
    const writes = useWritesAvailable()

    const invoiceQuery = useLiveQuery({
        query: q => {
            if (!isOpen) return undefined
            return q
                .from({ invoice: invoicesCollection })
                .where(({ invoice }) => eq(invoice.id, invoiceId))
                .select(({ invoice }) => ({
                    id: invoice.id,
                    number: invoice.number,
                    date: invoice.date,
                    status: invoice.status,
                    balance: invoice.balance,
                    tax_total: invoice.tax_total,
                    currency: invoice.currency,
                    customer: materialize(
                        q
                            .from({ c: customersCollection })
                            .where(({ c }) => eq(c.id, invoice.customer))
                            .select(({ c }) => ({ display_name: c.display_name }))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.writeOff.invoice', invoiceId],
    })
    const accountsQuery = useLiveQuery({
        query: q => {
            if (!isOpen) return undefined
            return q.from({ account: accountsCollection }).select(({ account }) => ({
                id: account.id,
                name: account.name,
                number: account.number,
                type: account.type,
                parent: account.parent,
                inactive: account.inactive,
                detail_type: account.detail_type,
            }))
        },
        queryKey: ['books.writeOff.accounts', isOpen],
    })
    const newestQuery = useLiveQuery({
        query: q => {
            if (!isOpen) return undefined
            return q
                .from({ w: writeOffsCollection })
                .where(({ w }) => eq(w.status, 'posted'))
                .orderBy(({ w }) => w.created, 'desc')
                .select(({ w }) => ({ account: w.account }))
                .findOne()
        },
        queryKey: ['books.writeOff.newest', isOpen],
    })

    const invoice = isOpen && invoiceQuery.isReady ? invoiceQuery.data : undefined
    const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data])
    const options = useMemo(
        () => filteredAccountOptions(accounts, '', isWriteOffAccount).options,
        [accounts]
    )
    const newestAccount = newestQuery.data?.account ?? ''

    const hasLoadError =
        invoiceQuery.isError ||
        accountsQuery.isError ||
        newestQuery.isError ||
        settings.hasLoadError ||
        closeOverride.isError
    const isLoading =
        !invoiceQuery.isReady ||
        !accountsQuery.isReady ||
        !newestQuery.isReady ||
        !settings.isReady ||
        !closeOverride.isReady

    const currency = invoice?.currency || settings.settings?.currency || ''
    const invoiceDate = invoice?.date.slice(0, 10) ?? ''
    const closeDate = settings.settings?.close_date.slice(0, 10) ?? ''
    const hasOverride = closeOverride.override !== undefined

    // A balance of zero, a void invoice or one that went away cannot be written off: the
    // dialog says so and the button waits (the server refuses it too, msgWriteOffNoBalance).
    const isInvoiceOpen =
        invoice !== undefined && writeOffOffered('invoice', invoice.status, invoice.balance)
    const state = writeOffDialogState({
        isLoading,
        hasLoadError,
        isInvoiceLoaded: invoice !== undefined,
        isInvoiceOpen,
        optionCount: options.length,
        writesAvailable: writes.available,
        isHeld,
    })

    // The account choices with their detail types, for the default account
    // (writeOffDefaultAccount): the options keep only the id, the label and the depth.
    const offered = useMemo(() => {
        const detailOf = new Map(accounts.map(account => [account.id, account.detail_type]))
        return options.map(option => ({
            id: option.value,
            detail_type: detailOf.get(option.value) ?? '',
        }))
    }, [accounts, options])

    const isFormBody = state.body === 'form' || state.body === 'no-account'
    const ready =
        isFormBody && invoice
            ? {
                  invoice,
                  currency,
                  schemaInput: { invoiceDate, closeDate, hasOverride },
                  defaults: {
                      date: writeOffDefaultDate(todayIso(), invoiceDate),
                      account: writeOffDefaultAccount(offered, newestAccount),
                      memo: '',
                  },
              }
            : null

    // Cancel, Escape and the backdrop do nothing while the write runs.
    const close = () => {
        if (useWriteOffStore.getState().isHeld) return
        useWriteOffStore.getState().close()
    }

    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([
                recoveryOf(invoiceQuery.isError, invoiceQuery.collection, [
                    invoicesCollection,
                    customersCollection,
                ]),
                recoveryOf(accountsQuery.isError, accountsQuery.collection, [accountsCollection]),
                recoveryOf(newestQuery.isError, newestQuery.collection, [writeOffsCollection]),
                settings.recovery,
                closeOverride.recovery,
            ]),
            onError: error => log.error(LOG_CONTEXT, error),
        })
    }

    const number = invoice?.number ?? ''
    const summaryParts = invoice
        ? [
              invoice.customer?.display_name ?? '',
              `Invoice ${number}`,
              invoiceDate ? formatDay(invoiceDate) : '',
          ]
        : []
    // No figure and no amount in the button until the invoice's balance has landed.
    const amount = invoice ? formatMoney(invoice.balance, currency) : ''
    const titleParts = ['Write off invoice', number]
    const actionParts = ['Write off', amount]
    return {
        isOpen,
        state,
        isHeld,
        options,
        ready,
        title: titleParts.filter(part => part !== '').join(' '),
        summary: summaryParts.filter(part => part !== '').join(' · '),
        amount,
        actionLabel: actionParts.filter(part => part !== '').join(' '),
        notice: noticeText(invoice?.tax_total ?? 0, currency),
        noBalanceText: writeOffNoBalanceText(number),
        close,
        retry,
    }
}

export type WriteOffDialogModel = ReturnType<typeof useWriteOff>
export type WriteOffReady = NonNullable<WriteOffDialogModel['ready']>

/**
 * The form part of the Write off dialog, mounted once the reads have landed (`ready`), so
 * the form starts from its defaults (writeOffDefaultDate, writeOffDefaultAccount) with no
 * copy in state. The submit validates through writeOffSchema, holds the dialog
 * (useWriteOffStore.hold, synchronous, before the write) and inserts ONE posted write-off of
 * the balance shown. A refusal keyed `date`, `account` or `memo` goes under that field, the
 * others joined into one root error (writeOffRefusalErrors); the hold comes off either way.
 * Success closes the dialog and toasts the amount sent.
 */
export function useWriteOffForm(ready: WriteOffReady) {
    const [writeOffsCollection] = useStore('books_write_offs')
    const { invoiceDate, closeDate, hasOverride } = ready.schemaInput
    const resolver = useMemo(
        () => zodResolver(writeOffSchema({ invoiceDate, closeDate, hasOverride })),
        [invoiceDate, closeDate, hasOverride]
    )
    const form = useForm<WriteOffValues>({ defaultValues: ready.defaults, resolver })
    const { setError, getValues } = form

    const showRefusal = (error: unknown) => {
        const errors = writeOffRefusalErrors(extractValidationErrors(error) ?? {})
        if (errors.length === 0) {
            handleMutationErrorsWithForm({
                setError,
                getValues,
                rootMessage: true,
                operation: LOG_CONTEXT,
            })(error)
            return
        }
        for (const { target, message } of errors) {
            setError(target, { type: 'server', message })
        }
    }

    const write = useMutation({
        mutationFn: function* (variables: WriteOffVariables) {
            yield writeOffsCollection.insert({
                id: newRecordId(),
                invoice: variables.invoice,
                date: variables.date,
                account: variables.account,
                amount: variables.amount,
                memo: variables.memo,
                status: 'posted',
            })
        },
        onSuccess: (_data, variables) => {
            useToastStore.getState().addToast({
                title: toastText(variables.number, variables.amount, variables.currency),
                variant: 'success',
                duration: TOAST_MS,
            })
            const store = useWriteOffStore.getState()
            store.release()
            store.close()
        },
        onError: error => {
            showRefusal(error)
            useWriteOffStore.getState().release()
        },
    })

    const { invoice, currency } = ready
    const submit = () =>
        form.handleSubmit(values => {
            // The store's flag, not the render's `isPending`: two submits in one render both
            // see it, since it is set synchronously below.
            const store = useWriteOffStore.getState()
            if (store.isHeld) return
            // Synchronous, before the optimistic insert changes the invoice's sections.
            store.hold()
            write.mutate({
                ...values,
                invoice: invoice.id,
                amount: invoice.balance,
                number: invoice.number,
                currency,
            })
        })()

    return { form, submit }
}

export type WriteOffFormModel = ReturnType<typeof useWriteOffForm>
