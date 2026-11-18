import { type ScopeOwner, ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useMemo, useState } from 'react'
import type { PaymentRecordView } from '../../hooks/usePaymentRecord'
import {
    type PaymentScreenData,
    type PaymentScreenInput,
    usePaymentScreen,
} from '../../hooks/usePaymentScreen'
import { RECEIVED_PAYMENT_READS } from '../../hooks/useReceivedPaymentReads'
import type { DepositAccountRow } from '../../lib/deposit-accounts'
import { paymentDefaultDeposit } from '../../lib/payment-deposit'
import { PAYMENT_FLOW } from '../../lib/payment-flow'
import { paymentRefusalErrors } from '../../lib/payment-refusals'
import {
    draftApplicationsOf,
    originalApplicationsOf,
    type PaymentFormMode,
    readyApplicationsOf,
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
import { type PaymentRefusedSave, refusedSaveOf } from '../../stores/payment-save-store'
import { DocumentChromeContext } from '../documents/document-chrome'
import { PaymentForm } from './PaymentForm'
import { PaymentReadView } from './PaymentReadView'
import { PaymentStateNotice } from './PaymentStateNotice'

const FLOW = PAYMENT_FLOW

function depositLabelOf(accounts: readonly DepositAccountRow[], id: string): string {
    const account = accounts.find(row => row.id === id)
    if (!account) return ''
    return account.number ? `${account.number} ${account.name}` : account.name
}

interface PaymentSurfaceProps {
    screen: PaymentScreenData
    input: PaymentScreenInput
    refused: PaymentRefusedSave | null
    scopeOwner: ScopeOwner
}

interface PaymentFormRouteProps extends PaymentSurfaceProps {
    // The draft's lines and the posted original's, each with its invoice.
    lines: PaymentRecordView['lines']
    originalLines: PaymentRecordView['lines']
}

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

// The original's lines widen the open balances only while it is posted: once another
// correction of it posts, it is void and its lines no longer hold any invoice's balance
// down.
function heldOriginalLines(screen: PaymentScreenData) {
    return screen.original?.status === 'posted' ? screen.originalLines : []
}

function PaymentSurface({ screen, input, refused, scopeOwner }: PaymentSurfaceProps) {
    const lines = readyApplicationsOf(screen.lines)
    const originalLines = readyApplicationsOf(heldOriginalLines(screen))
    const isFormReady = lines !== null && originalLines !== null
    if (screen.state === 'form' && isFormReady) {
        return (
            <PaymentFormRoute
                screen={screen}
                input={input}
                refused={refused}
                scopeOwner={scopeOwner}
                lines={lines}
                originalLines={originalLines}
            />
        )
    }
    if (screen.state === 'read' && screen.payment) {
        return (
            <PaymentReadView
                flow={FLOW}
                payment={screen.payment}
                lines={screen.lines}
                partyName={screen.partyName}
                accountLabel={depositLabelOf(screen.depositAccounts, screen.payment.account)}
                currency={screen.currency}
                canWrite={screen.canWrite}
                scopeOwner={scopeOwner}
                collection="books_payments"
            />
        )
    }
    const notice = screen.state === 'read' || screen.state === 'form' ? 'loading' : screen.state
    return <PaymentStateNotice flow={FLOW} state={notice} onRetry={screen.retry} />
}

/**
 * The receive-payment screen at `books/payments/new` and `books/payments/<id>`: the shared
 * document chrome reads PAYMENT_FLOW's chrome, and the screen's `compose` scope holds the
 * keys of the form or the read view. A draft opens in the form, a posted or void payment
 * in the read view.
 */
export function PaymentScreen(input: PaymentScreenInput) {
    const scopeOwner = useShortcutScope('compose')
    const screen = usePaymentScreen(FLOW, input, RECEIVED_PAYMENT_READS)
    // A refusal the new form handed over when it moved to this draft's route.
    const [refused] = useState(() => refusedSaveOf(FLOW.key, input.id))
    return (
        <DocumentChromeContext.Provider value={FLOW.chrome}>
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
