import { type ScopeOwner, ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useMemo, useState } from 'react'
import type { OutstandingInvoice } from '../../hooks/useOutstandingInvoices'
import type { PaymentApplicationRow } from '../../hooks/usePaymentRecord'
import {
    type PaymentScreenData,
    type PaymentScreenInput,
    usePaymentScreen,
} from '../../hooks/usePaymentScreen'
import type { OutstandingRow } from '../../lib/payment-allocation'
import { paymentDefaultDeposit } from '../../lib/payment-deposit'
import { PAYMENT_CHROME } from '../../lib/payment-kind'
import { paymentRefusalErrors } from '../../lib/payment-refusals'
import { draftPaymentValues, newPaymentValues } from '../../lib/payment-values'
import { todayIso } from '../../lib/register-range'
import { type PaymentRefusedSave, refusedSaveOf } from '../../stores/payment-save-store'
import { DocumentChromeContext } from '../documents/document-chrome'
import { PaymentForm } from './PaymentForm'
import { PaymentReadView } from './PaymentReadView'
import { PaymentStateNotice } from './PaymentStateNotice'

// The invoices stored applications name, as the outstanding list reads them.
function storedInvoicesOf(applications: readonly PaymentApplicationRow[]): OutstandingInvoice[] {
    return applications.flatMap(application => {
        const invoice = application.invoiceRow
        if (!invoice) return []
        return [
            {
                id: invoice.id,
                number: invoice.number,
                date: invoice.date,
                due_date: invoice.due_date,
                total: invoice.total,
                balance: invoice.balance,
                customer: invoice.customer,
            },
        ]
    })
}

// Stored applications as the form's start values read them; `extra` adds what a
// corrected original applied to each invoice's open balance.
function draftApplicationsOf(
    applications: readonly PaymentApplicationRow[],
    extra: Readonly<Record<string, number>>
) {
    return applications.map(application => ({
        invoice: application.invoice,
        amount: application.amount,
        open: (application.invoiceRow?.balance ?? 0) + (extra[application.invoice] ?? 0),
        number: application.invoiceRow?.number ?? '',
    }))
}

// `?invoice` ticks its invoice only when it is a posted invoice of `?customer`.
function startRowOf(screen: PaymentScreenData, customer: string): OutstandingRow | null {
    const invoice = screen.startInvoice
    if (!invoice || invoice.customer !== customer || invoice.status !== 'posted') return null
    return {
        id: invoice.id,
        number: invoice.number,
        date: invoice.date.slice(0, 10),
        due_date: invoice.due_date.slice(0, 10),
        total: invoice.total,
        open: invoice.balance,
    }
}

interface PaymentFormRouteProps {
    screen: PaymentScreenData
    input: PaymentScreenInput
    refused: PaymentRefusedSave | null
    scopeOwner: ScopeOwner
}

// The form of a new payment, a correction (`?replaces` of a posted payment) or a draft.
function PaymentFormRoute({ screen, input, refused, scopeOwner }: PaymentFormRouteProps) {
    const { payment, applications, original, originalApplications } = screen
    const isDraft = input.id !== null
    const sourceApplications = isDraft ? applications : originalApplications
    const extraOpen = useMemo(() => {
        if (isDraft) return {}
        return Object.fromEntries(
            originalApplications.map(application => [application.invoice, application.amount])
        )
    }, [isDraft, originalApplications])
    const storedInvoices = useMemo(() => storedInvoicesOf(sourceApplications), [sourceApplications])
    const storedApplications = useMemo(
        () =>
            isDraft
                ? applications.map(application => ({
                      id: application.id,
                      invoice: application.invoice,
                      amount: application.amount,
                  }))
                : [],
        [isDraft, applications]
    )
    const customer = input.customer ?? ''
    const startValues = () => {
        if (refused) return refused.values
        if (isDraft && payment) {
            return draftPaymentValues(payment, draftApplicationsOf(applications, extraOpen))
        }
        if (original) {
            return draftPaymentValues(
                original,
                draftApplicationsOf(originalApplications, extraOpen)
            )
        }
        return newPaymentValues({
            today: todayIso(),
            customer,
            invoice: startRowOf(screen, customer),
            depositTo: paymentDefaultDeposit(screen.depositAccounts),
        })
    }
    // The form reads its start values, and a handed-off refusal as its start errors, once,
    // at mount.
    const [start] = useState(() => ({
        values: startValues(),
        errors: refused ? paymentRefusalErrors(refused.error, refused.stored) : undefined,
    }))
    const title = titleOf(isDraft, original?.number)
    return (
        <PaymentForm
            initial={start.values}
            initialErrors={start.errors}
            holdsHandOff={refused !== null}
            title={title}
            currency={screen.currency}
            depositAccounts={screen.depositAccounts}
            paymentId={input.id}
            storedApplications={storedApplications}
            storedInvoices={storedInvoices}
            extraOpen={extraOpen}
            replaces={input.replaces}
            openedWithCustomer={customer}
            canWrite={screen.canWrite}
            scopeOwner={scopeOwner}
        />
    )
}

function titleOf(isDraft: boolean, originalNumber: string | undefined): string {
    if (isDraft) return 'Draft payment'
    if (originalNumber) return `Edit payment ${originalNumber}`
    return 'Receive payment'
}

function PaymentSurface({ screen, input, refused, scopeOwner }: PaymentFormRouteProps) {
    if (screen.state === 'form') {
        return (
            <PaymentFormRoute
                screen={screen}
                input={input}
                refused={refused}
                scopeOwner={scopeOwner}
            />
        )
    }
    if (screen.state === 'read' && screen.payment) {
        return (
            <PaymentReadView
                payment={screen.payment}
                applications={screen.applications}
                customerName={screen.customerName}
                depositAccounts={screen.depositAccounts}
                currency={screen.currency}
                canWrite={screen.canWrite}
                scopeOwner={scopeOwner}
            />
        )
    }
    const notice = screen.state === 'read' ? 'loading' : screen.state
    return <PaymentStateNotice state={notice} onRetry={screen.retry} />
}

/**
 * The receive-payment screen at `books/payments/new` and `books/payments/<id>`: the shared
 * document chrome reads PAYMENT_CHROME, and the screen's `compose` scope holds the keys
 * of the form or the read view. A draft opens in the form, a posted or void payment in
 * the read view.
 */
export function PaymentScreen(input: PaymentScreenInput) {
    const scopeOwner = useShortcutScope('compose')
    const screen = usePaymentScreen(input)
    // A refusal the new form handed over when it moved to this draft's route.
    const [refused] = useState(() => refusedSaveOf(input.id))
    return (
        <DocumentChromeContext.Provider value={PAYMENT_CHROME}>
            <ScopeProvider owner={scopeOwner}>
                <PaymentSurface
                    screen={screen}
                    input={input}
                    refused={refused}
                    scopeOwner={scopeOwner}
                />
            </ScopeProvider>
        </DocumentChromeContext.Provider>
    )
}
