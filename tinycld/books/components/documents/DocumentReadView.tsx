import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useFormHost } from '@tinycld/core/lib/forms/use-form-hosts'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { DocumentRecord } from '../../hooks/document-data'
import { useDocumentReadActions } from '../../hooks/useDocumentReadActions'
import type { DocumentScreenData } from '../../hooks/useDocumentScreen'
import { formatAddressLines, isCustomerAddress } from '../../lib/address'
import { DOCUMENT_NOTE_LABELS } from '../../lib/document-notes'
import { type DocumentTab, documentHref } from '../../lib/document-routes'
import { stampText } from '../../lib/entry-display'
import { formatMoney } from '../../lib/money'
import { formatDay } from '../../lib/register-range'
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

const LINK_STYLE = { minHeight: 44 }

// The tax line: the document's rate name with the snapshot's combined percent and
// amount, so a rate changed after posting does not change it. No row without a tax rate;
// with a rate but no snapshot rows (no line was taxable), the rate's name and the stored
// tax total, as there is no snapshot percent to show.
function readTaxLine(data: DocumentScreenData, record: DocumentRecord): DocumentTotalsView['tax'] {
    if (!record.tax_rate) return null
    const amount = (cents: number) => formatMoney(cents, data.currency)
    const name = record.taxRateRow?.name ?? 'Tax'
    if (data.taxLines.length === 0) return { label: name, amount: amount(record.tax_total) }
    const ppm = groupPpm(data.taxLines.map(line => line.rate_ppm))
    const total = data.taxLines.reduce((sum, line) => sum + line.amount, 0)
    return { label: `${name} (${ratePercentText(ppm)})`, amount: amount(total) }
}

// The last row and the big figure are the total in this unit (spec §3.4), posted or
// void: payments come later.
function readTotals(data: DocumentScreenData, record: DocumentRecord): DocumentTotalsView {
    const money = (cents: number) => formatMoney(cents, data.currency)
    const total = money(record.total)
    return {
        subtotal: money(record.subtotal),
        tax: readTaxLine(data, record),
        total,
        last: total,
    }
}

function billToLines(record: DocumentRecord): string[] {
    return isCustomerAddress(record.bill_to) ? formatAddressLines(record.bill_to) : []
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
    customer: string
    billTo: string
    date: string
    tax: string
}

// The band as the form draws it: Customer, Bill to and Email in the left column at full
// width; the kind's details around the date in one row with Tax under them on the right.
// A phone stacks the two columns in flow: a column there has no flex-1, because a zero
// flex basis in a column of auto height lets the blocks draw on top of each other.
function ReadBand({ isPhone, record, customer, billTo, date, tax }: BandProps) {
    const { ReadDetails, doc } = useDocumentKind()
    const dateLabel = useBuiltinLabel(doc.hostKey, 'date')
    const direction = isPhone ? 'flex-col gap-3' : 'flex-row gap-6'
    const bandClass = `${direction} rounded-xl border border-border bg-surface-secondary p-4`
    const column = isPhone ? 'gap-3' : 'min-w-0 flex-1 gap-3'
    return (
        <View className={bandClass}>
            <View className={column}>
                <DocumentDetail field="customer" label="Customer" value={customer} />
                <DocumentDetail field="bill-to" label="Bill to" value={billTo} />
                <DocumentDetail field="email" label="Email" value={record.email} />
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
    )
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
}

function ReadFooter({ isPhone, totals, message, memo }: FooterProps) {
    const notesClass = isPhone ? 'gap-3' : 'min-w-0 flex-1 gap-3'
    const notes = (
        <View className={notesClass}>
            <DocumentDetail field="message" label={DOCUMENT_NOTE_LABELS.message} value={message} />
            <DocumentDetail field="memo" label={DOCUMENT_NOTE_LABELS.memo} value={memo} />
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

function ReplacedByLink({ record }: { record: DocumentRecord }) {
    const { doc } = useDocumentKind()
    const orgHref = useOrgHref()
    if (!record.replaced_by) return null
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

// The read view has no unsaved state: its PDF view never offers Save draft.
const NO_SAVE = () => {}

interface DocumentReadViewProps {
    data: DocumentScreenData
    record: DocumentRecord
    tab: DocumentTab
}

/**
 * A posted or void sales document, read only: the header, Customer, Bill to, Email, the
 * date and the kind's own details, Tax, the lines with their stored amounts, the stored
 * totals with the tax snapshot, Message and Memo, the Posted by / Voided by stamps and,
 * for a replaced original, the link to its replacement; or, on the PDF view tab, its
 * PDF. The bar's actions follow `documentReadActions` for the user's access; their keys
 * are in this screen's `compose` scope.
 */
export function DocumentReadView({ data, record, tab }: DocumentReadViewProps) {
    const documentKind = useDocumentKind()
    const { doc } = documentKind
    const scopeOwner = useShortcutScope('compose')
    const isPhone = useBreakpoint() === 'mobile'
    const read = useDocumentReadActions(documentKind, record, data.canWrite)
    const totals = readTotals(data, record)
    const billTo = billToLines(record).join('\n')
    const customerName = data.customer?.display_name ?? ''
    const date = record.date ? formatDay(record.date) : ''
    const tax = totals.tax?.label ?? ''
    const posted = stampText(record.postedBy?.name, record.posted_at)
    const postedText = posted ? `Posted by ${posted}` : ''
    const voided = stampText(record.voidedBy?.name, record.voided_at)
    const voidedText = voided ? `Voided by ${voided}` : ''
    const title = `${doc.noun} ${record.number}`
    const isDetailsTab = tab === 'edit'
    const isPdfTab = tab === 'pdf'
    const ids = {
        readOnly: `${doc.testId}-read-only`,
        postedBy: `${doc.testId}-posted-by`,
        voidedBy: `${doc.testId}-voided-by`,
    }
    return (
        <ScopeProvider owner={scopeOwner}>
            <View testID={ids.readOnly} className="flex-1 bg-background">
                <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-2 pb-6">
                    <EntryBackLink />
                    <DocumentHeader title={title} status={record.status} figure={totals.last} />
                    <DocumentTabs selected={tab} firstLabel="Details" scopeOwner={scopeOwner} />
                    <TabPanel isVisible={isDetailsTab}>
                        <ReadBand
                            isPhone={isPhone}
                            record={record}
                            customer={customerName}
                            billTo={billTo}
                            date={date}
                            tax={tax}
                        />
                        <DocumentReadLines
                            lines={data.lines}
                            currency={data.currency}
                            isPhone={isPhone}
                        />
                        <ReadFooter
                            isPhone={isPhone}
                            totals={totals}
                            message={record.message}
                            memo={record.memo}
                        />
                        <View className="gap-1">
                            <Stamp testID={ids.postedBy} text={postedText} />
                            <Stamp testID={ids.voidedBy} text={voidedText} />
                            <ReplacedByLink record={record} />
                        </View>
                    </TabPanel>
                    <TabPanel isVisible={isPdfTab}>
                        <DocumentPdfView
                            documentId={record.id}
                            version={record.updated}
                            isDirty={false}
                            isSaving={false}
                            onSaveDraft={NO_SAVE}
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
