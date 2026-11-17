import { type ScopeOwner, ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useMemo, useState } from 'react'
import { View } from 'react-native'
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
import {
    correctionPaymentValues,
    draftPaymentValues,
    newPaymentValues,
} from '../../lib/payment-values'
import { todayIso } from '../../lib/register-range'
import { type PaymentRefusedSave, refusedSaveOf } from '../../stores/payment-save-store'
import { DocumentChromeContext } from '../documents/document-chrome'
import { PaymentForm } from './PaymentForm'
import { PaymentReadView } from './PaymentReadView'
import { PaymentStateNotice } from './PaymentStateNotice'

// A stored application whose invoice row is in the store.
type ReadyApplication = PaymentApplicationRow & {
    invoiceRow: NonNullable<PaymentApplicationRow['invoiceRow']>
}

// The applications with their invoices; null while any invoice row is not in the store
// (the screen stays on loading: an application with no invoice has no open balance).
function readyApplicationsOf(
    applications: readonly PaymentApplicationRow[]
): ReadyApplication[] | null {
    const ready = applications.filter(
        (application): application is ReadyApplication => application.invoiceRow !== undefined
    )
    return ready.length === applications.length ? ready : null
}

// The invoices stored applications name, as the outstanding list reads them, each once.
function storedInvoicesOf(applications: readonly ReadyApplication[]): OutstandingInvoice[] {
    const seen = new Set<string>()
    return applications.flatMap(application => {
        const invoice = application.invoiceRow
        if (seen.has(invoice.id)) return []
        seen.add(invoice.id)
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
    applications: readonly ReadyApplication[],
    extra: Readonly<Record<string, number>>
) {
    return applications.map(application => ({
        invoice: application.invoice,
        amount: application.amount,
        open: application.invoiceRow.balance + (extra[application.invoice] ?? 0),
        number: application.invoiceRow.number,
    }))
}

// A posted original's applications as correctionPaymentValues reads them.
function originalApplicationsOf(applications: readonly ReadyApplication[]) {
    return applications.map(application => ({
        invoice: application.invoice,
        amount: application.amount,
        number: application.invoiceRow.number,
        balance: application.invoiceRow.balance,
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

interface PaymentSurfaceProps {
    screen: PaymentScreenData
    input: PaymentScreenInput
    refused: PaymentRefusedSave | null
    scopeOwner: ScopeOwner
}

interface PaymentFormRouteProps extends PaymentSurfaceProps {
    // The draft's applications and the posted original's, each with its invoice.
    applications: ReadyApplication[]
    originalApplications: ReadyApplication[]
}

// The form of a new payment, a correction (`?replaces` of a posted payment) or a draft (a
// saved correction is a draft that replaces a posted payment).
function PaymentFormRoute({
    screen,
    input,
    refused,
    scopeOwner,
    applications,
    originalApplications,
}: PaymentFormRouteProps) {
    const { payment, original } = screen
    const isDraft = input.id !== null
    // The original's applications still lower its invoices' balances until the correction
    // posts, so the correction may pay up to the balance plus what the original applied.
    const extraOpen = useMemo(
        () =>
            Object.fromEntries(
                originalApplications.map(application => [application.invoice, application.amount])
            ),
        [originalApplications]
    )
    const storedInvoices = useMemo(
        () => storedInvoicesOf([...(isDraft ? applications : []), ...originalApplications]),
        [isDraft, applications, originalApplications]
    )
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
            return correctionPaymentValues(original, originalApplicationsOf(originalApplications))
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
            isCustomerLocked={original !== null}
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

// The original's applications widen the open balances only while it is posted: once
// another correction of it posts, it is void and its applications no longer hold any
// invoice's balance down.
function heldOriginalApplications(screen: PaymentScreenData) {
    return screen.original?.status === 'posted' ? screen.originalApplications : []
}

function PaymentSurface({ screen, input, refused, scopeOwner }: PaymentSurfaceProps) {
    const applications = readyApplicationsOf(screen.applications)
    const originalApplications = readyApplicationsOf(heldOriginalApplications(screen))
    const isFormReady = applications !== null && originalApplications !== null
    if (screen.state === 'form' && isFormReady) {
        return (
            <PaymentFormRoute
                screen={screen}
                input={input}
                refused={refused}
                scopeOwner={scopeOwner}
                applications={applications}
                originalApplications={originalApplications}
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
    const notice = screen.state === 'read' || screen.state === 'form' ? 'loading' : screen.state
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
    // The root opts back into pointer events and draws its own background: the Payments
    // child stack (SalesKindLayout) turns pointer events off on web and draws its screens
    // over a transparent layer, so the list under it never takes the payment's clicks.
    return (
        <DocumentChromeContext.Provider value={PAYMENT_CHROME}>
            <ScopeProvider owner={scopeOwner}>
                <View pointerEvents="auto" className="flex-1 bg-background">
                    <PaymentSurface
                        screen={screen}
                        input={input}
                        refused={refused}
                        scopeOwner={scopeOwner}
                    />
                </View>
            </ScopeProvider>
        </DocumentChromeContext.Provider>
    )
}
