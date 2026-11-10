import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useInvoiceReadActions } from '../../hooks/useInvoiceReadActions'
import type { InvoiceScreenData } from '../../hooks/useInvoiceScreen'
import { formatAddressLines, isCustomerAddress } from '../../lib/address'
import { stampText } from '../../lib/entry-display'
import { type DocumentTab, invoiceHref } from '../../lib/invoice-routes'
import { formatMoney } from '../../lib/money'
import { paymentTermLabel } from '../../lib/payment-terms'
import { formatDay } from '../../lib/register-range'
import { groupPpm, ratePercentText } from '../../lib/sales-tax'
import { EntryBackLink } from '../entries/EntryHeader'
import { VoidDialog } from '../entries/VoidDialog'
import { DocumentTabs, TabPanel } from './DocumentTabs'
import { InvoiceHeader } from './InvoiceHeader'
import { InvoicePdfView } from './InvoicePdfView'
import { InvoiceReadActions } from './InvoiceReadActions'
import { INVOICE_READ_TRAILING_WIDTH, InvoiceReadLines } from './InvoiceReadLines'
import { InvoiceTotals, type InvoiceTotalsView } from './InvoiceTotals'

type ReadInvoice = NonNullable<InvoiceScreenData['invoice']>

const LINK_STYLE = { minHeight: 44 }

// The tax line: the invoice's rate name with the snapshot's combined percent and amount,
// so a rate changed after posting does not change it. No row without a tax rate; with a
// rate but no snapshot rows (no line was taxable), the rate's name and the stored tax
// total, as there is no snapshot percent to show.
function readTaxLine(data: InvoiceScreenData, invoice: ReadInvoice): InvoiceTotalsView['tax'] {
    if (!invoice.tax_rate) return null
    const amount = (cents: number) => formatMoney(cents, data.currency)
    const name = invoice.taxRateRow?.name ?? 'Tax'
    if (data.taxLines.length === 0) return { label: name, amount: amount(invoice.tax_total) }
    const ppm = groupPpm(data.taxLines.map(line => line.rate_ppm))
    const total = data.taxLines.reduce((sum, line) => sum + line.amount, 0)
    return { label: `${name} (${ratePercentText(ppm)})`, amount: amount(total) }
}

// Balance due is the total in this unit (spec §3.4), posted or void: payments come later.
function readTotals(data: InvoiceScreenData, invoice: ReadInvoice): InvoiceTotalsView {
    const money = (cents: number) => formatMoney(cents, data.currency)
    const total = money(invoice.total)
    return {
        subtotal: money(invoice.subtotal),
        tax: readTaxLine(data, invoice),
        total,
        balance: total,
    }
}

function billToLines(invoice: ReadInvoice): string[] {
    return isCustomerAddress(invoice.bill_to) ? formatAddressLines(invoice.bill_to) : []
}

interface DetailProps {
    field: string
    label: string
    value: string
}

// One body field; an empty value is left out. Its width is the column's it sits in.
function Detail({ field, label, value }: DetailProps) {
    if (value === '') return null
    return (
        <View testID={`invoice-detail-${field}`} className="gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <Text className="text-sm text-foreground">{value}</Text>
        </View>
    )
}

interface BandProps {
    isPhone: boolean
    customer: string
    billTo: string
    email: string
    terms: string
    date: string
    due: string
    tax: string
}

// The band as the form draws it: Customer, Bill to and Email in the left column at full
// width; Terms, Invoice date and Due date in one row with Tax under them on the right.
// A phone stacks the two columns in flow: a column there has no flex-1, because a zero
// flex basis in a column of auto height lets the blocks draw on top of each other.
function ReadBand({ isPhone, customer, billTo, email, terms, date, due, tax }: BandProps) {
    const direction = isPhone ? 'flex-col gap-3' : 'flex-row gap-6'
    const column = isPhone ? 'gap-3' : 'min-w-0 flex-1 gap-3'
    return (
        <View className={`${direction} rounded-xl border border-border bg-surface-secondary p-4`}>
            <View className={column}>
                <Detail field="customer" label="Customer" value={customer} />
                <Detail field="bill-to" label="Bill to" value={billTo} />
                <Detail field="email" label="Email" value={email} />
            </View>
            <View className={column}>
                <View className="flex-row flex-wrap gap-x-6 gap-y-3">
                    <Detail field="terms" label="Terms" value={terms} />
                    <Detail field="date" label="Invoice date" value={date} />
                    <Detail field="due" label="Due date" value={due} />
                </View>
                <Detail field="tax" label="Tax" value={tax} />
            </View>
        </View>
    )
}

// Wide: the totals end under the lines' Amount column (the Tax column's width and the
// grid gap to its right), with Message on invoice and Memo in the left column beside
// them, as the form's footer. A phone stacks the totals over Message and Memo.
const WIDE_TOTALS = { paddingRight: INVOICE_READ_TRAILING_WIDTH }

interface FooterProps {
    isPhone: boolean
    totals: InvoiceTotalsView
    message: string
    memo: string
}

function ReadFooter({ isPhone, totals, message, memo }: FooterProps) {
    const notesClass = isPhone ? 'gap-3' : 'min-w-0 flex-1 gap-3'
    const notes = (
        <View className={notesClass}>
            <Detail field="message" label="Message on invoice" value={message} />
            <Detail field="memo" label="Memo" value={memo} />
        </View>
    )
    if (isPhone) {
        return (
            <View className="gap-4">
                <InvoiceTotals totals={totals} />
                {notes}
            </View>
        )
    }
    return (
        <View className="flex-row gap-6">
            {notes}
            <View className="min-w-0 flex-1" style={WIDE_TOTALS}>
                <InvoiceTotals totals={totals} />
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

function ReplacedByLink({ invoice }: { invoice: ReadInvoice }) {
    const orgHref = useOrgHref()
    if (!invoice.replaced_by) return null
    const open = () => router.replace(orgHref(invoiceHref(invoice.replaced_by)))
    // A correction keeps the number of the invoice it replaces.
    const text = `Replaced by ${invoice.number} (edited)`
    return (
        <Pressable
            testID="invoice-replaced-by"
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

interface InvoiceReadViewProps {
    data: InvoiceScreenData
    invoice: ReadInvoice
    tab: DocumentTab
}

/**
 * A posted or void invoice, read only: the header, Bill to, Email, Terms, the dates and
 * Tax, the lines with their stored amounts, the stored totals with the tax snapshot,
 * Message and Memo, the Posted by / Voided by stamps and, for a replaced original, the
 * link to its replacement; or, on the PDF view tab, its PDF. The bar's actions follow
 * `invoiceReadActions` for the user's access; their keys are in this screen's `compose`
 * scope.
 */
export function InvoiceReadView({ data, invoice, tab }: InvoiceReadViewProps) {
    const scopeOwner = useShortcutScope('compose')
    const isPhone = useBreakpoint() === 'mobile'
    const read = useInvoiceReadActions(invoice, data.canWrite)
    const totals = readTotals(data, invoice)
    const billTo = billToLines(invoice).join('\n')
    const customerName = data.customer?.display_name ?? ''
    const terms = invoice.terms ? paymentTermLabel(invoice.terms) : ''
    const date = invoice.date ? formatDay(invoice.date) : ''
    const due = invoice.due_date ? `Due ${formatDay(invoice.due_date)}` : ''
    const tax = totals.tax?.label ?? ''
    const posted = stampText(invoice.postedBy?.name, invoice.posted_at)
    const postedText = posted ? `Posted by ${posted}` : ''
    const voided = stampText(invoice.voidedBy?.name, invoice.voided_at)
    const voidedText = voided ? `Voided by ${voided}` : ''
    const title = `Invoice ${invoice.number}`
    const isDetailsTab = tab === 'edit'
    const isPdfTab = tab === 'pdf'
    return (
        <ScopeProvider owner={scopeOwner}>
            <View testID="invoice-read-only" className="flex-1 bg-background">
                <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-2 pb-6">
                    <EntryBackLink />
                    <InvoiceHeader
                        title={title}
                        status={invoice.status}
                        balanceDue={totals.balance}
                    />
                    <DocumentTabs selected={tab} firstLabel="Details" scopeOwner={scopeOwner} />
                    <TabPanel isVisible={isDetailsTab}>
                        <ReadBand
                            isPhone={isPhone}
                            customer={customerName}
                            billTo={billTo}
                            email={invoice.email}
                            terms={terms}
                            date={date}
                            due={due}
                            tax={tax}
                        />
                        <InvoiceReadLines
                            lines={data.lines}
                            currency={data.currency}
                            isPhone={isPhone}
                        />
                        <ReadFooter
                            isPhone={isPhone}
                            totals={totals}
                            message={invoice.message}
                            memo={invoice.memo}
                        />
                        <View className="gap-1">
                            <Stamp testID="invoice-posted-by" text={postedText} />
                            <Stamp testID="invoice-voided-by" text={voidedText} />
                            <ReplacedByLink invoice={invoice} />
                        </View>
                    </TabPanel>
                    <TabPanel isVisible={isPdfTab}>
                        <InvoicePdfView
                            invoiceId={invoice.id}
                            version={invoice.updated}
                            isDirty={false}
                            isSaving={false}
                            onSaveDraft={NO_SAVE}
                        />
                    </TabPanel>
                </ScrollView>
                <InvoiceReadActions
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
