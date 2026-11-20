import { Pressable, Text, View } from 'react-native'
import type { DocumentPayment } from '../../hooks/document-data'
import type { CreditApplicationRow } from '../../hooks/useCreditApplications'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import type { ApplicationTarget } from '../../lib/credit-application-kinds'
import { formatMoney } from '../../lib/money'
import { formatDay } from '../../lib/register-range'
import { ListBanner } from '../ListBanner'
import { ApplicationRow } from './DocumentApplications'

const TAP = { minHeight: 44 }

const NO_APPLICATIONS: readonly CreditApplicationRow[] = []

export const BILL_CREDITS_LOAD_FAILED = 'Books could not load the credits applied to this bill.'
export const INVOICE_CREDITS_LOAD_FAILED =
    'Books could not load the credits applied to this invoice.'

// What the block names and opens: the payment's noun ("Payment", "Bill payment"), the
// route of its read view and the test id prefix of the document it sits on.
type PaymentsTarget = {
    noun: string
    routeBase: string
    testIdPrefix: string
}

// What a credit row names and opens (`credit`, a vendor credit on a bill; `credit_memo` on an
// invoice), and the notice of a failed applications read.
type CreditsTarget = {
    rowTarget: ApplicationTarget
    creditsLoadFailed: string
}

// "Payment 1003 · Oct 12, 2026 · $100.00": the payment's noun, number and date, and what
// it pays on this document.
function paymentLinkText(payment: DocumentPayment, noun: string, currency: string): string {
    const day = formatDay(payment.date)
    return `${noun} ${payment.number} · ${day} · ${formatMoney(payment.amount, currency)}`
}

interface PaymentLinkProps extends PaymentsTarget {
    payment: DocumentPayment
    currency: string
}

function PaymentLink({ payment, currency, noun, routeBase, testIdPrefix }: PaymentLinkProps) {
    // Back to the payment's screen when it is below this document (the document was opened
    // from the payment's applied list); else pushed, so Back returns here.
    const open = useOpenDocument({ routeBase }, payment.payment)
    const text = paymentLinkText(payment, noun, currency)
    return (
        <Pressable
            testID={`${testIdPrefix}-payment-${payment.payment}`}
            accessibilityRole="link"
            onPress={open}
            className="justify-center self-start"
            style={TAP}
        >
            <Text className="text-sm text-primary underline">{text}</Text>
        </Pressable>
    )
}

// One row of the block: a posted payment or a credit application.
type BlockRow =
    | { kind: 'payment'; key: string; day: string; payment: DocumentPayment }
    | { kind: 'credit'; key: string; day: string; application: CreditApplicationRow }

// The payments and the applications in one list by date; on the same day the payments
// come first, each list keeping its own order (both are oldest first).
export function paymentBlockRows(
    payments: readonly DocumentPayment[],
    applications: readonly CreditApplicationRow[]
): BlockRow[] {
    const rows: BlockRow[] = [
        ...payments.map(payment => ({
            kind: 'payment' as const,
            key: `payment-${payment.id}`,
            day: payment.date.slice(0, 10),
            payment,
        })),
        ...applications.map(application => ({
            kind: 'credit' as const,
            key: `credit-${application.id}`,
            day: application.date.slice(0, 10),
            application,
        })),
    ]
    return rows.sort((a, b) => a.day.localeCompare(b.day))
}

interface BlockRowViewProps extends PaymentsTarget {
    row: BlockRow
    currency: string
    rowTarget: ApplicationTarget
    onRemove: ((application: CreditApplicationRow) => void) | undefined
}

function ignore() {}

function BlockRowView({ row, currency, rowTarget, onRemove, ...target }: BlockRowViewProps) {
    if (row.kind === 'payment') {
        return <PaymentLink payment={row.payment} currency={currency} {...target} />
    }
    return (
        <ApplicationRow
            application={row.application}
            target={rowTarget}
            currency={currency}
            testIdPrefix={target.testIdPrefix}
            canRemove={onRemove !== undefined}
            onRemove={onRemove ?? ignore}
        />
    )
}

function CreditsLoadError({
    isVisible,
    testIdPrefix,
    message,
    onRetry,
}: {
    isVisible: boolean
    testIdPrefix: string
    message: string
    onRetry: () => void
}) {
    if (!isVisible) return null
    return (
        <ListBanner
            testIdPrefix={`${testIdPrefix}-payments-credits`}
            message={message}
            onRetry={onRetry}
            isFlush
        />
    )
}

interface DocumentPaymentsProps extends PaymentsTarget, CreditsTarget {
    payments: readonly DocumentPayment[]
    currency: string
    // The vendor credits applied to a bill (vendor credit spec §3.10) or the credit memos
    // applied to an invoice (apply credit spec §3.6), in the list by date with the payments.
    applications?: readonly CreditApplicationRow[]
    // Remove on each application row; left out where Remove is not offered (a reader, a
    // void document).
    onRemove?: (application: CreditApplicationRow) => void
    // The applications read failed: a notice with Retry in the block, never "no credits".
    isApplicationsError?: boolean
    onRetry?: () => void
}

/**
 * The Payments block of an invoice's or a bill's read view (receive-payment spec §3.9,
 * pay-bills spec §3.9, vendor credit spec §3.10, apply credit spec §3.6): a link per posted
 * payment applied to the document and a row per credit applied to it (ApplicationRow naming
 * `rowTarget`: "Vendor credit 1002 · Nov 16, 2026 · $30.00" on a bill, "Credit memo 1001 ·
 * Nov 16, 2026 · $150.00" on an invoice, opening the credit, with Remove for a writer), in
 * one list by date, oldest first. A failed applications read shows its notice
 * (`creditsLoadFailed`) with Retry in the block. Nothing while no row applies and no read
 * failed.
 */
export function DocumentPayments({
    payments,
    currency,
    noun,
    routeBase,
    testIdPrefix,
    rowTarget,
    creditsLoadFailed,
    applications = NO_APPLICATIONS,
    onRemove,
    isApplicationsError = false,
    onRetry = ignore,
}: DocumentPaymentsProps) {
    const rows = paymentBlockRows(payments, applications)
    if (rows.length === 0 && !isApplicationsError) return null
    const drawn = rows.map(row => (
        <BlockRowView
            key={row.key}
            row={row}
            currency={currency}
            rowTarget={rowTarget}
            onRemove={onRemove}
            noun={noun}
            routeBase={routeBase}
            testIdPrefix={testIdPrefix}
        />
    ))
    return (
        <View testID={`${testIdPrefix}-payments`} className="gap-1">
            <Text className="text-sm font-semibold text-foreground">Payments</Text>
            {drawn}
            <CreditsLoadError
                isVisible={isApplicationsError}
                testIdPrefix={testIdPrefix}
                message={creditsLoadFailed}
                onRetry={onRetry}
            />
        </View>
    )
}
