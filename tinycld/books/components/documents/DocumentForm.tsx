import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { errorToString } from '@tinycld/core/lib/errors'
import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import { useMutation } from '@tinycld/core/lib/mutations'
import { formatHint, ScopeProvider } from '@tinycld/core/lib/shortcuts'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { FormRenderer, NARROW_BELOW } from '@tinycld/core/ui/forms'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { FormProvider, type UseFormReturn, useFormState, useWatch } from 'react-hook-form'
import { ScrollView, Text, View } from 'react-native'
import { SELF_HINTED_FIELDS } from '../../forms/document-fields'
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
    type FooterSpan,
    type FooterSpans,
    footerSpansOf,
} from '../../lib/document-footer-layout'
import { canDeleteStatus, type DocumentStatus } from '../../lib/document-lifecycle'
import { bigFigureText } from '../../lib/document-messages'
import type { DocumentTab } from '../../lib/document-routes'
import { documentTaxOf, lineAmountViews, shownDocumentTotals } from '../../lib/document-tax'
import { lineTableRows } from '../../lib/document-values'
import { TOO_LARGE_TEXT } from '../../lib/entry-lines'
import { formatMoney } from '../../lib/money'
import { todayIso } from '../../lib/register-range'
import { rootErrorOnly } from '../../lib/root-errors'
import {
    DOCUMENT_PARTIES,
    type DocumentFeatures,
    type DocumentLineTable,
    type SalesDocumentKind,
} from '../../lib/sales-document-kinds'
import { useDocumentSaveStore } from '../../stores/document-save-store'
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
import type { DocumentKind } from './document-kinds'

type EngineForm = UseFormReturn<Record<string, unknown>>

type DefinitionFields = FormDefinition['fields']

// One line table's part of the lines: the table built-in and the custom fields an admin
// put after it, up to the next table.
type LineTablePart = { table: DocumentLineTable; definition: FormDefinition }

// A field whose host component draws its hint (SELF_HINTED_FIELDS) loses the definition's
// description, so core's cell does not draw the hint a second time.
function withoutDrawnHint(field: DefinitionFields[number]) {
    if (!SELF_HINTED_FIELDS.has(field.key)) return field
    return { ...field, description: undefined }
}

// The definition around the line tables: the header band (every field before the first
// line table, an admin's custom fields included; split in two rows at the kind's
// `bandSplitAt` when it names a band field), the lines (every field from the first line
// table through the last, custom fields between them included, split per table), and
// the footer (Message and Memo, with the totals: DocumentFooter). Each renderer validates
// nothing itself: the core hooks build the whole definition's schema at save.
function splitDefinition(
    definition: FormDefinition,
    bandSplitAt: string | null,
    lineTables: readonly DocumentLineTable[]
) {
    const part = (fields: DefinitionFields): FormDefinition => {
        const pages = new Set(fields.map(field => field.page))
        return { ...definition, fields, pages: definition.pages.filter(p => pages.has(p.key)) }
    }
    const fields = definition.fields.map(withoutDrawnHint)
    const tableAt = lineTables
        .map(table => ({ table, at: fields.findIndex(field => field.key === table.key) }))
        .filter(entry => entry.at >= 0)
        .sort((a, b) => a.at - b.at)
    const first = tableAt[0]?.at ?? -1
    const last = tableAt[tableAt.length - 1]?.at ?? -1
    const bandFields = first < 0 ? fields : fields.slice(0, first)
    const splitAt = bandSplitAt ? bandFields.findIndex(field => field.key === bandSplitAt) : -1
    const band = splitAt < 0 ? bandFields : bandFields.slice(0, splitAt)
    const bandSecond = splitAt < 0 ? [] : bandFields.slice(splitAt)
    const tables: LineTablePart[] = tableAt.map(({ table, at }, index) => {
        const end = index + 1 < tableAt.length ? tableAt[index + 1].at : last + 1
        return { table, definition: part(fields.slice(at, end)) }
    })
    const footer = first < 0 ? [] : fields.slice(last + 1)
    return { band: part(band), bandSecond: part(bandSecond), tables, footer: part(footer) }
}

// The footer's fields the kind draws: no Message without the message feature.
function footerOf(footer: FormDefinition, features: DocumentFeatures): FormDefinition {
    if (features.message) return footer
    return { ...footer, fields: footer.fields.filter(field => field.key !== 'message') }
}

/**
 * The party the form names now (DOCUMENT_PARTIES: a sales kind's customer): the stored
 * one, then each pick. Read through the kind's data source (`useParty`), one live query of
 * its own, so every header field and line cell reads the same row; while it loads the
 * party fields show their loading text, and a failed read shows their error with Retry.
 */
function useFormParty(form: EngineForm, documentKind: DocumentKind) {
    const field = DOCUMENT_PARTIES[documentKind.doc.party].field
    const watched = useWatch({ control: form.control, name: field })
    const id = typeof watched === 'string' ? watched : ''
    const read = documentKind.data.useParty(id)
    return { party: read.data, isLoading: read.isLoading, isError: read.isError, retry: read.retry }
}

function moneyOrTooLarge(cents: number, isTooLarge: boolean, currency: string) {
    return isTooLarge ? TOO_LARGE_TEXT : formatMoney(cents, currency)
}

// Every line table's rows, keyed by the table's key. One watch of all the tables, so a
// change to any of them recomputes the totals once.
function useWatchedTables(form: EngineForm, tables: readonly DocumentLineTable[]) {
    const names = useMemo(() => tables.map(table => table.key), [tables])
    const watched = useWatch({ control: form.control, name: names })
    return Object.fromEntries(names.map((name, index) => [name, watched[index]]))
}

// The live totals, the big figure and each line's Amount cell, from every line table and
// the chosen tax: one pass per change for the whole form. A kind with more than one table
// shows each table's subtotal (only a table with a line whose amount is not 0) in place
// of one Subtotal; a kind without sales tax has no tax line.
function useDocumentTotals(form: EngineForm, scope: DocumentFormScope) {
    const { kind } = scope
    const values = useWatchedTables(form, kind.lineTables)
    const taxRate = useWatch({ control: form.control, name: 'tax_rate' })
    const { tax, label } = documentTaxOf(scope.taxRows, typeof taxRate === 'string' ? taxRate : '')
    const amounts = Object.fromEntries(
        kind.lineTables.map(table => [
            table.key,
            lineAmountViews(lineTableRows(values, table.key), scope.currency),
        ])
    )
    const totals = shownDocumentTotals(values, tax, scope.currency, kind.lineTables)
    const figure = bigFigureText(totals, scope.currency)
    const none = '—'
    const tooLarge = totals?.isTooLarge ?? false
    const taxAmount = totals ? moneyOrTooLarge(totals.taxTotal, tooLarge, scope.currency) : none
    const hasOneTable = kind.lineTables.length <= 1
    const subtotal = totals?.subtotal ?? null
    const subtotalText =
        subtotal === null ? none : moneyOrTooLarge(subtotal, tooLarge, scope.currency)
    const taxLine = kind.features.tax && label !== null ? { label, amount: taxAmount } : null
    const view: DocumentTotalsView = {
        subtotal: hasOneTable ? subtotalText : null,
        tableSubtotals: totals?.tableSubtotals ?? [],
        tax: taxLine,
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
// switches below NARROW_BELOW. The lines renderers are the only children of the measured
// view and take its full width, so they all read the same width.
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

// The section heading above a line table that has one.
function LineTableHeading({ part, testID }: { part: LineTablePart; testID: string }) {
    const { heading } = part.table
    if (heading === null) return null
    return (
        <Text testID={testID} className="text-sm font-semibold text-foreground">
            {heading}
        </Text>
    )
}

// No field has the line-count error's key, so a change to the lines never revalidates it
// (as an invoice's `lines` error is): it is cleared when a line table's value changes,
// the user adding or filling a line, until the next Post checks the lines again. A
// subscription to the form's value events (as useAccountForm's root error), not a sync of
// state.
function useClearLineCountError(form: EngineForm, errorKey: string, tableKeys: string[]) {
    const tableKey = tableKeys.join(',')
    useEffect(() => {
        const names = tableKey.split(',')
        return form.subscribe({
            name: names,
            formState: { values: true },
            callback: () => {
                if (form.getFieldState(errorKey).error) form.clearErrors(errorKey)
            },
        })
    }, [form, errorKey, tableKey])
}

// Post's line-count error, under the first shown table of a form with several tables
// (DocumentFormState.lineCountError). Read through useFormState, so a submit that files or
// clears it re-renders this line only.
function LineCountError({
    form,
    errorKey,
    tableKeys,
    testID,
}: {
    form: EngineForm
    errorKey: string
    tableKeys: string[]
    testID: string
}) {
    useClearLineCountError(form, errorKey, tableKeys)
    const { errors } = useFormState({ control: form.control, name: errorKey })
    const message = errors[errorKey]?.message
    if (typeof message !== 'string' || message === '') return null
    return (
        <Text testID={testID} accessibilityRole="alert" className="text-xs text-destructive">
            {message}
        </Text>
    )
}

function SectionLineCountError({ state, part }: { state: DocumentFormState; part: LineTablePart }) {
    const rule = state.lineCountError
    if (!rule || rule.tableKey !== part.table.key) return null
    const testID = `${state.kind.testId}-line-error`
    const tableKeys = state.kind.lineTables.map(table => table.key)
    return (
        <LineCountError
            form={state.form as EngineForm}
            errorKey={rule.errorKey}
            tableKeys={tableKeys}
            testID={testID}
        />
    )
}

// One line table of a kind with more than one, in its own wrapper
// (`<test id>-<table key>`, underscores as dashes) under its heading. A table the form
// does not show (hidden in the definition) draws nothing, heading included.
function LineTableSection({ state, part }: { state: DocumentFormState; part: LineTablePart }) {
    const tableField = part.definition.fields.find(field => field.key === part.table.key)
    if (tableField?.hidden) return null
    const base = `${state.kind.testId}-${part.table.key.replace(/_/g, '-')}`
    const ids = { section: base, heading: `${base}-heading`, form: `${base}-form` }
    return (
        <View testID={ids.section} className="gap-2">
            <LineTableHeading part={part} testID={ids.heading} />
            <PartRenderer state={state} definition={part.definition} testID={ids.form} />
            <SectionLineCountError state={state} part={part} />
        </View>
    )
}

/**
 * The lines: a kind with one line table draws it as the one renderer of the lines (the
 * sales kinds, `<test id>-lines-form`); a kind with more draws each table in its own
 * section, in form order.
 */
function DocumentLines({ state, tables }: { state: DocumentFormState; tables: LineTablePart[] }) {
    if (tables.length === 1) {
        const testID = `${state.kind.testId}-lines-form`
        return <PartRenderer state={state} definition={tables[0].definition} testID={testID} />
    }
    const sections = tables.map(part => (
        <LineTableSection key={part.table.key} state={state} part={part} />
    ))
    return <View className="gap-6">{sections}</View>
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
    const spans = footerSpansOfKind(state.document)
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
            <View style={spans.left}>
                <View style={NOTES_SPAN_END}>{renderer}</View>
            </View>
            <View style={spans.totals}>
                <View style={TOTALS_REACH_LEFT}>
                    <DocumentTotalsPanel totals={totals} />
                </View>
            </View>
            <FooterRightSpan span={spans.right} />
            <View style={DOCUMENT_FOOTER_MENU_SPACER} />
        </View>
    )
}

// The footer's spans on the grid of the kind's last line table (the sales lines; a bill's
// product table, whose Amount slot has the account table's size and place).
function footerSpansOfKind(documentKind: DocumentKind): FooterSpans {
    const tables = documentKind.doc.lineTables
    const last = tables[tables.length - 1]
    const spec = last ? documentKind.lineSpecs[last.key] : undefined
    if (!spec) return DOCUMENT_FOOTER_SPANS
    return footerSpansOf(spec.columns, spec.rowKinds)
}

// The slots after Amount (the sales lines' Taxable). A grid with none draws no span, so
// the row has no extra gap before the menu box and the totals end where Amount ends.
function FooterRightSpan({ span }: { span: FooterSpan }) {
    if (span.flexGrow === 0) return null
    return <View style={span} />
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

// The delete confirm's words: a posting kind's draft defaults, or its own title and body
// when it names them (a bill: "Delete this draft bill?"), keeping the draft dialog's action
// and ids; or a quote kind's own (kind.messages: "Delete estimate 1001?", its body and its
// action).
function deleteDialogTexts(kind: SalesDocumentKind, number: string) {
    const { deleteTitle, deleteBody, deleteAction } = kind.messages
    if (kind.lifecycle === 'posting') {
        if (!deleteTitle || !deleteBody) return {}
        return { title: deleteTitle, body: deleteBody }
    }
    if (!deleteTitle || !deleteBody || !deleteAction) return {}
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
}

/**
 * A sales document form, new, draft, correction or copy: the header band, the lines
 * table, the footer (DocumentFooter: Message, Memo and the totals), and the sticky bar of
 * the kind's lifecycle (DocumentActionBar, or a quote's DocumentSaveBar); or, on the PDF
 * view tab, the saved document's PDF above the same bar. Keyed on its
 * form key by the screen, so a new route mounts a fresh form; a tab change keeps it.
 */
export function DocumentForm({ data, tab }: DocumentFormProps) {
    const documentKind = useDocumentKind()
    const { doc: kind } = documentKind
    const state = useDocumentForm(documentKind, {
        record: data.record,
        lines: data.lines,
        party: data.party,
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
    })
    const writes = documentKind.data.useWrites()
    const formParty = useFormParty(form, documentKind)
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
            party: formParty.party,
            isPartyLoading: formParty.isLoading,
            partyLoadFailed: formParty.isError,
            retryParty: formParty.retry,
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
            formParty.party,
            formParty.isLoading,
            formParty.isError,
            formParty.retry,
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
        () =>
            state.definition
                ? splitDefinition(state.definition, kind.bandSplitAt, kind.lineTables)
                : null,
        [state.definition, kind.bandSplitAt, kind.lineTables]
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
    // Download PDF only on a kind with a PDF.
    const moreItems = kind.features.pdf ? [pdf.item] : []
    const footer = footerOf(parts.footer, kind.features)
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
        lines: `${kind.testId}-lines`,
    }

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
                                <TabPanel isVisible={isEditTab}>
                                    <DocumentBand
                                        state={state}
                                        first={parts.band}
                                        second={parts.bandSecond}
                                    />
                                    <View testID={ids.lines} onLayout={linesLayout.onLayout}>
                                        <DocumentLinesContext.Provider value={linesView}>
                                            <DocumentLines state={state} tables={parts.tables} />
                                        </DocumentLinesContext.Provider>
                                    </View>
                                    <DocumentFooter
                                        state={state}
                                        definition={footer}
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
