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
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { FormRenderer, NARROW_BELOW } from '@tinycld/core/ui/forms'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { useFocusEffect } from 'expo-router'
import { useCallback, useId, useMemo, useState } from 'react'
import { FormProvider, type UseFormReturn, useWatch } from 'react-hook-form'
import { ScrollView, Text, View } from 'react-native'
import { type DocumentWrites, estimateNumberOf, expiredOnOf } from '../../hooks/document-data'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { type DocumentFormState, useDocumentForm } from '../../hooks/useDocumentForm'
import { useDocumentSave } from '../../hooks/useDocumentSave'
import type { DocumentScreenData } from '../../hooks/useDocumentScreen'
import { useDocumentShortcuts } from '../../hooks/useDocumentShortcuts'
import { usePdfDownload } from '../../hooks/usePdfDownload'
import { DOCUMENT_PDF_KEY } from '../../lib/document-actions'
import {
    DOCUMENT_FOOTER_MENU_SPACER,
    DOCUMENT_FOOTER_ROW,
    DOCUMENT_FOOTER_SPANS,
} from '../../lib/document-footer-layout'
import { canDeleteStatus, type DocumentStatus } from '../../lib/document-lifecycle'
import { bigFigureText } from '../../lib/document-messages'
import type { DocumentTab } from '../../lib/document-routes'
import { documentTaxOf, lineAmountViews, shownDocumentTotals } from '../../lib/document-tax'
import { TOO_LARGE_TEXT } from '../../lib/entry-lines'
import { formatMoney } from '../../lib/money'
import { todayIso } from '../../lib/register-range'
import { documentConflictText } from '../../lib/revision'
import { rootErrorOnly } from '../../lib/root-errors'
import type { SalesDocumentKind } from '../../lib/sales-document-kinds'
import { useDocumentSaveStore } from '../../stores/document-save-store'
import { ConflictNotice } from '../ConflictNotice'
import { DeleteDraftDialog } from '../entries/DeleteDraftDialog'
import { DiscardDialog } from '../entries/DiscardDialog'
import { EntryBackLink } from '../entries/EntryHeader'
import { EntryLeaveContext } from '../entries/EntryLeaveContext'
import {
    DocumentActionBar,
    type DocumentActionBarProps,
    type DocumentMoreItem,
} from './DocumentActionBar'
import { DocumentHeader } from './DocumentHeader'
import { DocumentLoading } from './DocumentLoading'
import { DocumentPdfView } from './DocumentPdfView'
import { DocumentSaveBar, type DocumentSaveBarProps } from './DocumentSaveBar'
import { DocumentTabs, openDocumentTab, TabPanel } from './DocumentTabs'
import { DocumentTotalsPanel, type DocumentTotalsView } from './DocumentTotalsPanel'
import {
    DocumentFormContext,
    type DocumentFormScope,
    DocumentLinesContext,
    type DocumentLinesView,
} from './document-form-context'
import { useDocumentKind } from './document-kind-context'

type EngineForm = UseFormReturn<Record<string, unknown>>

// The definition around the lines table: the header band (every field before `lines`,
// an admin's custom fields included; split in two rows at the kind's `bandSplitAt` when
// it names a band field), the table, and the footer (Message and Memo, with the totals:
// DocumentFooter). Each renderer validates nothing itself: the core hooks build the
// whole definition's schema at save.
function splitDefinition(definition: FormDefinition, bandSplitAt: string | null) {
    const part = (fields: FormDefinition['fields']): FormDefinition => {
        const pages = new Set(fields.map(field => field.page))
        return { ...definition, fields, pages: definition.pages.filter(p => pages.has(p.key)) }
    }
    const at = definition.fields.findIndex(field => field.key === 'lines')
    const bandFields = at < 0 ? definition.fields : definition.fields.slice(0, at)
    const splitAt = bandSplitAt ? bandFields.findIndex(field => field.key === bandSplitAt) : -1
    const band = splitAt < 0 ? bandFields : bandFields.slice(0, splitAt)
    const bandSecond = splitAt < 0 ? [] : bandFields.slice(splitAt)
    if (at < 0) {
        return { band: part(band), bandSecond: part(bandSecond), lines: part([]), footer: part([]) }
    }
    return {
        band: part(band),
        bandSecond: part(bandSecond),
        lines: part(definition.fields.slice(at, at + 1)),
        footer: part(definition.fields.slice(at + 1)),
    }
}

// The customer the form names now: the stored one, then each pick. One live query, so
// every header field and line cell reads the same row.
function useFormCustomer(form: EngineForm, logContext: string) {
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
        queryKey: ['books.document.form-customer', id],
    })
    const retry = () => {
        if (!query.collection) return
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [customersCollection],
            onError: err => log.error(logContext, err),
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

// The live totals, the big figure and each line's Amount cell, from the lines and the
// chosen tax: one pass per change for the whole form.
function useDocumentTotals(form: EngineForm, scope: DocumentFormScope) {
    const watched = useWatch({ control: form.control, name: 'lines' })
    const taxRate = useWatch({ control: form.control, name: 'tax_rate' })
    const { tax, label } = documentTaxOf(scope.taxRows, typeof taxRate === 'string' ? taxRate : '')
    const lines = (Array.isArray(watched) ? watched : []) as TableRow[]
    const amounts = lineAmountViews(lines, scope.currency)
    const totals = shownDocumentTotals({ lines }, tax, scope.currency)
    const figure = bigFigureText(totals, scope.currency)
    const none = '—'
    const tooLarge = totals?.isTooLarge ?? false
    const taxAmount = totals ? moneyOrTooLarge(totals.taxTotal, tooLarge, scope.currency) : none
    const view: DocumentTotalsView = {
        subtotal: totals ? moneyOrTooLarge(totals.subtotal, tooLarge, scope.currency) : none,
        tax: label === null ? null : { label, amount: taxAmount },
        total: figure,
        last: figure,
    }
    return { view, figure, amounts }
}

// Delete draft: the dialog is local UI no other component needs. The delete removes the
// row from the store at once, so the screen holds the form (and this dialog) before it
// starts: a refusal stays in the dialog, with the user's edits behind it, until the next
// attempt. A success leaves; the hold ends when the screen goes (useScreenHoldRelease).
function useDocumentDelete(
    writes: DocumentWrites,
    documentId: string | undefined,
    leave: () => void
) {
    const hold = useDocumentSaveStore(s => s.hold)
    const release = useDocumentSaveStore(s => s.release)
    const [isOpen, setOpen] = useState(false)
    const remove = useMutation({
        mutationFn: function* (id: string) {
            yield writes.deleteRecord(id)
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
        if (!documentId) return
        hold(documentId)
        remove.mutate(documentId)
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

// A hold of this document (a delete that succeeded) ends when the user leaves the screen.
function useScreenHoldRelease(documentId: string | undefined) {
    const release = useDocumentSaveStore(s => s.release)
    useFocusEffect(
        useCallback(
            () => () => {
                if (documentId) release(documentId)
            },
            [documentId, release]
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
    state: DocumentFormState
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

const BAND_CLASS = 'rounded-xl border border-border bg-surface-secondary p-4'

interface BandProps {
    state: DocumentFormState
    first: FormDefinition
    second: FormDefinition
}

// The header band; a kind that splits it draws the fields from `bandSplitAt` on as a
// second row inside it (`<test id>-payment`).
function DocumentBand({ state, first, second }: BandProps) {
    const { testId } = state.kind
    const ids = { band: `${testId}-band`, form: `${testId}-band-form` }
    return (
        <View testID={ids.band} className={BAND_CLASS}>
            <PartRenderer state={state} definition={first} testID={ids.form} />
            <BandSecondRow state={state} definition={second} />
        </View>
    )
}

function BandSecondRow({ state, definition }: Omit<RendererProps, 'testID'>) {
    if (definition.fields.length === 0) return null
    const { testId } = state.kind
    const ids = { row: `${testId}-payment`, form: `${testId}-payment-form` }
    return (
        <View testID={ids.row} className="mt-4 border-t border-border pt-4">
            <PartRenderer state={state} definition={definition} testID={ids.form} />
        </View>
    )
}

interface FooterProps {
    state: DocumentFormState
    definition: FormDefinition
    totals: DocumentTotalsView
    /** The lines draw as cards (or the screen is a phone): no Amount column to sit under. */
    isStacked: boolean
}

// How far the wide totals reach left of the Qty slot, px, with the notes kept as far
// back: at the narrowest floors the Qty to Amount slots leave a label about 157 px, less
// than a tax label such as "Denver combined (8.71%)" needs on one line.
const TOTALS_REACH = 40
const NOTES_SPAN_END = { paddingRight: TOTALS_REACH }
const TOTALS_REACH_LEFT = { marginLeft: -TOTALS_REACH }

/**
 * Message and Memo beside the totals. On the wide grid the totals sit on the grid's
 * slots (lib/document-footer-layout.ts), so they end under Amount; their labels reach
 * TOTALS_REACH further left, into room the notes leave free. When the lines draw as cards
 * there is no Amount column, so the footer stacks full width: the totals right under the
 * lines, then Message, then Memo.
 */
function DocumentFooter({ state, definition, totals, isStacked }: FooterProps) {
    const { testId } = state.kind
    const ids = { footer: `${testId}-footer`, form: `${testId}-footer-form` }
    const renderer = <PartRenderer state={state} definition={definition} testID={ids.form} />
    if (isStacked) {
        return (
            <View testID={ids.footer} className="gap-4">
                <DocumentTotalsPanel totals={totals} />
                {renderer}
            </View>
        )
    }
    return (
        <View testID={ids.footer} style={DOCUMENT_FOOTER_ROW}>
            <View style={DOCUMENT_FOOTER_SPANS.left}>
                <View style={NOTES_SPAN_END}>{renderer}</View>
            </View>
            <View style={DOCUMENT_FOOTER_SPANS.totals}>
                <View style={TOTALS_REACH_LEFT}>
                    <DocumentTotalsPanel totals={totals} />
                </View>
            </View>
            <View style={DOCUMENT_FOOTER_SPANS.right} />
            <View style={DOCUMENT_FOOTER_MENU_SPACER} />
        </View>
    )
}

// A quote: its new title until the first save, then "Estimate 1001" by the
// stored number. A posting kind: "Edit 1004" for a correction, new or saved; the kind's
// draft title once the draft is stored; else its new title.
export function documentFormTitle(
    kind: SalesDocumentKind,
    replacesNumber: string,
    isStored: boolean,
    number: string
): string {
    if (kind.lifecycle === 'quote') return isStored ? `${kind.noun} ${number}` : kind.newTitle
    if (replacesNumber) return `Edit ${replacesNumber}`
    return isStored ? kind.draftTitle : kind.newTitle
}

// A correction says what posting it does to the document it replaces.
function ReplaceNote({ kind, number }: { kind: SalesDocumentKind; number: string }) {
    if (!number) return null
    const noun = kind.noun.toLowerCase()
    const text = `Posting this replaces ${noun} ${number} under the same number. The original is voided. Until you post, ${number} stays as it is.`
    const testID = `${kind.testId}-replace-note`
    return (
        <Text testID={testID} className="text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

function ErrorSummary({ form, testID }: { form: EngineForm; testID: string }) {
    const message = form.formState.errors.root?.server?.message
    const errors = rootErrorOnly({ root: { message } })
    return (
        <FormErrorSummary
            errors={errors}
            isEnabled={message !== undefined}
            variant="destructive"
            title={null}
            showFieldNames={false}
            testID={testID}
        />
    )
}

// The bar by the kind's lifecycle: a posting kind's Save draft / Post bar, or a quote's
// Save bar.
function PostingActionBar({
    isVisible,
    ...props
}: DocumentActionBarProps & { isVisible: boolean }) {
    if (!isVisible) return null
    return <DocumentActionBar {...props} />
}

function QuoteSaveBar({ isVisible, ...props }: DocumentSaveBarProps & { isVisible: boolean }) {
    if (!isVisible) return null
    return <DocumentSaveBar {...props} />
}

const PDF_HINT = formatHint(DOCUMENT_PDF_KEY).text

// The estimate a stored invoice was made from; '' for any other record.
function estimateIdOf(record: DocumentScreenData['record']): string {
    const fields = record?.kindFields
    return fields?.kind === 'invoice' ? fields.estimate : ''
}

// A posting kind deletes its stored draft (the route's, or the one a refused post
// wrote); a quote deletes a saved record its lifecycle allows (not a closed estimate).
function canDeleteOf(
    kind: SalesDocumentKind,
    isNew: boolean,
    status: DocumentStatus | undefined,
    writtenId: string | null
): boolean {
    if (kind.lifecycle === 'posting') return (!isNew && status === 'draft') || writtenId !== null
    return !isNew && status !== undefined && canDeleteStatus(kind.lifecycle, status)
}

// Convert to invoice: a quote, while writes are available, on a Pending or Accepted
// status in the form (a change to Rejected hides it before the save).
function canConvertOf(kind: SalesDocumentKind, canWrite: boolean, status: unknown): boolean {
    if (kind.lifecycle !== 'quote' || !canWrite) return false
    return status === 'pending' || status === 'accepted'
}

// The delete confirm's words: a posting kind's draft defaults, or a quote kind's own
// (kind.messages: "Delete estimate 1001?", its body and its action).
function deleteDialogTexts(kind: SalesDocumentKind, number: string) {
    const { deleteTitle, deleteBody, deleteAction } = kind.messages
    if (kind.lifecycle === 'posting' || !deleteTitle || !deleteBody || !deleteAction) return {}
    return {
        title: deleteTitle.replace('%s', number),
        body: deleteBody,
        actionLabel: deleteAction,
        testIdPrefix: `${kind.testId}-delete`,
    }
}

// Download PDF of the saved draft, from the More row and ⌘P. A new form has nothing
// printed yet; while a save runs the More menu is disabled, and so is the key.
function useDraftPdf(kind: SalesDocumentKind, draftId: string | undefined, isSaving: boolean) {
    const download = usePdfDownload()
    const canDownload = draftId !== undefined && !isSaving && !download.isPending
    const run = () => {
        if (draftId === undefined) return
        download.mutate({ kind: kind.key, id: draftId, fallbackName: kind.pdfStem('') })
    }
    const item: DocumentMoreItem = {
        id: 'download-pdf',
        label: 'Download PDF',
        keys: PDF_HINT,
        isDisabled: !canDownload,
        onSelect: run,
    }
    return { canDownload, run, item }
}

interface DocumentFormProps {
    data: DocumentScreenData
    tab: DocumentTab
    // Reads the stored document again and mounts a new form on it (DocumentScreen); it
    // rejects when the read fails.
    onReload: () => Promise<void>
}

/**
 * A sales document form, new, draft, correction or copy: the header band, the lines
 * table, the footer (DocumentFooter: Message, Memo and the totals), and the sticky bar of
 * the kind's lifecycle (DocumentActionBar, or a quote's DocumentSaveBar); or, on the PDF
 * view tab, the saved document's PDF above the same bar. Keyed on its
 * form key by the screen, so a new route mounts a fresh form; a tab change keeps it.
 */
export function DocumentForm({ data, tab, onReload }: DocumentFormProps) {
    const documentKind = useDocumentKind()
    const { doc: kind } = documentKind
    const state = useDocumentForm(documentKind, {
        record: data.record,
        lines: data.lines,
        customer: data.customer,
        currency: data.currency,
        taxRows: data.taxOptions.rows,
        startValues: data.startValues,
        start: data.start,
        deposit: data.deposit,
        defaultMessage: data.defaultMessage,
    })
    const form = state.form as EngineForm
    // A save from the PDF tab that ends with a field error shows the form, where the
    // error is.
    const revealErrors = () => {
        if (tab === 'pdf') openDocumentTab('edit')
    }
    const estimateId = state.estimate || estimateIdOf(data.record)
    const { onBack: leave } = useBackToEntries(estimateId)
    const save = useDocumentSave(state, {
        tab,
        onFieldErrors: revealErrors,
        leave,
        writer: data.writer,
        onReload,
    })
    const writes = documentKind.data.useWrites()
    const formCustomer = useFormCustomer(form, `books.${kind.key}`)
    const expiredOn = expiredOnOf(data.record, todayIso())
    const estimateNumber = estimateNumberOf(data.record, data.estimateSource)
    // Per mounted form: the band's address inputs belong to this form only, so a form
    // opened later starts with them folded.
    const instanceId = useId()
    const bandKey = `${data.formKey}#${instanceId}`
    const scope = useMemo<DocumentFormScope>(
        () => ({
            kind,
            bandKey,
            currency: data.currency,
            customer: formCustomer.customer,
            isCustomerLoading: formCustomer.isLoading,
            customerLoadFailed: formCustomer.isError,
            retryCustomer: formCustomer.retry,
            taxRows: data.taxOptions.rows,
            expiredOn,
            estimateNumber,
            estimateId,
        }),
        [
            kind,
            bandKey,
            data.currency,
            data.taxOptions.rows,
            formCustomer,
            expiredOn,
            estimateNumber,
            estimateId,
        ]
    )
    const totals = useDocumentTotals(form, scope)
    const linesLayout = useLinesAreCards()
    const linesView = useMemo<DocumentLinesView>(
        () => ({ amounts: totals.amounts, isCards: linesLayout.isCards }),
        [totals.amounts, linesLayout.isCards]
    )
    const [isDiscardOpen, setDiscardOpen] = useState(false)
    // The stored draft: the route's own, or the one a new form wrote before its post was
    // refused.
    const draftId = state.recordId ?? save.writtenId ?? undefined
    const deletion = useDocumentDelete(writes, draftId, leave)
    useScreenHoldRelease(draftId)
    const canDelete = canDeleteOf(kind, state.isNew, data.record?.status, save.writtenId)
    const convertStatus = useWatch({ control: form.control, name: 'status' })
    const canConvert = canConvertOf(kind, data.canWrite, convertStatus)
    const isPhone = useBreakpoint() === 'mobile'
    const onPostAndNew = () => {
        void save.post(true)
    }
    const onSave = () => {
        void save.save()
    }
    const onSaveAndNew = () => {
        void save.saveAndNew()
    }
    const onConvert = () => {
        void save.convert()
    }
    const isBusy = save.isSaving || deletion.isPending
    const pdf = useDraftPdf(kind, draftId, isBusy)
    const pdfVersion = documentKind.data.useVersion(draftId)
    const shortcuts = useDocumentShortcuts({
        kind,
        isSaving: isBusy,
        canDelete,
        deleteRecord: deletion.open,
        isPhone,
        postAndNew: onPostAndNew,
        save: onSave,
        saveAndNew: onSaveAndNew,
        canConvert,
        convert: onConvert,
        canDownloadPdf: pdf.canDownload,
        downloadPdf: pdf.run,
    })
    const parts = useMemo(
        () => (state.definition ? splitDefinition(state.definition, kind.bandSplitAt) : null),
        [state.definition, kind.bandSplitAt]
    )

    if (!state.isReady || !parts) return <DocumentLoading />

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
    const onSaveAndClose = () => {
        void save.saveAndClose()
    }
    const isQuote = kind.lifecycle === 'quote'
    // The PDF tab's save of a new form: the bar's Save draft, or a quote's Save.
    const onPdfSave = isQuote ? onSave : onSaveDraft
    const moreItems = [pdf.item]
    const pdfDocumentId = draftId ?? null
    // A quote is titled by its stored number, so it reads as stored only once its row is
    // here (a written id alone has no number yet); a posting draft is stored once written.
    const isStored = isQuote ? data.record !== undefined : draftId !== undefined
    const title = documentFormTitle(kind, data.replacesNumber, isStored, data.record?.number ?? '')
    // A posting form shows only drafts: a post's optimistic status shows here only once
    // the read view replaces the form. A quote's badges follow its saved row (a new one is
    // Pending), never the unsaved Status.
    const status = isQuote ? (data.record?.status ?? 'pending') : 'draft'
    const isExpired = expiredOn !== null
    const isEditTab = tab === 'edit'
    const isPdfTab = tab === 'pdf'
    const isFooterStacked = isPhone || linesLayout.isCards
    const convertAction = isQuote ? { isOffered: canConvert, onPress: onConvert } : null
    const removeAction = isQuote ? { isOffered: canDelete, onPress: deletion.open } : null
    const deleteTexts = deleteDialogTexts(kind, data.record?.number ?? '')
    const ids = {
        form: `${kind.testId}-form`,
        errorSummary: `${kind.testId}-error-summary`,
        conflict: `${kind.testId}-conflict`,
        lines: `${kind.testId}-lines`,
        linesForm: `${kind.testId}-lines-form`,
    }
    const conflictText = documentConflictText(kind.noun, kind.lifecycle)
    const conflictAction = `Load the current ${kind.noun.toLowerCase()}`

    return (
        <DocumentFormContext.Provider value={scope}>
            <ScopeProvider owner={shortcuts.scopeOwner}>
                <EntryLeaveContext.Provider value={cancel}>
                    <FormProvider {...form}>
                        <View
                            ref={save.surfaceRef}
                            testID={ids.form}
                            className="flex-1 bg-background"
                        >
                            <ScrollView
                                className="flex-1"
                                contentContainerClassName="gap-4 px-4 pt-2 pb-6"
                                keyboardShouldPersistTaps="handled"
                            >
                                <EntryBackLink />
                                <DocumentHeader
                                    title={title}
                                    status={status}
                                    figure={totals.figure}
                                    isExpired={isExpired}
                                />
                                <ReplaceNote kind={kind} number={data.replacesNumber} />
                                <DocumentTabs
                                    selected={tab}
                                    firstLabel="Edit"
                                    scopeOwner={shortcuts.scopeOwner}
                                />
                                <ErrorSummary form={form} testID={ids.errorSummary} />
                                <ConflictNotice
                                    isVisible={save.isConflict}
                                    text={conflictText}
                                    actionLabel={conflictAction}
                                    testID={ids.conflict}
                                    onReload={save.reload}
                                />
                                <TabPanel isVisible={isEditTab}>
                                    <DocumentBand
                                        state={state}
                                        first={parts.band}
                                        second={parts.bandSecond}
                                    />
                                    <View testID={ids.lines} onLayout={linesLayout.onLayout}>
                                        <DocumentLinesContext.Provider value={linesView}>
                                            <PartRenderer
                                                state={state}
                                                definition={parts.lines}
                                                testID={ids.linesForm}
                                            />
                                        </DocumentLinesContext.Provider>
                                    </View>
                                    <DocumentFooter
                                        state={state}
                                        definition={parts.footer}
                                        totals={totals.view}
                                        isStacked={isFooterStacked}
                                    />
                                </TabPanel>
                                <TabPanel isVisible={isPdfTab}>
                                    <DocumentPdfView
                                        documentId={pdfDocumentId}
                                        version={pdfVersion}
                                        isDirty={state.isDirty}
                                        isSaving={save.isSaving}
                                        onSave={onPdfSave}
                                    />
                                </TabPanel>
                            </ScrollView>
                            <PostingActionBar
                                isVisible={!isQuote}
                                isSaving={save.isSaving}
                                canDeleteDraft={canDelete}
                                isPhone={isPhone}
                                onCancel={cancel}
                                onSaveDraft={onSaveDraft}
                                onPost={onPost}
                                onPostAndNew={onPostAndNew}
                                onDeleteDraft={deletion.open}
                                moreItems={moreItems}
                                scopeOwner={shortcuts.scopeOwner}
                            />
                            <QuoteSaveBar
                                isVisible={isQuote}
                                isSaving={save.isSaving}
                                isPhone={isPhone}
                                onCancel={cancel}
                                onSave={onSave}
                                onSaveAndClose={onSaveAndClose}
                                onSaveAndNew={onSaveAndNew}
                                convert={convertAction}
                                remove={removeAction}
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
                                {...deleteTexts}
                            />
                        </View>
                    </FormProvider>
                </EntryLeaveContext.Provider>
            </ScopeProvider>
        </DocumentFormContext.Provider>
    )
}
