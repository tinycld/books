import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { errorToString } from '@tinycld/core/lib/errors'
import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { formatHint, ScopeProvider } from '@tinycld/core/lib/shortcuts'
import { useRecord } from '@tinycld/core/lib/use-record'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { FormRenderer, NARROW_BELOW } from '@tinycld/core/ui/forms'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { useFocusEffect } from 'expo-router'
import { useCallback, useId, useMemo, useState } from 'react'
import { FormProvider, type UseFormReturn, useWatch } from 'react-hook-form'
import { ScrollView, Text, View } from 'react-native'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { type InvoiceFormState, useInvoiceForm } from '../../hooks/useInvoiceForm'
import { useInvoiceSave } from '../../hooks/useInvoiceSave'
import type { InvoiceScreenData } from '../../hooks/useInvoiceScreen'
import { useInvoiceShortcuts } from '../../hooks/useInvoiceShortcuts'
import { usePdfDownload } from '../../hooks/usePdfDownload'
import { TOO_LARGE_TEXT } from '../../lib/entry-lines'
import { INVOICE_PDF_KEY, invoicePdfStem } from '../../lib/invoice-actions'
import {
    INVOICE_FOOTER_MENU_SPACER,
    INVOICE_FOOTER_ROW,
    INVOICE_FOOTER_SPANS,
} from '../../lib/invoice-footer-layout'
import { balanceDueText } from '../../lib/invoice-messages'
import type { DocumentTab } from '../../lib/invoice-routes'
import { invoiceTaxOf, lineAmountViews, shownInvoiceTotals } from '../../lib/invoice-tax'
import type { InvoiceFormValues } from '../../lib/invoice-values'
import { formatMoney } from '../../lib/money'
import { rootErrorOnly } from '../../lib/root-errors'
import { useInvoiceSaveStore } from '../../stores/invoice-save-store'
import { DeleteDraftDialog } from '../entries/DeleteDraftDialog'
import { DiscardDialog } from '../entries/DiscardDialog'
import { EntryBackLink } from '../entries/EntryHeader'
import { EntryLeaveContext } from '../entries/EntryLeaveContext'
import { DocumentTabs, openDocumentTab, TabPanel } from './DocumentTabs'
import { InvoiceActionBar, type InvoiceMoreItem } from './InvoiceActionBar'
import { InvoiceHeader } from './InvoiceHeader'
import { InvoiceLoading } from './InvoiceLoading'
import { InvoicePdfView } from './InvoicePdfView'
import { InvoiceTotals, type InvoiceTotalsView } from './InvoiceTotals'
import {
    InvoiceFormContext,
    type InvoiceFormScope,
    InvoiceLinesContext,
    type InvoiceLinesView,
} from './invoice-form-context'

type EngineForm = UseFormReturn<Record<string, unknown>>

const HIDDEN = { display: 'none' } as const

// The definition in three parts around the lines table: the header band (every field
// before `lines`, an admin's custom fields included), the table, and the footer
// (Message and Memo beside the totals). Each renderer validates nothing itself: the core
// hooks build the whole definition's schema at save.
function splitDefinition(definition: FormDefinition) {
    const at = definition.fields.findIndex(field => field.key === 'lines')
    const part = (fields: FormDefinition['fields']): FormDefinition => {
        const pages = new Set(fields.map(field => field.page))
        return { ...definition, fields, pages: definition.pages.filter(p => pages.has(p.key)) }
    }
    if (at < 0) return { band: definition, lines: part([]), footer: part([]) }
    return {
        band: part(definition.fields.slice(0, at)),
        lines: part(definition.fields.slice(at, at + 1)),
        footer: part(definition.fields.slice(at + 1)),
    }
}

// The customer the form names now: the stored one, then each pick. One live query, so
// every header field and line cell reads the same row.
function useFormCustomer(form: EngineForm) {
    const [customersCollection] = useStore('books_customers')
    const watched = useWatch({ control: form.control, name: 'customer' })
    const id = typeof watched === 'string' ? watched : ''
    const query = useLiveQuery({
        query: q => {
            if (!id) return undefined
            return q
                .from({ c: customersCollection })
                .where(({ c }) => eq(c.id, id))
                .findOne()
        },
        // Its own key: the screen's customer query has other consumers and its own
        // error handling (the screen's Retry).
        queryKey: ['books.invoice.form-customer', id],
    })
    const retry = () => {
        if (!query.collection) return
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [customersCollection],
            onError: err => log.error('books.invoice', err),
        })
    }
    return {
        customer: id ? query.data : undefined,
        isLoading: id !== '' && query.isLoading,
        isError: query.isError,
        retry,
    }
}

function moneyOrTooLarge(cents: number, isTooLarge: boolean, currency: string) {
    return isTooLarge ? TOO_LARGE_TEXT : formatMoney(cents, currency)
}

// The live totals, Balance due and each line's Amount cell, from the lines and the chosen
// tax: one pass per change for the whole form.
function useInvoiceTotals(form: EngineForm, scope: InvoiceFormScope) {
    const watched = useWatch({ control: form.control, name: 'lines' })
    const taxRate = useWatch({ control: form.control, name: 'tax_rate' })
    const { tax, label } = invoiceTaxOf(scope.taxRows, typeof taxRate === 'string' ? taxRate : '')
    const lines = (Array.isArray(watched) ? watched : []) as TableRow[]
    const values = { lines } as InvoiceFormValues
    const amounts = lineAmountViews(lines, scope.currency)
    const totals = shownInvoiceTotals(values, tax, scope.currency)
    const balance = balanceDueText(totals, scope.currency)
    const none = '—'
    const tooLarge = totals?.isTooLarge ?? false
    const view: InvoiceTotalsView = {
        subtotal: totals ? moneyOrTooLarge(totals.subtotal, tooLarge, scope.currency) : none,
        tax:
            label === null
                ? null
                : {
                      label,
                      amount: totals
                          ? moneyOrTooLarge(totals.taxTotal, tooLarge, scope.currency)
                          : none,
                  },
        total: balance,
        balance,
    }
    return { view, balance, amounts }
}

// Delete draft: the dialog is local UI no other component needs. The delete removes the
// row from the store at once, so the screen holds the form (and this dialog) before it
// starts: a refusal stays in the dialog, with the user's edits behind it, until the next
// attempt. A success leaves; the hold ends when the screen goes (useScreenHoldRelease).
function useInvoiceDelete(invoiceId: string | undefined, leave: () => void) {
    const [invoicesCollection] = useStore('books_invoices')
    const hold = useInvoiceSaveStore(s => s.hold)
    const release = useInvoiceSaveStore(s => s.release)
    const [isOpen, setOpen] = useState(false)
    const remove = useMutation({
        mutationFn: function* (id: string) {
            yield invoicesCollection.delete(id)
        },
        onSuccess: () => {
            setOpen(false)
            leave()
        },
        onError: (_error, id) => release(id),
    })
    const errorMessage = remove.error ? errorToString(remove.error) : null
    const open = () => {
        remove.reset()
        setOpen(true)
    }
    const confirm = () => {
        if (!invoiceId) return
        hold(invoiceId)
        remove.mutate(invoiceId)
    }
    return {
        isOpen,
        isPending: remove.isPending,
        errorMessage,
        open,
        confirm,
        cancel: () => setOpen(false),
    }
}

// A hold of this invoice (a delete that succeeded) ends when the user leaves the screen.
function useScreenHoldRelease(invoiceId: string | undefined) {
    const release = useInvoiceSaveStore(s => s.release)
    useFocusEffect(
        useCallback(
            () => () => {
                if (invoiceId) release(invoiceId)
            },
            [invoiceId, release]
        )
    )
}

// Whether core draws the lines table as cards: it measures the table's container and
// switches below NARROW_BELOW. The lines renderer is the only child of the measured view,
// so both read the same width.
function useLinesAreCards() {
    const { width, onLayout } = useContainerWidth()
    return { isCards: width > 0 && width < NARROW_BELOW, onLayout }
}

interface RendererProps {
    state: InvoiceFormState
    definition: FormDefinition
    testID: string
}

// No `scroll`: the screen owns the one scroll view. `summary="root"`: field errors show
// inline only, and the screen's own summary shows server refusals.
function PartRenderer({ state, definition, testID }: RendererProps) {
    if (definition.fields.length === 0) return null
    return (
        <FormRenderer
            layout="sections"
            host={state.host}
            ui={state.ui}
            definition={definition}
            form={state.form}
            context={state.context}
            recordId={state.recordId}
            summary="root"
            testID={testID}
        />
    )
}

// "Edit 1004" for a correction, new or saved; "Draft invoice" once the draft is stored;
// else "New invoice".
function invoiceFormTitle(replacesNumber: string, isStored: boolean): string {
    if (replacesNumber) return `Edit ${replacesNumber}`
    return isStored ? 'Draft invoice' : 'New invoice'
}

// A correction says what posting it does to the invoice it replaces.
function ReplaceNote({ number }: { number: string }) {
    if (!number) return null
    const text = `Posting this replaces invoice ${number} under the same number. The original is voided. Until you post, ${number} stays as it is.`
    return (
        <Text testID="invoice-replace-note" className="text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

function ErrorSummary({ form }: { form: EngineForm }) {
    const message = form.formState.errors.root?.server?.message
    const errors = rootErrorOnly({ root: { message } })
    return (
        <FormErrorSummary
            errors={errors}
            isEnabled={message !== undefined}
            variant="destructive"
            title={null}
            showFieldNames={false}
            testID="invoice-error-summary"
        />
    )
}

const PDF_HINT = formatHint(INVOICE_PDF_KEY).text

// Download PDF of the saved draft, from the More row and ⌘P. A new form has nothing
// printed yet; while a save runs the More menu is disabled, and so is the key.
function useDraftPdf(draftId: string | undefined, isSaving: boolean) {
    const download = usePdfDownload()
    const canDownload = draftId !== undefined && !isSaving && !download.isPending
    const run = () => {
        if (draftId === undefined) return
        download.mutate({ kind: 'invoice', id: draftId, fallbackName: invoicePdfStem('') })
    }
    const item: InvoiceMoreItem = {
        id: 'download-pdf',
        label: 'Download PDF',
        keys: PDF_HINT,
        isDisabled: !canDownload,
        onSelect: run,
    }
    return { canDownload, run, item }
}

// The stored draft's `updated`, read from its own row: every write of the draft (from its
// route, or from `new` after a refused post) moves it, and the PDF view fetches again.
// The row is the one the screen or the save already holds, so this sends no request.
function useDraftVersion(draftId: string | undefined): string {
    const [invoicesCollection] = useStore('books_invoices')
    const { record } = useRecord(invoicesCollection, draftId)
    return record?.updated ?? ''
}

interface InvoiceFormProps {
    data: InvoiceScreenData
    tab: DocumentTab
}

/**
 * The invoice form, new, draft, correction or copy: the header band, the lines table,
 * Message and Memo beside the totals, and the sticky action bar; or, on the PDF view tab,
 * the saved draft's PDF above the same bar. Keyed on its form key by the screen, so a new
 * route mounts a fresh form; a tab change keeps it.
 */
export function InvoiceForm({ data, tab }: InvoiceFormProps) {
    const state = useInvoiceForm({
        invoice: data.invoice,
        lines: data.lines,
        customer: data.customer,
        currency: data.currency,
        taxRows: data.taxOptions.rows,
        startValues: data.startValues,
    })
    const form = state.form as EngineForm
    // A save from the PDF tab that ends with a field error shows the form, where the
    // error is.
    const revealErrors = () => {
        if (tab === 'pdf') openDocumentTab('edit')
    }
    const save = useInvoiceSave(state, { tab, onFieldErrors: revealErrors })
    const { onBack: leave } = useBackToEntries()
    const formCustomer = useFormCustomer(form)
    // Per mounted form: the band's address inputs belong to this form only, so a form
    // opened later starts with them folded.
    const instanceId = useId()
    const bandKey = `${data.formKey}#${instanceId}`
    const scope = useMemo<InvoiceFormScope>(
        () => ({
            bandKey,
            currency: data.currency,
            customer: formCustomer.customer,
            isCustomerLoading: formCustomer.isLoading,
            customerLoadFailed: formCustomer.isError,
            retryCustomer: formCustomer.retry,
            taxRows: data.taxOptions.rows,
        }),
        [bandKey, data.currency, data.taxOptions.rows, formCustomer]
    )
    const totals = useInvoiceTotals(form, scope)
    const linesLayout = useLinesAreCards()
    const linesView = useMemo<InvoiceLinesView>(
        () => ({ amounts: totals.amounts, isCards: linesLayout.isCards }),
        [totals.amounts, linesLayout.isCards]
    )
    const [isDiscardOpen, setDiscardOpen] = useState(false)
    // The stored draft: the route's own, or the one a new form wrote before its post was
    // refused.
    const draftId = state.recordId ?? save.writtenId ?? undefined
    const deletion = useInvoiceDelete(draftId, leave)
    useScreenHoldRelease(draftId)
    const canDeleteDraft =
        (!state.isNew && data.invoice?.status === 'draft') || save.writtenId !== null
    const isPhone = useBreakpoint() === 'mobile'
    const onPostAndNew = () => {
        void save.post(true)
    }
    const isBusy = save.isSaving || deletion.isPending
    const pdf = useDraftPdf(draftId, isBusy)
    const pdfVersion = useDraftVersion(draftId)
    const shortcuts = useInvoiceShortcuts({
        isSaving: isBusy,
        canDeleteDraft,
        deleteDraft: deletion.open,
        isPhone,
        postAndNew: onPostAndNew,
        canDownloadPdf: pdf.canDownload,
        downloadPdf: pdf.run,
    })
    const parts = useMemo(
        () => (state.definition ? splitDefinition(state.definition) : null),
        [state.definition]
    )

    if (!state.isReady || !parts) return <InvoiceLoading />

    const cancel = () => (state.isDirty ? setDiscardOpen(true) : leave())
    const discard = () => {
        setDiscardOpen(false)
        leave()
    }
    const keepEditing = () => setDiscardOpen(false)
    const onSaveDraft = () => {
        void save.saveDraft()
    }
    const onPost = () => {
        void save.post(false)
    }
    const moreItems = [pdf.item]
    const pdfInvoiceId = draftId ?? null
    const title = invoiceFormTitle(data.replacesNumber, draftId !== undefined)
    // The form shows only drafts: a post's optimistic status shows here only once the
    // read view replaces the form.
    const status = 'draft'
    const isEditTab = tab === 'edit'
    const isPdfTab = tab === 'pdf'
    // On the grid's slots (lib/invoice-footer-layout.ts), so the totals end under Amount.
    const footerClass = isPhone ? 'gap-4' : undefined
    const footerRow = isPhone ? undefined : INVOICE_FOOTER_ROW
    const footerLeft = isPhone ? undefined : INVOICE_FOOTER_SPANS.left
    const footerTotals = isPhone ? undefined : INVOICE_FOOTER_SPANS.totals
    const footerRight = isPhone ? HIDDEN : INVOICE_FOOTER_SPANS.right
    const menuSpacer = isPhone ? HIDDEN : INVOICE_FOOTER_MENU_SPACER

    return (
        <InvoiceFormContext.Provider value={scope}>
            <ScopeProvider owner={shortcuts.scopeOwner}>
                <EntryLeaveContext.Provider value={cancel}>
                    <FormProvider {...form}>
                        <View
                            ref={save.surfaceRef}
                            testID="invoice-form"
                            className="flex-1 bg-background"
                        >
                            <ScrollView
                                className="flex-1"
                                contentContainerClassName="gap-4 px-4 pt-2 pb-6"
                                keyboardShouldPersistTaps="handled"
                            >
                                <EntryBackLink />
                                <InvoiceHeader
                                    title={title}
                                    status={status}
                                    balanceDue={totals.balance}
                                />
                                <ReplaceNote number={data.replacesNumber} />
                                <DocumentTabs
                                    selected={tab}
                                    firstLabel="Edit"
                                    scopeOwner={shortcuts.scopeOwner}
                                />
                                <ErrorSummary form={form} />
                                <TabPanel isVisible={isEditTab}>
                                    <View
                                        testID="invoice-band"
                                        className="rounded-xl border border-border bg-surface-secondary p-4"
                                    >
                                        <PartRenderer
                                            state={state}
                                            definition={parts.band}
                                            testID="invoice-band-form"
                                        />
                                    </View>
                                    <View testID="invoice-lines" onLayout={linesLayout.onLayout}>
                                        <InvoiceLinesContext.Provider value={linesView}>
                                            <PartRenderer
                                                state={state}
                                                definition={parts.lines}
                                                testID="invoice-lines-form"
                                            />
                                        </InvoiceLinesContext.Provider>
                                    </View>
                                    <View className={footerClass} style={footerRow}>
                                        <View style={footerLeft}>
                                            <PartRenderer
                                                state={state}
                                                definition={parts.footer}
                                                testID="invoice-footer-form"
                                            />
                                        </View>
                                        <View style={footerTotals}>
                                            <InvoiceTotals totals={totals.view} />
                                        </View>
                                        <View style={footerRight} />
                                        <View style={menuSpacer} />
                                    </View>
                                </TabPanel>
                                <TabPanel isVisible={isPdfTab}>
                                    <InvoicePdfView
                                        invoiceId={pdfInvoiceId}
                                        version={pdfVersion}
                                        isDirty={state.isDirty}
                                        isSaving={save.isSaving}
                                        onSaveDraft={onSaveDraft}
                                    />
                                </TabPanel>
                            </ScrollView>
                            <InvoiceActionBar
                                isSaving={save.isSaving}
                                canDeleteDraft={canDeleteDraft}
                                isPhone={isPhone}
                                onCancel={cancel}
                                onSaveDraft={onSaveDraft}
                                onPost={onPost}
                                onPostAndNew={onPostAndNew}
                                onDeleteDraft={deletion.open}
                                moreItems={moreItems}
                                scopeOwner={shortcuts.scopeOwner}
                            />
                            <DiscardDialog
                                isVisible={isDiscardOpen}
                                onDiscard={discard}
                                onKeepEditing={keepEditing}
                                title="Discard changes?"
                            />
                            <DeleteDraftDialog
                                isVisible={deletion.isOpen}
                                onConfirm={deletion.confirm}
                                onCancel={deletion.cancel}
                                isPending={deletion.isPending}
                                errorMessage={deletion.errorMessage}
                            />
                        </View>
                    </FormProvider>
                </EntryLeaveContext.Provider>
            </ScopeProvider>
        </InvoiceFormContext.Provider>
    )
}
