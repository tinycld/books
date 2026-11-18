import { useMemo, useState } from 'react'
import { VENDOR_REFUND_READS } from '../../hooks/useVendorRefundReads'
import type { PaymentReadAction } from '../../lib/payment-read-actions'
import { paymentRefusalErrors } from '../../lib/payment-refusals'
import { type PaymentFormMode, startRowOf, titleOf } from '../../lib/payment-start'
import { draftPaymentValues, newPaymentValues } from '../../lib/payment-values'
import { defaultRefundAccount } from '../../lib/refund-accounts'
import { refundStoredLines, storedOpenOf } from '../../lib/refundable-credits'
import { todayIso } from '../../lib/register-range'
import { VENDOR_REFUND_FLOW } from '../../lib/vendor-refund-flow'
import { type PaymentFormRouteProps, PaymentSurface } from '../payments/PaymentSurface'
import { VendorRefundForm } from './VendorRefundForm'

const FLOW = VENDOR_REFUND_FLOW

// This checkpoint's read view offers View journal entry only, to every role; Edit and Void
// arrive with the correction and the void.
const READ_ACTIONS: readonly PaymentReadAction[] = ['entry']

function modeOf(isDraft: boolean, hasOriginal: boolean): PaymentFormMode {
    if (isDraft) return 'draft'
    return hasOriginal ? 'correction' : 'new'
}

type StoredLine = PaymentFormRouteProps['lines'][number]

// A stored refund's lines as the form's start entries, each with its credit's unapplied
// amount as the list shows it.
function startEntriesOf(lines: readonly StoredLine[], open: Readonly<Record<string, number>>) {
    return lines.map(line => ({
        document: line.document,
        amount: line.amount,
        number: line.number,
        open: open[line.document] ?? line.open,
    }))
}

// The form of a new refund, a correction (`?replaces` of a posted refund) or a draft (a
// saved correction is a draft that replaces a posted refund).
function VendorRefundFormRoute({
    screen,
    input,
    refused,
    scopeOwner,
    lines,
    originalLines,
}: PaymentFormRouteProps) {
    const { payment, original } = screen
    const isDraft = input.id !== null
    // The draft's lines have not lowered their credits' balances; a posted original's have,
    // until the correction posts.
    const storedCredits = useMemo(
        () => [
            ...(isDraft && payment ? refundStoredLines(lines, payment.party, false) : []),
            ...(original ? refundStoredLines(originalLines, original.party, true) : []),
        ],
        [isDraft, payment, lines, original, originalLines]
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
        const open = storedOpenOf(storedCredits)
        if (isDraft && payment) return draftPaymentValues(payment, startEntriesOf(lines, open))
        if (original) return draftPaymentValues(original, startEntriesOf(originalLines, open))
        return newPaymentValues({
            today: todayIso(),
            party: openedWith,
            document: startRowOf(screen.startDocument, openedWith),
            account: defaultRefundAccount(screen.depositAccounts),
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
        <VendorRefundForm
            initial={start.values}
            initialErrors={start.errors}
            holdsHandOff={refused !== null}
            title={title}
            currency={screen.currency}
            accounts={screen.depositAccounts}
            balanceOf={screen.accountBalanceOf}
            refundId={input.id}
            storedLines={storedLines}
            storedCredits={storedCredits}
            replaces={input.replaces}
            isVendorLocked={original !== null}
            openedWithVendor={openedWith}
            canWrite={screen.canWrite}
            scopeOwner={scopeOwner}
        />
    )
}

export interface VendorRefundScreenProps {
    // The refund's id; null at `books/vendor-refunds/new`.
    id: string | null
    // `?replaces`: the posted refund a new form corrects.
    replaces?: string
    // `?vendor` starts a new form with that vendor; `?credit` (with `?vendor`) ticks that
    // credit for its unapplied balance.
    vendor?: string
    credit?: string
}

/**
 * The vendor refund screen at `books/vendor-refunds/new` and `books/vendor-refunds/<id>`
 * (vendor refund spec §2, §3.8): the shared payment surface under VENDOR_REFUND_FLOW, with
 * the refund's reads and form. A draft opens in the form, a posted or void refund in the
 * read view.
 */
export function VendorRefundScreen({ id, replaces, vendor, credit }: VendorRefundScreenProps) {
    const input = { id, replaces, party: vendor, document: credit }
    return (
        <PaymentSurface
            flow={FLOW}
            reads={VENDOR_REFUND_READS}
            collection="books_vendor_refunds"
            input={input}
            FormRoute={VendorRefundFormRoute}
            readActions={READ_ACTIONS}
        />
    )
}
