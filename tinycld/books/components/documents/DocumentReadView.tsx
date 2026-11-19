import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useFormHost } from '@tinycld/core/lib/forms/use-form-hosts'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import { type ReactNode, useId } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import {
    type DocumentRecord,
    documentPartyIdOf,
    expiredOnOf,
    storedPartyAddressOf,
} from '../../hooks/document-data'
import { useReadAttachmentSession } from '../../hooks/useAttachmentUpload'
import { type CreditApplicationRow, useCreditApplications } from '../../hooks/useCreditApplications'
import { type CreditRefunds, useCreditRefunds } from '../../hooks/useCreditRefunds'
import { useDocumentReadActions } from '../../hooks/useDocumentReadActions'
import type { DocumentScreenData } from '../../hooks/useDocumentScreen'
import { useHistoryItem } from '../../hooks/useHistoryItem'
import {
    type LinkedRefundReceipts,
    useLinkedRefundReceipts,
} from '../../hooks/useLinkedRefundReceipts'
import { useRemoveApplication } from '../../hooks/useRemoveApplication'
import { formatAddressLines, isCustomerAddress } from '../../lib/address'
import { billCreditsApplied } from '../../lib/bill-values'
import { removeApplicationOffered } from '../../lib/document-actions'
import { DOCUMENT_NOTE_LABELS, memoLabelFor } from '../../lib/document-notes'
import { type DocumentTab, documentHref } from '../../lib/document-routes'
import { documentTaxOf } from '../../lib/document-tax'
import { NO_PARTY_TEXT } from '../../lib/document-texts'
import { lineTableSubtotals } from '../../lib/document-values'
import { stampText } from '../../lib/entry-display'
import { DOCUMENT_COLLECTIONS } from '../../lib/history-route'
import { formatMoney, MINUS } from '../../lib/money'
import { formatDay, todayIso } from '../../lib/register-range'
import { DOCUMENT_PARTIES, type SalesDocumentKind } from '../../lib/sales-document-kinds'
import { groupPpm, ratePercentText } from '../../lib/sales-tax'
import { EntryBackLink } from '../entries/EntryHeader'
import { VoidDialog } from '../entries/VoidDialog'
import { WriteOffDialog } from '../write-offs/WriteOffDialog'
import { AttachmentsSection } from './AttachmentsSection'
import { RemoveApplicationDialog } from './DocumentApplications'
import { DocumentDetail } from './DocumentDetail'
import { DocumentHeader } from './DocumentHeader'
import { DocumentLoading } from './DocumentLoading'
import { DocumentPayments } from './DocumentPayments'
import { DocumentPdfView } from './DocumentPdfView'
import { DocumentReadActions } from './DocumentReadActions'
import { DOCUMENT_READ_TRAILING_WIDTH, DocumentReadLines } from './DocumentReadLines'
import { DocumentTabs, TabPanel } from './DocumentTabs'
import { DocumentTotalsPanel, type DocumentTotalsView } from './DocumentTotalsPanel'
import { useDocumentKind } from './document-kind-context'
import {
    type DocumentKind,
    type DocumentReadFrameProps,
    type DocumentReadSectionProps,
    type ReadBalanceBadge,
    type ReadRefunded,
    storedLineTableRows,
} from './document-kinds'

const LINK_STYLE = { minHeight: 44 }

// The tax line: the document's rate name with the snapshot's combined percent and
// amount, so a rate changed after posting does not change it. No row without a tax rate.
// A quote never posts, so it has no snapshot: its rate is named as the form names it,
// with the rate's current percent (documentTaxOf over the screen's tax rates, which holds
// a group's components), and the stored tax total. A posting document with a rate but no
// snapshot rows (no line was taxable) shows the rate's name and the stored tax total, as
// there is no snapshot percent to show.
// A kind without sales tax (`features.tax`) has no tax line.
function readTaxLine(
    data: DocumentScreenData,
    record: DocumentRecord,
    doc: Pick<SalesDocumentKind, 'lifecycle' | 'features'>
): DocumentTotalsView['tax'] {
    const { lifecycle } = doc
    if (!doc.features.tax || !record.tax_rate) return null
    const amount = (cents: number) => formatMoney(cents, data.currency)
    const name = record.taxRateRow?.name ?? 'Tax'
    if (lifecycle === 'quote') {
        const { label } = documentTaxOf(data.taxOptions.rows, record.tax_rate)
        return { label: label ?? name, amount: amount(record.tax_total) }
    }
    if (data.taxLines.length === 0) return { label: name, amount: amount(record.tax_total) }
    const ppm = groupPpm(data.taxLines.map(line => line.rate_ppm))
    const total = data.taxLines.reduce((sum, line) => sum + line.amount, 0)
    return { label: `${name} (${ratePercentText(ppm)})`, amount: amount(total) }
}

// The subtotal row of each line table that has one and a line with an amount (a bill's
// Account lines and Products and services), summed by the shared totals helper over the
// stored lines, in table order. None for a kind with one table.
function readTableSubtotals(
    data: DocumentScreenData,
    documentKind: Pick<DocumentKind, 'doc' | 'lineSpecs'>
): DocumentTotalsView['tableSubtotals'] {
    const rows = storedLineTableRows(documentKind, data.lines)
    return lineTableSubtotals(rows, documentKind.doc.lineTables).map(row => ({
        label: row.subtotal.label,
        amount: formatMoney(row.cents, data.currency),
        testId: row.subtotal.testId,
    }))
}

// The sum the posted payments apply to an invoice or a bill, in cents; 0 for every other
// kind.
function appliedCents(data: DocumentScreenData): number {
    return data.documentPayments.reduce((sum, payment) => sum + payment.amount, 0)
}

// The open balance the server keeps on an invoice or a bill; undefined for every other
// kind.
function openBalanceOf(record: DocumentRecord): number | undefined {
    const fields = record.kindFields
    if (fields.kind === 'invoice' || fields.kind === 'bill') return fields.balance
    return undefined
}

// The credit applied to a bill (billCreditsApplied, from its stored total, its posted
// payments and its stored balance; vendor credit spec §3.10); 0 for every other kind.
function creditsAppliedOf(record: DocumentRecord, paymentsCents: number): number {
    const fields = record.kindFields
    if (fields.kind !== 'bill') return 0
    const { status, total } = record
    return billCreditsApplied({ status, total, balance: fields.balance }, paymentsCents)
}

// The last row and the big figure: an invoice's or a bill's Balance due is its open
// balance, which the server keeps (receive-payment spec §3.9, pay-bills spec §3.9), with a
// Payments row above it while any posted payment applies; every other kind's is its
// total, posted or void.
// The kind's rows after Total: a bill's Credits applied (creditsAppliedOf, from the stored
// record, so the rows add up while its applications read loads or has failed); a vendor
// credit's Applied, Refunded and Unapplied credit, which read its stored total and balance
// and the posted refunds' cents (`refunded`).
function readTotals(
    data: DocumentScreenData,
    record: DocumentRecord,
    documentKind: Pick<DocumentKind, 'doc' | 'lineSpecs' | 'readTotals' | 'readTotalsPlace'>,
    refunded: ReadRefunded
): DocumentTotalsView {
    const { doc } = documentKind
    const money = (cents: number) => formatMoney(cents, data.currency)
    const total = money(record.total)
    // A kind with more than one line table has no single Subtotal row.
    const subtotal = doc.lineTables.length > 1 ? null : money(record.subtotal)
    const balance = openBalanceOf(record)
    const last = balance === undefined ? total : money(balance)
    const applied = appliedCents(data)
    const payments = applied > 0 ? `${MINUS}${money(applied)}` : null
    const kindRows = documentKind.readTotals?.(record, {
        applied: creditsAppliedOf(record, applied),
        refunded,
    })
    const isAfterLast = documentKind.readTotalsPlace === 'afterLast'
    return {
        subtotal,
        tableSubtotals: readTableSubtotals(data, documentKind),
        tax: readTaxLine(data, record, doc),
        total,
        payments,
        last,
        after: isAfterLast ? undefined : kindRows,
        afterLast: isAfterLast ? kindRows : undefined,
    }
}

// The balance the server keeps on a kind that has one (an invoice's or a bill's open
// balance, a credit memo's or a vendor credit's unapplied credit); undefined for every
// other kind. The badge reads it; the big figure reads openBalanceOf.
function storedBalanceOf(record: DocumentRecord): number | undefined {
    const fields = record.kindFields
    if (fields.kind === 'invoice' || fields.kind === 'bill') return fields.balance
    if (fields.kind === 'credit_memo' || fields.kind === 'vendor_credit') return fields.balance
    return undefined
}

// The cents an invoice's posted write-offs took (its stored `written_off`); 0 for every
// other kind.
function writtenOffOf(record: DocumentRecord): number {
    const fields = record.kindFields
    return fields.kind === 'invoice' ? fields.written_off : 0
}

// The badge of a kind with a balance badge (an invoice's Paid / Partly paid / Written off,
// a bill's Paid / Partly paid, a vendor credit's Applied / Partly applied / Refunded)
// follows its stored balance (and a vendor credit's refunded cents, an invoice's
// written-off cents); undefined for every other kind, whose header shows its status's
// badge.
function readBadgeOf(
    record: DocumentRecord,
    balanceBadge: ReadBalanceBadge | undefined,
    refunded: ReadRefunded
) {
    const balance = storedBalanceOf(record)
    const { status } = record
    if (!balanceBadge || balance === undefined) return undefined
    if (status !== 'draft' && status !== 'posted' && status !== 'void') return undefined
    return balanceBadge(status, balance, record.total, refunded, writtenOffOf(record))
}

// The posted vendor refunds a vendor credit's read view reads (`DocumentKind.readRefunds`);
// for every other kind no id, so the query is off and ready with no rows.
function useReadRefunds(record: DocumentRecord, readRefunds: boolean | undefined) {
    return useCreditRefunds(readRefunds ? record.id : '')
}

// The refund receipts that name a sales receipt or a credit memo
// (`DocumentKind.readLinkedRefunds`), read once for the kind's ReadSection and its
// readTotals; for every other kind no id, so the query is off and ready with no rows.
function useReadLinkedRefunds(record: DocumentRecord, field: DocumentKind['readLinkedRefunds']) {
    return useLinkedRefundReceipts(field ?? 'sales_receipt', field ? record.id : '')
}

// The refunded cents readTotals and the badge read: a credit memo's posted refund receipts,
// a vendor credit's posted vendor refunds. null while the read that gives them has failed
// (ReadRefunded), and for a credit memo also while it loads, so no Refunded row is drawn
// from a sum not yet known.
function readRefundedOf(
    documentKind: Pick<DocumentKind, 'readLinkedRefunds'>,
    refunds: Pick<CreditRefunds, 'isError' | 'refunded'>,
    linked: Pick<LinkedRefundReceipts, 'isError' | 'isReady' | 'refunded'>
): ReadRefunded {
    if (documentKind.readLinkedRefunds === 'credit_memo') {
        return linked.isError || !linked.isReady ? null : linked.refunded
    }
    return refunds.isError ? null : refunds.refunded
}

// What the Payments block names and opens on an invoice and on a bill; null for every
// other kind, which has no payments.
const PAYMENTS_BLOCKS: Partial<
    Record<DocumentRecord['kindFields']['kind'], { noun: string; routeBase: string }>
> = {
    invoice: { noun: 'Payment', routeBase: 'books/payments' },
    bill: { noun: 'Bill payment', routeBase: 'books/bill-payments' },
}

interface PaymentsBlockProps {
    data: DocumentScreenData
    record: DocumentRecord
    // A bill's credit applications (empty on every other kind), their read's failure, and
    // the read view's one Retry.
    credits: Pick<CreditApplications, 'applications' | 'isError'>
    onRetry: () => void
    // Remove on each credit row; undefined where it is not offered.
    onRemove: ((application: CreditApplicationRow) => void) | undefined
}

function PaymentsBlock({ data, record, credits, onRetry, onRemove }: PaymentsBlockProps) {
    const { doc } = useDocumentKind()
    const target = PAYMENTS_BLOCKS[record.kindFields.kind]
    if (!target) return null
    return (
        <DocumentPayments
            payments={data.documentPayments}
            currency={data.currency}
            noun={target.noun}
            routeBase={target.routeBase}
            testIdPrefix={doc.testId}
            applications={credits.applications}
            onRemove={onRemove}
            isApplicationsError={credits.isError}
            onRetry={onRetry}
        />
    )
}

// The credits a bill's read view reads (`DocumentKind.readApplications`): the record's
// applications, the Payments block's credit rows; for every other kind no id, so the query
// is off and ready with no rows.
function useReadCredits(record: DocumentRecord, readApplications: boolean | undefined) {
    return useCreditApplications({ bill: readApplications ? record.id : undefined })
}

type CreditApplications = ReturnType<typeof useCreditApplications>

// The party's address as the document stored it (storedPartyAddressOf: a sales kind's
// Bill to, a bill's Mailing address); none for a kind without a party address.
function addressLines(
    record: DocumentRecord,
    doc: Pick<SalesDocumentKind, 'party' | 'features'>
): string[] {
    const address = storedPartyAddressOf(record, doc)
    return isCustomerAddress(address) ? formatAddressLines(address) : []
}

// The label the kind's forms host gives a built-in, so the read view names a field as
// the default form does ("Invoice date", "Sale date"). Books declares its hosts in its
// own manifest, so a missing host is a build the generator did not run; the plain word
// keeps the read view usable then.
function useBuiltinLabel(hostKey: string, key: string): string {
    const host = useFormHost(hostKey)
    return host?.builtin.find(builtin => builtin.key === key)?.label ?? 'Date'
}

interface BandProps {
    isPhone: boolean
    record: DocumentRecord
    partyName: string
    address: string
    date: string
    tax: string
}

// The band as the form draws it: the party (Customer or Vendor), its address (Bill to or
// Mailing address) and Email in the left column at full width; the kind's details around
// the date in one row with Tax under them on the right; then the kind's own ruled row (a
// sales receipt's Payment). A phone stacks the two columns in flow: a column there has no
// flex-1, because a zero flex basis in a column of auto height lets the blocks draw on top
// of each other.
function ReadBand({ isPhone, record, partyName, address, date, tax }: BandProps) {
    const { ReadDetails, ReadBandRow, doc } = useDocumentKind()
    const dateLabel = useBuiltinLabel(doc.hostKey, 'date')
    const party = DOCUMENT_PARTIES[doc.party]
    // The detail ids follow the party: `customer` / `bill-to`, `vendor` / `mailing-address`.
    const addressField = party.addressField.replaceAll('_', '-')
    const direction = isPhone ? 'flex-col gap-3' : 'flex-row gap-6'
    const column = isPhone ? 'gap-3' : 'min-w-0 flex-1 gap-3'
    const bandRow = ReadBandRow ? <ReadBandRow record={record} /> : null
    // A detail with no value is not drawn (DocumentDetail): a kind without an email shows
    // none, and one without sales tax has no tax line (readTaxLine), so no Tax.
    const email = doc.features.email ? record.email : ''
    return (
        <View className="gap-3 rounded-xl border border-border bg-surface-secondary p-4">
            <View className={direction}>
                <View className={column}>
                    <DocumentDetail field={party.field} label={party.label} value={partyName} />
                    <DocumentDetail
                        field={addressField}
                        label={party.addressLabel}
                        value={address}
                    />
                    <DocumentDetail field="email" label="Email" value={email} />
                </View>
                <View className={column}>
                    <View className="flex-row flex-wrap gap-x-6 gap-y-3">
                        <ReadDetails record={record} isPhone={isPhone}>
                            <DocumentDetail field="date" label={dateLabel} value={date} />
                        </ReadDetails>
                    </View>
                    <DocumentDetail field="tax" label="Tax" value={tax} />
                </View>
            </View>
            {bandRow}
        </View>
    )
}

// The party's name; the party's none text for a document saved without one (a sales
// receipt's walk-in sale: "No customer").
function partyNameOf(
    data: DocumentScreenData,
    record: DocumentRecord,
    doc: Pick<SalesDocumentKind, 'party'>
): string {
    if (documentPartyIdOf(record) === '') return NO_PARTY_TEXT[doc.party]
    return data.party?.display_name ?? ''
}

// Wide: the totals end under the lines' Amount column (the Tax column's width and the
// grid gap to its right), with the message to the customer and the internal memo in
// the left column beside them, as the form's footer. A phone stacks the totals over
// the two notes.
const WIDE_TOTALS = { paddingRight: DOCUMENT_READ_TRAILING_WIDTH }

interface FooterProps {
    isPhone: boolean
    totals: DocumentTotalsView
    message: string
    memo: string
    memoLabel: string
    // The Attachments section, under Memo in the notes column (a phone stacks it after
    // Memo); null for a kind without it.
    attachments: ReactNode
}

function ReadFooter({ isPhone, totals, message, memo, memoLabel, attachments }: FooterProps) {
    const notesClass = isPhone ? 'gap-3' : 'min-w-0 flex-1 gap-3'
    const notes = (
        <View className={notesClass}>
            <DocumentDetail
                field="message"
                label={DOCUMENT_NOTE_LABELS.message}
                value={message}
                valueSuffix="message"
            />
            <DocumentDetail field="memo" label={memoLabel} value={memo} valueSuffix="memo" />
            {attachments}
        </View>
    )
    if (isPhone) {
        return (
            <View className="gap-4">
                <DocumentTotalsPanel totals={totals} />
                {notes}
            </View>
        )
    }
    return (
        <View className="flex-row gap-6">
            {notes}
            <View className="min-w-0 flex-1" style={WIDE_TOTALS}>
                <DocumentTotalsPanel totals={totals} />
            </View>
        </View>
    )
}

// The Write off dialog of this read view; only an invoice offers Write off.
function ReadWriteOffDialog({ owner, isVisible }: { owner: string; isVisible: boolean }) {
    if (!isVisible) return null
    return <WriteOffDialog owner={owner} />
}

function Stamp({ testID, text }: { testID: string; text: string }) {
    if (text === '') return null
    return (
        <Text testID={testID} className="text-xs text-muted-foreground">
            {text}
        </Text>
    )
}

function ReplacedByLink({ record, isVisible }: { record: DocumentRecord; isVisible: boolean }) {
    const { doc } = useDocumentKind()
    const orgHref = useOrgHref()
    if (!isVisible || !record.replaced_by) return null
    const open = () => router.replace(orgHref(documentHref(doc, record.replaced_by)))
    // A correction keeps the number of the document it replaces.
    const text = `Replaced by ${record.number} (edited)`
    const testID = `${doc.testId}-replaced-by`
    return (
        <Pressable
            testID={testID}
            accessibilityRole="link"
            onPress={open}
            className="justify-center self-start"
            style={LINK_STYLE}
        >
            <Text className="text-sm text-primary underline">{text}</Text>
        </Pressable>
    )
}

// The read view has no unsaved state: its PDF view never offers a save.
const NO_SAVE = () => {}

interface StampsProps {
    record: DocumentRecord
    // Only the posting lifecycle posts, voids and replaces.
    isPosting: boolean
}

// Under the message and memo: Posted by, the kind's line under it (an invoice's "From
// estimate <n>", a closed estimate's "Converted to invoice <n>"), Voided by and the
// replacement's link. A quote has only the kind's line.
function ReadStamps({ record, isPosting }: StampsProps) {
    const { doc, ReadStampRow } = useDocumentKind()
    const stampRow = ReadStampRow ? <ReadStampRow record={record} /> : null
    const posted = isPosting ? stampText(record.postedBy?.name, record.posted_at) : ''
    const postedText = posted ? `Posted by ${posted}` : ''
    const voided = isPosting ? stampText(record.voidedBy?.name, record.voided_at) : ''
    const voidedText = voided ? `Voided by ${voided}` : ''
    const ids = { postedBy: `${doc.testId}-posted-by`, voidedBy: `${doc.testId}-voided-by` }
    return (
        <View className="gap-1">
            <Stamp testID={ids.postedBy} text={postedText} />
            {stampRow}
            <Stamp testID={ids.voidedBy} text={voidedText} />
            <ReplacedByLink record={record} isVisible={isPosting} />
        </View>
    )
}

// The Details panel of a kind without its own ReadFrame: the body, the kind's ReadSection
// (an invoice's Credit memos, a sales receipt's Refund receipts, a credit memo's Refunds)
// with the read view's linked refunds read and its one Retry, then the stamps.
function SectionReadFrame({
    record,
    body,
    stamps,
    linkedRefunds,
    onRetry,
}: Omit<DocumentReadFrameProps, 'refunds'> & Omit<DocumentReadSectionProps, 'record'>) {
    const { ReadSection } = useDocumentKind()
    const section = ReadSection ? (
        <ReadSection record={record} linkedRefunds={linkedRefunds} onRetry={onRetry} />
    ) : null
    return (
        <>
            {body}
            {section}
            {stamps}
        </>
    )
}

interface DocumentReadViewProps {
    data: DocumentScreenData
    record: DocumentRecord
    tab: DocumentTab
}

/**
 * A posted or void sales document, or a quote shown read only (a closed estimate, or any
 * estimate for a reader): the header, the kind's notice (in its ReadFrame: a vendor
 * credit's Apply to bills), Customer, Bill to, Email, the date and the kind's
 * own details, Tax, the lines with their stored amounts, the stored totals with the tax
 * snapshot (an invoice's or a bill's with its Payments row and its Balance due from its
 * open balance; a bill's with Credits applied), Message and Memo, an invoice's or a bill's
 * Payments block (a bill's with its credit rows and their Remove, whose confirm this view
 * owns), the kind's own
 * section after it (ReadSection: an invoice's Credit memos, a sales receipt's Refund
 * receipts, a credit memo's Refunds; in its ReadFrame: a vendor
 * credit's Applied to), the kind's line under them
 * (ReadStampRow)
 * and, for the posting lifecycle only, the Posted by / Voided by stamps around it and, for
 * a replaced original, the link to its replacement; or, on the PDF view tab, its PDF. The
 * bar's actions follow the lifecycle's read actions for the user's
 * access (useDocumentReadActions); their keys are in this screen's `compose` scope.
 */
export function DocumentReadView({ data, record, tab }: DocumentReadViewProps) {
    const documentKind = useDocumentKind()
    const { doc } = documentKind
    const scopeOwner = useShortcutScope('compose')
    const isPhone = useBreakpoint() === 'mobile'
    // Write off opens useWriteOffStore with this screen as the owner, so only the dialog this
    // screen mounts (ReadWriteOffDialog) draws, not one of a list under it in the stack.
    const owner = useId()
    const read = useDocumentReadActions(documentKind, record, data.canWrite, owner)
    const historyItem = useHistoryItem(DOCUMENT_COLLECTIONS[doc.key], record.id)
    const writes = useServerActionState()
    useReadAttachmentSession(record.id, doc.features.attachments)
    const credits = useReadCredits(record, documentKind.readApplications)
    const canRemove = removeApplicationOffered(data.canWrite, record.status)
    const removal = useRemoveApplication({ applications: credits.applications, canRemove })
    const refunds = useReadRefunds(record, documentKind.readRefunds)
    const linkedRefunds = useReadLinkedRefunds(record, documentKind.readLinkedRefunds)
    const refunded = readRefundedOf(documentKind, refunds, linkedRefunds)
    // Every Retry of the read view is one call over the screen's failed reads, the credits
    // read, the refunds read and the linked refund receipts read.
    const creditsRecovery = credits.recovery
    const refundsRecovery = refunds.recovery
    const linkedRecovery = linkedRefunds.recovery
    const retry = () => data.retryWith([creditsRecovery, refundsRecovery, linkedRecovery])
    const onRemove = canRemove ? removal.ask : undefined
    const totals = readTotals(data, record, documentKind, refunded)
    const ReadLines = documentKind.ReadLines ?? DocumentReadLines
    // A kind without a message to the customer shows none (an empty detail is not drawn).
    const message = doc.features.message ? record.message : ''
    const memoLabel = memoLabelFor(doc.features)
    const address = addressLines(record, doc).join('\n')
    const partyName = partyNameOf(data, record, doc)
    const date = record.date ? formatDay(record.date) : ''
    const tax = totals.tax?.label ?? ''
    const title = `${doc.noun} ${record.number}`
    const isDetailsTab = tab === 'edit'
    const isPdfTab = tab === 'pdf'
    const isPosting = doc.lifecycle === 'posting'
    const isInvoice = record.kindFields.kind === 'invoice'
    const isExpired = expiredOnOf(record, todayIso()) !== null
    const readOnlyId = `${doc.testId}-read-only`
    const attachments = doc.features.attachments ? (
        <AttachmentsSection
            kind={doc}
            attachments={data.attachments}
            recordId={record.id}
            isVoid={record.status === 'void'}
            replacedByNumber={record.replaced_by ? record.number : ''}
            canWrite={data.canWrite}
            isDisabled={writes.isDisabled}
            mode="read"
            scopeOwner={scopeOwner}
            onRetry={retry}
        />
    ) : null
    const badge = readBadgeOf(record, documentKind.balanceBadge, refunded)
    const body = (
        <>
            <ReadBand
                isPhone={isPhone}
                record={record}
                partyName={partyName}
                address={address}
                date={date}
                tax={tax}
            />
            <ReadLines lines={data.lines} currency={data.currency} isPhone={isPhone} />
            <ReadFooter
                isPhone={isPhone}
                totals={totals}
                message={message}
                memo={record.memo}
                memoLabel={memoLabel}
                attachments={attachments}
            />
            <PaymentsBlock
                data={data}
                record={record}
                credits={credits}
                onRetry={retry}
                onRemove={onRemove}
            />
        </>
    )
    const stamps = <ReadStamps record={record} isPosting={isPosting} />
    const ReadFrame = documentKind.ReadFrame
    const details = ReadFrame ? (
        <ReadFrame record={record} body={body} stamps={stamps} refunds={refunds} />
    ) : (
        <SectionReadFrame
            record={record}
            body={body}
            stamps={stamps}
            linkedRefunds={linkedRefunds}
            onRetry={retry}
        />
    )
    // The Payments block waits for the credits read, so it never draws its payments without
    // its credit rows; a failed read shows its notice with Retry in the block, and the
    // totals still read Credits applied from the stored record. A vendor credit waits for its
    // refunds read too, so its totals and badge never draw a refund as applied to a bill.
    if (!credits.isReady && !credits.isError) return <DocumentLoading />
    if (!refunds.isReady && !refunds.isError) return <DocumentLoading />
    return (
        <ScopeProvider owner={scopeOwner}>
            <View testID={readOnlyId} className="flex-1 bg-background">
                <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-2 pb-6">
                    <EntryBackLink />
                    <DocumentHeader
                        title={title}
                        status={record.status}
                        figure={totals.last}
                        isExpired={isExpired}
                        badge={badge}
                    />
                    <DocumentTabs selected={tab} firstLabel="Details" scopeOwner={scopeOwner} />
                    <TabPanel isVisible={isDetailsTab}>{details}</TabPanel>
                    <TabPanel isVisible={isPdfTab}>
                        <DocumentPdfView
                            documentId={record.id}
                            version={record.updated}
                            isDirty={false}
                            isSaving={false}
                            onSave={NO_SAVE}
                        />
                    </TabPanel>
                </ScrollView>
                <DocumentReadActions
                    actions={read.actions}
                    historyItem={historyItem}
                    isPhone={isPhone}
                    isBusy={read.voidDialog.isPending}
                    hasPdf={doc.features.pdf}
                    scopeOwner={scopeOwner}
                />
                <VoidDialog {...read.voidDialog} />
                <ReadWriteOffDialog owner={owner} isVisible={isInvoice} />
                <RemoveApplicationDialog
                    application={removal.target}
                    isVisible={removal.isVisible}
                    currency={data.currency}
                    isPending={removal.isPending}
                    errorMessage={removal.errorMessage}
                    onConfirm={removal.confirm}
                    onCancel={removal.cancel}
                />
            </View>
        </ScopeProvider>
    )
}
