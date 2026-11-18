import { useMemo, useState } from 'react'
import type { PaymentScreenInput } from '../../hooks/usePaymentScreen'
import { usePaymentWrites } from '../../hooks/usePaymentWrites'
import { RECEIVED_PAYMENT_READS } from '../../hooks/useReceivedPaymentReads'
import { paymentDefaultDeposit } from '../../lib/payment-deposit'
import { PAYMENT_FLOW } from '../../lib/payment-flow'
import { paymentRefusalErrors } from '../../lib/payment-refusals'
import {
    draftApplicationsOf,
    originalApplicationsOf,
    type PaymentFormMode,
    startRowOf,
    storedDocumentsOf,
    titleOf,
} from '../../lib/payment-start'
import {
    correctionPaymentValues,
    draftPaymentValues,
    newPaymentValues,
} from '../../lib/payment-values'
import { todayIso } from '../../lib/register-range'
import { PaymentForm } from './PaymentForm'
import { type PaymentFormRouteProps, PaymentSurface } from './PaymentSurface'

const FLOW = PAYMENT_FLOW

function modeOf(isDraft: boolean, hasOriginal: boolean): PaymentFormMode {
    if (isDraft) return 'draft'
    return hasOriginal ? 'correction' : 'new'
}

// The form of a new payment, a correction (`?replaces` of a posted payment) or a draft (a
// saved correction is a draft that replaces a posted payment).
function PaymentFormRoute({
    screen,
    input,
    refused,
    scopeOwner,
    lines,
    originalLines,
}: PaymentFormRouteProps) {
    const { payment, original } = screen
    const isDraft = input.id !== null
    const party = payment?.party ?? original?.party ?? input.party ?? ''
    // The original's lines still lower its invoices' balances until the correction posts,
    // so the correction may pay up to the balance plus what the original applied.
    const extraOpen = useMemo(
        () => Object.fromEntries(originalLines.map(line => [line.document, line.amount])),
        [originalLines]
    )
    const storedInvoices = useMemo(
        () => storedDocumentsOf([...(isDraft ? lines : []), ...originalLines], party),
        [isDraft, lines, originalLines, party]
    )
    const storedLines = useMemo(
        () =>
            isDraft
                ? lines.map(line => ({ id: line.id, document: line.document, amount: line.amount }))
                : [],
        [isDraft, lines]
    )
    const openedWith = input.party ?? ''
    const startValues = () => {
        if (refused) return refused.values
        if (isDraft && payment) {
            return draftPaymentValues(payment, draftApplicationsOf(lines, extraOpen))
        }
        if (original) {
            return correctionPaymentValues(original, originalApplicationsOf(originalLines))
        }
        return newPaymentValues({
            today: todayIso(),
            party: openedWith,
            document: startRowOf(screen.startDocument, openedWith),
            account: paymentDefaultDeposit(screen.depositAccounts),
        })
    }
    // The form reads its start values, and a handed-off refusal as its start errors, once,
    // at mount.
    const [start] = useState(() => ({
        values: startValues(),
        errors: refused ? paymentRefusalErrors(refused.error, refused.stored, FLOW) : undefined,
    }))
    const title = titleOf(FLOW, modeOf(isDraft, original !== null), original?.number)
    return (
        <PaymentForm
            initial={start.values}
            initialErrors={start.errors}
            holdsHandOff={refused !== null}
            title={title}
            currency={screen.currency}
            depositAccounts={screen.depositAccounts}
            paymentId={input.id}
            storedLines={storedLines}
            storedInvoices={storedInvoices}
            extraOpen={extraOpen}
            replaces={input.replaces}
            isCustomerLocked={original !== null}
            openedWithCustomer={openedWith}
            canWrite={screen.canWrite}
            scopeOwner={scopeOwner}
        />
    )
}

/**
 * The receive-payment screen at `books/payments/new` and `books/payments/<id>`: the shared
 * payment surface under PAYMENT_FLOW, with the received payment's reads and form. A draft
 * opens in the form, a posted or void payment in the read view.
 */
export function PaymentScreen(input: PaymentScreenInput) {
    return (
        <PaymentSurface
            flow={FLOW}
            reads={RECEIVED_PAYMENT_READS}
            collection="books_payments"
            input={input}
            useWrites={usePaymentWrites}
            FormRoute={PaymentFormRoute}
        />
    )
}
