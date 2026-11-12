import { useAuth } from '@tinycld/core/lib/auth'
import type { FormHostUi } from '@tinycld/core/lib/forms/host-ui'
import type { EvalContext } from '@tinycld/core/lib/forms/logic'
import { tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import { type FormHost, useFormHost } from '@tinycld/core/lib/forms/use-form-hosts'
import { log } from '@tinycld/core/lib/logger'
import { z } from '@tinycld/core/ui/form'
import { useFormCreate, useFormEdit, useHostUi } from '@tinycld/core/ui/forms'
import { type RefObject, useMemo, useRef } from 'react'
import type { DocumentKind } from '../components/documents/document-kinds'
import { defaultTaxRateId } from '../lib/document-fills'
import { DOCUMENT_LINE_MAPPER } from '../lib/document-line-columns'
import { type DepositRule, type DocumentSaveMode, documentSchema } from '../lib/document-schema'
import { documentTaxOf } from '../lib/document-tax'
import type { DocumentFormValuesBase } from '../lib/document-values'
import { todayIso } from '../lib/register-range'
import type { SalesDocumentKind } from '../lib/sales-document-kinds'
import { type DocumentStart, recordColumnsOf } from './document-data'
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

type FormInput = Pick<DocumentScreenData, 'record' | 'lines' | 'customer' | 'currency'> & {
    taxRows: TaxRows
    // A new form's values when it corrects (`?replaces`) or copies (`?copy`) a document.
    startValues?: DocumentFormValuesBase
    // What a new form starts from besides the document, as the kind's data source read it.
    start?: DocumentStart
    // How a sales receipt draws Deposit to; an invoice has none.
    deposit?: DepositRule
}

// `documentSchema` with the tax the validated values choose (their `tax_rate` through the
// tax rows), so the total rules count the header tax, and with the save mode and the
// Deposit to rule at the time it runs (Post adds its rule to the same resolver).
function documentRecordSchema(
    kind: SalesDocumentKind,
    currency: string,
    saveMode: RefObject<DocumentSaveMode>,
    taxRows: RefObject<TaxRows>,
    deposit: RefObject<DepositRule | undefined>
) {
    return z
        .object({})
        .passthrough()
        .superRefine((values, ctx) => {
            const taxRate = typeof values.tax_rate === 'string' ? values.tax_rate : ''
            const { tax } = documentTaxOf(taxRows.current, taxRate)
            const schema = documentSchema(kind, currency, saveMode.current, tax, deposit.current)
            const result = schema.safeParse(values)
            if (result.success) return
            for (const issue of result.error.issues) {
                ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
            }
        })
}

// The built-ins of a correction's or a copy's values: `replaces` is no field of the form
// (the save writes it), so the engine never files it among the custom fields.
function builtinValuesOf(
    values: DocumentFormValuesBase | undefined
): DocumentFormValuesBase | undefined {
    if (!values) return undefined
    const builtins: DocumentFormValuesBase = { ...values }
    delete builtins.replaces
    return builtins
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
    const { currency } = input
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
                          depositRef
                      ),
                  }
                : null,
        [hostUi, kind, currency]
    )
    const isNew = input.record === undefined
    // Read once: the create form seeds from its first values (core keeps them in a ref).
    const createValues = isNew
        ? (builtinValuesOf(input.startValues) ??
          documentKind.values.new({
              today: context.today as string,
              customer: input.customer ?? null,
              rates: input.taxRows,
              defaultRateId: defaultTaxRateId(input.taxRows),
              start: input.start,
          }))
        : {}
    const { lines, record } = input
    const tables = useMemo(() => ({ lines: tableRowsOf(lines, DOCUMENT_LINE_MAPPER) }), [lines])
    // The engine reads the row as one flat record of its columns.
    const editRow = useMemo(() => (record ? recordColumnsOf(record) : { id: '' }), [record])
    const schemas = ui?.schemas
    const recordSchema = ui?.recordSchema
    const create = useFormCreate(host, undefined, context, createValues, schemas, recordSchema)
    const edit = useFormEdit(host, editRow, context, {}, tables, schemas, recordSchema)
    const chosen = isNew ? create : edit
    // Read through the form state proxy, so a change re-renders the guard (useRecordForm).
    const dirtyFields = chosen.form.formState.dirtyFields
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
        definition: chosen.definition,
        form: chosen.form,
        recordId: record?.id,
        // The posted document a new correction replaces; its insert writes it.
        replaces: isNew ? (input.startValues?.replaces ?? '') : '',
        // The `?customer` a new form was opened with: Post & new keeps only that one. A
        // copy's or a correction's customer comes from its source, not from the route.
        openedWithCustomer: isNew && !input.startValues ? input.customer?.id : undefined,
        // The lines as stored and the tax rows: the save orders its line writes against
        // them (lib/document-line-order.ts).
        storedLines: lines,
        taxRows: input.taxRows,
        saveMode,
        isReady: chosen.isReady && ui !== null,
        isDirty: Object.keys(dirtyFields).length > 0,
    }
}

export type DocumentFormState = ReturnType<typeof useDocumentForm>
