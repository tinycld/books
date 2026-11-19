import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { router } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import { useVoidWriteOff } from '../../hooks/useVoidWriteOff'
import type { WriteOffRecordView } from '../../hooks/useWriteOffRecord'
import { formatMoney } from '../../lib/money'
import { formatDay } from '../../lib/register-range'
import { INVOICE_KIND } from '../../lib/sales-document-kinds'
import { writeOffReadActions, writeOffStampOf } from '../../lib/write-off-actions'
import { WRITE_OFF_TEXTS } from '../../lib/write-off-fixture'
import { DocumentHeader } from '../documents/DocumentHeader'
import { type DocumentChrome, DocumentChromeContext } from '../documents/document-chrome'
import { EntryBackLink } from '../entries/EntryHeader'
import { VoidDialog } from '../entries/VoidDialog'
import { Detail, READ_BAND, Stamp, TextLink } from '../payments/read-view-parts'
import { WriteOffReadActions } from './WriteOffReadActions'

// The write-off page is no document kind: it gives the shared header and More menu their
// texts here (plan decision 7).
const WRITE_OFF_CHROME: DocumentChrome = {
    testId: 'write-off',
    shortcutGroup: 'Write-off',
    figure: { label: WRITE_OFF_TEXTS.amountWrittenOffLabel, testId: 'amount' },
    helpTopic: 'books:write-offs',
    lifecycle: 'posting',
}

interface LinkDetailProps {
    label: string
    // Empty while the related row is not in the store: the row is left out until it is.
    text: string
    onPress: () => void
    testID: string
}

function LinkDetail({ label, text, onPress, testID }: LinkDetailProps) {
    if (text === '') return null
    return (
        <View testID={testID} className="min-w-0 max-w-full gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <TextLink text={text} onPress={onPress} testID={`${testID}-link`} />
        </View>
    )
}

// The reason takes the band's full width so a long one wraps; with no reason the band
// draws no row for it (spec §3.5 "Reason (left out when empty)").
function ReasonDetail({ memo }: { memo: string }) {
    if (memo === '') return null
    return (
        <View className="w-full">
            <Detail label="Reason" value={memo} testID="write-off-detail-reason" />
        </View>
    )
}

function accountTextOf(account: WriteOffRecordView['account']): string {
    if (!account) return ''
    return `${account.number} ${account.name}`.trim()
}

interface WriteOffReadViewProps {
    writeOff: WriteOffRecordView
    canWrite: boolean
}

/**
 * A posted or void write-off (write-off spec §3.5): the header with the status and the
 * amount written off, the band (Customer and Invoice as links, the date, the account, the
 * reason when there is one), the stamps, the bar and the Void dialog. The page holds no
 * input, so it has no leave guard.
 */
export function WriteOffReadView({ writeOff, canWrite }: WriteOffReadViewProps) {
    const scopeOwner = useShortcutScope('compose')
    const orgHref = useOrgHref()
    const voidWriteOff = useVoidWriteOff()
    const writesAvailable = useWritesAvailable().available
    const title = `Write-off ${writeOff.number}`
    const figure = formatMoney(writeOff.amount, writeOff.currency)
    const customerName = writeOff.customer?.name ?? ''
    const invoiceText = writeOff.invoice ? `Invoice ${writeOff.invoice.number}` : ''
    const date = formatDay(writeOff.date.slice(0, 10))
    const accountText = accountTextOf(writeOff.account)
    const posted = writeOffStampOf('Posted', writeOff.postedByName, writeOff.posted_at)
    const voided = writeOffStampOf('Voided', writeOff.voidedByName, writeOff.voided_at)
    const openCustomer = () => router.push(orgHref(`books/customers/${writeOff.customerId}`))
    const openInvoice = useOpenDocument(INVOICE_KIND, writeOff.invoiceId)
    // The dialog closes when Void stops being offered (the write-off was voided elsewhere
    // while it was open), unless this dialog's own void runs.
    const isVoidOffered = writeOffReadActions(writeOff.status, canWrite).includes('void')
    const isVoidVisible = voidWriteOff.isOpen && (isVoidOffered || voidWriteOff.isPending)
    const isConfirmDisabled = !writesAvailable
    const voidBody = `The invoice's balance due rises by ${figure} again.`
    const voidNumber = `write-off ${writeOff.number}`
    const confirmVoid = () => voidWriteOff.confirm(writeOff.id)
    const barRecord = {
        status: writeOff.status,
        entry: writeOff.entry,
        invoiceId: writeOff.invoiceId,
    }
    return (
        <DocumentChromeContext.Provider value={WRITE_OFF_CHROME}>
            <ScopeProvider owner={scopeOwner}>
                <View testID="write-off-read-only" className="flex-1 bg-background">
                    <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-2 pb-6">
                        <EntryBackLink />
                        <DocumentHeader
                            title={title}
                            status={writeOff.status}
                            figure={figure}
                            isExpired={false}
                        />
                        <View className={`${READ_BAND} flex-row flex-wrap gap-x-6 gap-y-3`}>
                            <LinkDetail
                                label="Customer"
                                text={customerName}
                                onPress={openCustomer}
                                testID="write-off-detail-customer"
                            />
                            <LinkDetail
                                label="Invoice"
                                text={invoiceText}
                                onPress={openInvoice}
                                testID="write-off-detail-invoice"
                            />
                            <Detail
                                label="Write-off date"
                                value={date}
                                testID="write-off-detail-date"
                            />
                            <Detail
                                label="Written off to"
                                value={accountText}
                                testID="write-off-detail-account"
                            />
                            <ReasonDetail memo={writeOff.memo} />
                        </View>
                        <View className="gap-1">
                            <Stamp text={posted} testID="write-off-posted-by" />
                            <Stamp text={voided} testID="write-off-voided-by" />
                        </View>
                    </ScrollView>
                    <WriteOffReadActions
                        writeOff={barRecord}
                        canWrite={canWrite}
                        isVoidPending={voidWriteOff.isPending}
                        onVoid={voidWriteOff.open}
                        scopeOwner={scopeOwner}
                    />
                    <VoidDialog
                        isVisible={isVoidVisible}
                        entryNumber={voidNumber}
                        confirmLabel={WRITE_OFF_TEXTS.voidConfirm}
                        body={voidBody}
                        isPending={voidWriteOff.isPending}
                        isConfirmDisabled={isConfirmDisabled}
                        errorMessage={voidWriteOff.errorMessage}
                        onConfirm={confirmVoid}
                        onCancel={voidWriteOff.close}
                    />
                </View>
            </ScopeProvider>
        </DocumentChromeContext.Provider>
    )
}
