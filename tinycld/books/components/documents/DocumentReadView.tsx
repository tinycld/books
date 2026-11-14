import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useFormHost } from '@tinycld/core/lib/forms/use-form-hosts'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { type DocumentRecord, documentPartyIdOf, expiredOnOf } from '../../hooks/document-data'
import { useDocumentReadActions } from '../../hooks/useDocumentReadActions'
import type { DocumentScreenData } from '../../hooks/useDocumentScreen'
import { formatAddressLines, isCustomerAddress } from '../../lib/address'
import { DOCUMENT_NOTE_LABELS, memoLabelFor } from '../../lib/document-notes'
import { type DocumentTab, documentHref } from '../../lib/document-routes'
import { documentTaxOf } from '../../lib/document-tax'
import { NO_CUSTOMER_TEXT } from '../../lib/document-texts'
import { lineTableSubtotals } from '../../lib/document-values'
import { stampText } from '../../lib/entry-display'
import { formatMoney } from '../../lib/money'
import { formatDay, todayIso } from '../../lib/register-range'
import { DOCUMENT_PARTIES, type SalesDocumentKind } from '../../lib/sales-document-kinds'
import { groupPpm, ratePercentText } from '../../lib/sales-tax'
import { EntryBackLink } from '../entries/EntryHeader'
import { VoidDialog } from '../entries/VoidDialog'
import { DocumentDetail } from './DocumentDetail'
import { DocumentHeader } from './DocumentHeader'
import { DocumentPdfView } from './DocumentPdfView'
import { DocumentReadActions } from './DocumentReadActions'
import { DOCUMENT_READ_TRAILING_WIDTH, DocumentReadLines } from './DocumentReadLines'
import { DocumentTabs, TabPanel } from './DocumentTabs'
import { DocumentTotalsPanel, type DocumentTotalsView } from './DocumentTotalsPanel'
import { useDocumentKind } from './document-kind-context'
import { type DocumentKind, storedLineTableRows } from './document-kinds'

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

// The last row and the big figure are the total in this unit (spec §3.4), posted or
// void: payments come later.
function readTotals(
    data: DocumentScreenData,
    record: DocumentRecord,
    documentKind: Pick<DocumentKind, 'doc' | 'lineSpecs'>
): DocumentTotalsView {
    const { doc } = documentKind
    const money = (cents: number) => formatMoney(cents, data.currency)
    const total = money(record.total)
    // A kind with more than one line table has no single Subtotal row.
    const subtotal = doc.lineTables.length > 1 ? null : money(record.subtotal)
    return {
        subtotal,
        tableSubtotals: readTableSubtotals(data, documentKind),
        tax: readTaxLine(data, record, doc),
        total,
        last: total,
    }
}

// The party's address as the document stored it: a sales kind's Bill to, a bill's
// Mailing address.
function addressLines(record: DocumentRecord): string[] {
    const fields = record.kindFields
    const address = fields.kind === 'bill' ? fields.mailing_address : record.bill_to
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

// The party's name; "No customer" for a document saved without one (a sales receipt's
// walk-in sale).
function partyNameOf(data: DocumentScreenData, record: DocumentRecord): string {
    if (documentPartyIdOf(record) === '') return NO_CUSTOMER_TEXT
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
}

function ReadFooter({ isPhone, totals, message, memo, memoLabel }: FooterProps) {
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

interface DocumentReadViewProps {
    data: DocumentScreenData
    record: DocumentRecord
    tab: DocumentTab
}

/**
 * A posted or void sales document, or a quote shown read only (a closed estimate, or any
 * estimate for a reader): the header, Customer, Bill to, Email, the date and the kind's
 * own details, Tax, the lines with their stored amounts, the stored totals with the tax
 * snapshot, Message and Memo, the kind's line under them (ReadStampRow) and, for the
 * posting lifecycle only, the Posted by / Voided by stamps around it and, for a replaced
 * original, the link to its replacement; or, on the PDF
 * view tab, its PDF. The bar's actions follow the lifecycle's read actions for the user's
 * access (useDocumentReadActions); their keys are in this screen's `compose` scope.
 */
export function DocumentReadView({ data, record, tab }: DocumentReadViewProps) {
    const documentKind = useDocumentKind()
    const { doc } = documentKind
    const scopeOwner = useShortcutScope('compose')
    const isPhone = useBreakpoint() === 'mobile'
    const read = useDocumentReadActions(documentKind, record, data.canWrite)
    const totals = readTotals(data, record, documentKind)
    const ReadLines = documentKind.ReadLines ?? DocumentReadLines
    // A kind without a message to the customer shows none (an empty detail is not drawn).
    const message = doc.features.message ? record.message : ''
    const memoLabel = memoLabelFor(doc.features)
    const address = addressLines(record).join('\n')
    const partyName = partyNameOf(data, record)
    const date = record.date ? formatDay(record.date) : ''
    const tax = totals.tax?.label ?? ''
    const title = `${doc.noun} ${record.number}`
    const isDetailsTab = tab === 'edit'
    const isPdfTab = tab === 'pdf'
    const isPosting = doc.lifecycle === 'posting'
    const isExpired = expiredOnOf(record, todayIso()) !== null
    const readOnlyId = `${doc.testId}-read-only`
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
                    />
                    <DocumentTabs selected={tab} firstLabel="Details" scopeOwner={scopeOwner} />
                    <TabPanel isVisible={isDetailsTab}>
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
                        />
                        <ReadStamps record={record} isPosting={isPosting} />
                    </TabPanel>
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
                    isPhone={isPhone}
                    isBusy={read.voidDialog.isPending}
                    scopeOwner={scopeOwner}
                />
                <VoidDialog {...read.voidDialog} />
            </View>
        </ScopeProvider>
    )
}
