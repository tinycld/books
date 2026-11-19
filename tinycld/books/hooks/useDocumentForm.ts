import { useAuth } from '@tinycld/core/lib/auth'
import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import type { FormHostUi } from '@tinycld/core/lib/forms/host-ui'
import type { EvalContext } from '@tinycld/core/lib/forms/logic'
import { type FormHost, useFormHost } from '@tinycld/core/lib/forms/use-form-hosts'
import { log } from '@tinycld/core/lib/logger'
import { z } from '@tinycld/core/ui/form'
import { useFormCreate, useFormEdit, useHostUi } from '@tinycld/core/ui/forms'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { useWatch } from 'react-hook-form'
import {
    type DocumentKind,
    type DocumentStartValues,
    storedLineTableRows,
} from '../components/documents/document-kinds'
import { defaultTaxRateId } from '../lib/document-fills'
import {
    type DepositRule,
    type DocumentSaveMode,
    documentSchema,
    type PostLineRule,
} from '../lib/document-schema'
import { type HeldSourceLink, sourceLinkOf, sourceLinkRules } from '../lib/document-source-links'
import { documentTaxOf } from '../lib/document-tax'
import { acceptanceShown } from '../lib/estimate-status'
import { hideBuiltins } from '../lib/form-definition'
import { textOf } from '../lib/form-values'
import { noLinesText, purchaseTablesShown } from '../lib/purchase-lines'
import { type PayoutLimits, payoutLimitsOf, refundPayoutRule } from '../lib/refund-payout'
import { todayIso } from '../lib/register-range'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'
import { useDocumentSaveStore } from '../stores/document-save-store'
import { type DocumentStart, type PayoutMemo, recordColumnsOf } from './document-data'
import type { DocumentScreenData } from './useDocumentScreen'

// documentSchema bounds every text built-in of a sales document with the kind's own words
// ("Reference no. can be at most 40 characters"). Core's field schema reads a built-in's
// `maxLength` and would answer first, with "<Label> is too long", so the form runs on a
// copy of the host without it. The registered host keeps it: the definition checks and
// the server's refusal (keyed to the field) read it there.
function withKindSchemaBounds(host: FormHost): FormHost {
    const builtin = host.builtin.map(field => {
        if (field.maxLength === undefined) return field
        const { maxLength: _bound, ...rest } = field
        return rest
    })
    return { ...host, builtin }
}

// Books declares the host in its own manifest, so a missing host is a broken build
// (the generator did not run), not a state to render around.
function useDocumentHost(kind: SalesDocumentKind) {
    const registered = useFormHost(kind.hostKey)
    const host = useMemo(() => registered && withKindSchemaBounds(registered), [registered])
    if (!host) {
        const error = new Error(`form host ${kind.hostKey} is not registered`)
        log.error(`books.${kind.key}`, error)
        throw error
    }
    return host
}

type TaxRows = DocumentScreenData['taxOptions']['rows']

type FormInput = Pick<DocumentScreenData, 'record' | 'lines' | 'party' | 'currency'> & {
    taxRows: TaxRows
    // A new form's values when it corrects (`?replaces`) or copies (`?copy`) a document.
    startValues?: DocumentStartValues
    // What a new form starts from besides the document, as the kind's data source read it.
    start?: DocumentStart
    // How a sales receipt draws Deposit to (a refund receipt, Refund from); an invoice has
    // none.
    deposit?: DepositRule
    // A new blank form's message (defaultMessageFor); none when not given.
    defaultMessage?: string
    // The credit memo a refund form names (payoutMemoOf), read live: a payout's limits.
    payoutMemo?: PayoutMemo
}

// What the payout a correction replaces pays out (DocumentStart of a refund receipt); 0
// for every other form.
function startReplacedPayout(start: DocumentStart | undefined): number {
    return start?.kind === 'refund_receipt' ? (start.replacedPayout ?? 0) : 0
}

const DEPOSIT_TO = ['deposit_to']
const ACCEPTANCE = ['accepted_by', 'accepted_date']

// The account a shown Deposit to whose value is empty saves: the default rule's. Empty
// for an invoice, and while Deposit to is hidden (the server stamps the set account).
function depositFallbackOf(start: DocumentStart | undefined, isHidden: boolean): string {
    if (isHidden || start?.kind !== 'sales_receipt') return ''
    return start.deposit.defaultId
}

// `documentSchema` with the tax the validated values choose (their `tax_rate` through the
// tax rows), so the total rules count the header tax, and with the save mode and the
// Deposit to rule at the time it runs (Post adds its rule to the same resolver).
// `postLineRule` is Post's line-count rule by the tables the form shows; none for a kind
// with one table (documentSchema's default).
// A payout's cap and date rule (refundPayoutRule) join Post's rules, with the limits
// (`payout`) read when the schema runs, so the memo's live balance is the one checked. A
// draft is not held to them, as the server checks them only when the payout posts
// (server/refund_receipt_payout.go).
function documentRecordSchema(
    kind: SalesDocumentKind,
    currency: string,
    saveMode: RefObject<DocumentSaveMode>,
    taxRows: RefObject<TaxRows>,
    deposit: RefObject<DepositRule | undefined>,
    postLineRule: PostLineRule | undefined,
    payout: RefObject<PayoutLimits | null>
) {
    return z
        .object({})
        .passthrough()
        .superRefine((values, ctx) => {
            const taxRate = typeof values.tax_rate === 'string' ? values.tax_rate : ''
            const { tax } = documentTaxOf(taxRows.current, taxRate)
            const mode = saveMode.current
            const schema = documentSchema(kind, currency, mode, tax, deposit.current, postLineRule)
            const result = schema.safeParse(values)
            const issues = result.success ? [] : result.error.issues
            for (const issue of issues) {
                ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
            }
            if (mode === 'post') refundPayoutRule(payout.current, tax)(values, ctx)
        })
}

// The built-ins of a new form's, a correction's, a copy's or an invoice-from-estimate's
// values: `replaces`, `estimate`, a credit memo's `invoice` and a refund receipt's
// `sales_receipt` and `credit_memo` are no fields of the form (the save writes them), so
// the engine never files them among the custom fields.
function builtinValuesOf(values: DocumentStartValues): DocumentStartValues {
    const builtins: DocumentStartValues = { ...values }
    delete builtins.replaces
    delete builtins.estimate
    delete builtins.invoice
    delete builtins.sales_receipt
    delete builtins.credit_memo
    return builtins
}

// The source link this form session starts with: a new form's start values' (a document
// made from its source, or a correction of a linked one), else the stored document's; read
// at the kind's link keys only (an estimate's `invoice` is no source link).
function startLinkOf(
    documentKind: DocumentKind,
    isNew: boolean,
    startValues: DocumentStartValues | undefined,
    record: FormInput['record']
): HeldSourceLink {
    const keys = documentKind.sourceLinkKeys ?? []
    if (isNew) return sourceLinkOf(keys, startValues)
    return sourceLinkOf(keys, record ? recordColumnsOf(record) : undefined)
}

// The key Post's line-count error is filed at on a form with several line tables: no
// field has it (form keys have no dash), so no field cell draws it; the lines draw it
// under the first shown table (`<test id>-line-error`).
export const LINE_COUNT_ERROR_KEY = 'line-count'

// The line tables a form shows, decided once when it mounts. A kind whose start carries
// no Purchase lines setting shows every table it has. A purchase kind (its start carries
// `purchaseLines`) shows a table when the setting includes it or the document the form
// starts with already has a line in it (purchaseTablesShown); `rows` are the form's
// starting table rows (a new form's start values, a stored document's lines).
function shownLineTablesOf(
    kind: SalesDocumentKind,
    start: DocumentStart | undefined,
    rows: Record<string, unknown>
): readonly string[] {
    if (!start || !('purchaseLines' in start)) return kind.lineTables.map(table => table.key)
    const count = (key: string) => {
        const value = rows[key]
        return Array.isArray(value) ? value.length : 0
    }
    return purchaseTablesShown(start.purchaseLines, {
        account_lines: count('account_lines'),
        item_lines: count('item_lines'),
    })
}

// The tables a form shows plus those its form session already showed (kept across the
// new → draft route replace), in the kind's table order.
function withKeptTables(
    kind: SalesDocumentKind,
    shown: readonly string[],
    kept: readonly string[] | undefined
): readonly string[] {
    if (!kept) return shown
    return kind.lineTables
        .map(table => table.key)
        .filter(key => shown.includes(key) || kept.includes(key))
}

// A line table with a section heading (a bill's "Account details") is named by that
// heading above it (DocumentForm's LineTableHeading), so the rendered copy drops the
// table cell's own label, which would repeat it. The registered host and the stored
// definition keep the label.
function withoutHeadedTableLabels(
    definition: FormDefinition,
    kind: SalesDocumentKind
): FormDefinition {
    const headed = new Set(
        kind.lineTables.filter(table => table.heading !== null).map(table => table.key)
    )
    if (headed.size === 0) return definition
    const fields = definition.fields.map(field =>
        headed.has(field.key) ? { ...field, label: '' } : field
    )
    return { ...definition, fields }
}

// Post's line-count rule for a form with several tables, in the words of the tables it
// shows, under the first of them; none for a kind with one table.
function postLineRuleOf(
    kind: SalesDocumentKind,
    shown: readonly string[]
): PostLineRule | undefined {
    if (kind.lineTables.length <= 1) return undefined
    const tableKey = shown[0] ?? kind.lineTables[0].key
    return { message: noLinesText(shown), tableKey, errorKey: LINE_COUNT_ERROR_KEY }
}

/**
 * A sales document's engine form, new or draft, as useRecordForm builds a record's form.
 * Both core hooks run on every render (hooks cannot be conditional; a route's mode never
 * changes for its life) and the one for the mode is returned. The screen's copy of the
 * Books host UI adds `documentSchema` as the whole-record schema (documentRecordSchema).
 */
export function useDocumentForm(documentKind: DocumentKind, input: FormInput) {
    const kind = documentKind.doc
    const host = useDocumentHost(kind)
    const hostUi = useHostUi(host)
    const { user } = useAuth()
    const userId = user?.id ?? ''
    const context = useMemo<EvalContext>(() => ({ today: todayIso(), userId }), [userId])
    const saveMode = useRef<DocumentSaveMode>('draft')
    // Read when the schema runs, so a rate list that loads later is the one checked.
    const taxRowsRef = useRef(input.taxRows)
    taxRowsRef.current = input.taxRows
    const depositRef = useRef(input.deposit)
    depositRef.current = input.deposit
    // Set below, once the form's source link is known.
    const payoutRef = useRef<PayoutLimits | null>(null)
    const { currency } = input
    const isNew = input.record === undefined
    // Read once: the create form seeds from its first values (core keeps them in a ref).
    const createValues = isNew
        ? builtinValuesOf(
              input.startValues ??
                  documentKind.values.new({
                      today: context.today as string,
                      party: input.party ?? null,
                      rates: input.taxRows,
                      defaultRateId: defaultTaxRateId(input.taxRows),
                      message: input.defaultMessage ?? '',
                      start: input.start,
                  })
          )
        : {}
    const { lines, record } = input
    const tables = useMemo(() => storedLineTableRows(documentKind, lines), [documentKind, lines])
    // Decided once per form session and kept for its life: a table stays shown after its
    // last line is removed or saved away, so editing a bill never loses a table
    // mid-session. A new form's first save replaces the route with the draft's, which
    // mounts this form again: the new form kept its tables in the document save store
    // under the draft's id (useDocumentSave), and the draft's form starts from them.
    const shownRef = useRef<readonly string[] | null>(null)
    if (shownRef.current === null) {
        const kept = record ? useDocumentSaveStore.getState().shownTables[record.id] : undefined
        const fresh = shownLineTablesOf(kind, input.start, isNew ? createValues : tables)
        shownRef.current = withKeptTables(kind, fresh, kept)
    }
    const shownTables = shownRef.current
    // The draft's form session ends with its form.
    const recordId = record?.id
    useEffect(() => {
        if (!recordId) return
        return () => useDocumentSaveStore.getState().forgetShownTables(recordId)
    }, [recordId])
    const postLineRule = useMemo(() => postLineRuleOf(kind, shownTables), [kind, shownTables])
    const ui = useMemo<FormHostUi | null>(
        () =>
            hostUi
                ? {
                      ...hostUi,
                      recordSchema: documentRecordSchema(
                          kind,
                          currency,
                          saveMode,
                          taxRowsRef,
                          depositRef,
                          postLineRule,
                          payoutRef
                      ),
                  }
                : null,
        [hostUi, kind, currency, postLineRule]
    )
    // The engine reads the row as one flat record of its columns.
    const editRow = useMemo(() => (record ? recordColumnsOf(record) : { id: '' }), [record])
    const schemas = ui?.schemas
    const recordSchema = ui?.recordSchema
    const create = useFormCreate(host, undefined, context, createValues, schemas, recordSchema)
    const edit = useFormEdit(host, editRow, context, {}, tables, schemas, recordSchema)
    const chosen = isNew ? create : edit
    // With an account set in "Sales deposited to", Deposit to is not drawn. Only the
    // rendered copy hides it: core checks a definition against its host at host load and
    // save, never in FormRenderer, so a locked built-in may be hidden here. The rule is
    // read every render, so a settings change shows or hides the field at once.
    const isDepositHidden = input.deposit?.hidden === true
    // An estimate draws Accepted by and Accepted date only while Status is Accepted. Core
    // rules cannot test a custom built-in's value, so the rendered copy hides them here,
    // on the watched Status; the save clears them (useDocumentSave).
    const status = useWatch({ control: chosen.form.control, name: 'status' })
    const isAcceptanceHidden =
        kind.lifecycle === 'quote' && !acceptanceShown(typeof status === 'string' ? status : '')
    // A line table the form does not show (a bill's or an expense's, by the Purchase
    // lines setting) is hidden the same way; host line tables that may be hidden are not
    // required.
    const hiddenTables = useMemo(
        () => kind.lineTables.map(table => table.key).filter(key => !shownTables.includes(key)),
        [kind, shownTables]
    )
    const hiddenKeys = useMemo(
        () => [
            ...(isDepositHidden ? DEPOSIT_TO : []),
            ...(isAcceptanceHidden ? ACCEPTANCE : []),
            ...hiddenTables,
        ],
        [isDepositHidden, isAcceptanceHidden, hiddenTables]
    )
    const engineDefinition = chosen.definition
    const definition = useMemo(() => {
        if (!engineDefinition) return engineDefinition
        const shown =
            hiddenKeys.length > 0
                ? hideBuiltins(engineDefinition, hiddenKeys, host)
                : engineDefinition
        return withoutHeadedTableLabels(shown, kind)
    }, [engineDefinition, hiddenKeys, host, kind])
    // Read through the form state proxy, so a change re-renders the guard (useRecordForm).
    const dirtyFields = chosen.form.formState.dirtyFields
    // The source link is no field of the form: it starts as startLinkOf, and Remove link
    // (or a pick of another customer) drops it for this form session where the link allows
    // it (sourceLinkRules: a payout's cannot be removed). The key stays, so the save still
    // knows which column to clear. Local, synchronous UI state: a new session mounts a new
    // form.
    const [linkRemoved, setLinkRemoved] = useState(false)
    const startLink = startLinkOf(documentKind, isNew, input.startValues, record)
    const { key: linkKey, id: linkStart } = startLink
    const rules = sourceLinkRules(startLink)
    const linkId = linkRemoved && rules.canRemove ? '' : linkStart
    const { canRemove, locksParty } = rules
    const sourceLink = useMemo(
        () => ({
            key: linkKey,
            id: linkId,
            canRemove: canRemove && linkId !== '',
            locksParty,
            remove: () => setLinkRemoved(true),
        }),
        [linkKey, linkId, canRemove, locksParty]
    )
    // A payout's limits: the memo's live balance, plus what the original pays out on a
    // correction. Read by the schema when it runs and by the link row's label.
    const payout = payoutLimitsOf(
        sourceLink,
        input.payoutMemo,
        startReplacedPayout(input.start),
        currency
    )
    payoutRef.current = payout
    return {
        // The kind as the screen runs it (its writes, its empty columns), and its words.
        document: documentKind,
        kind,
        host,
        ui,
        context,
        isNew,
        create,
        edit,
        // The definition the screen renders; a refusal of a field it hides joins the summary.
        definition,
        form: chosen.form,
        depositFallback: depositFallbackOf(input.start, isDepositHidden),
        recordId,
        // The line tables this form session shows (a new form's first save keeps them for
        // the draft's form it lands on).
        shownTables,
        // The posted document a new correction replaces; its insert writes it.
        replaces: isNew ? textOf(input.startValues?.replaces) : '',
        // The estimate a new invoice is made from, or a new correction keeps; its insert
        // writes it. A stored invoice's is on its record and is never written again.
        estimate: isNew ? textOf(input.startValues?.estimate) : '',
        // The source link as the form holds it now (a credit memo's invoice, a refund's
        // sales receipt or credit memo): its column, its id, what it allows and its Remove.
        sourceLink,
        // A payout's limits (payoutLimitsOf); null on any other form.
        payout,
        // The link id this form session started with (startLinkOf; '' on a kind with no
        // link). The save compares the form's link with it, or with the link a new form's
        // written draft holds (useDocumentSave).
        linkStart,
        // Post's line-count error under the first shown table, on a form with several
        // tables: its table and the key it is filed at. Null for a kind with one table
        // (its table's field cell draws it).
        lineCountError: postLineRule?.errorKey
            ? { tableKey: postLineRule.tableKey, errorKey: postLineRule.errorKey }
            : null,
        // The party a new form was opened with (`?customer`, `?vendor`): Post & new keeps
        // only that one. A copy's or a correction's party comes from its source, not from
        // the route.
        openedWithParty: isNew && !input.startValues ? input.party?.id : undefined,
        // The stored document's revision as the row holds it now (0 on a new form): the
        // save takes its baseline from it.
        revision: record?.revision ?? 0,
        saveMode,
        isReady: chosen.isReady && ui !== null,
        // A field or a line differs from the form's baseline. A changed invoice link is
        // counted by the save (useDocumentSave `isDirty`), which knows what a new form's
        // written draft holds.
        isDirty: Object.keys(dirtyFields).length > 0,
    }
}

export type DocumentFormState = ReturnType<typeof useDocumentForm>
