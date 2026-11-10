import { useAuth } from '@tinycld/core/lib/auth'
import type { FormHostUi } from '@tinycld/core/lib/forms/host-ui'
import type { EvalContext } from '@tinycld/core/lib/forms/logic'
import { tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import { useFormHost } from '@tinycld/core/lib/forms/use-form-hosts'
import { log } from '@tinycld/core/lib/logger'
import { z } from '@tinycld/core/ui/form'
import { useFormCreate, useFormEdit, useHostUi } from '@tinycld/core/ui/forms'
import { type RefObject, useMemo, useRef } from 'react'
import { INVOICE_HOST_KEY } from '../forms/hosts'
import { INVOICE_LINE_MAPPER } from '../lib/invoice-lines'
import { type InvoiceSaveMode, invoiceSchema } from '../lib/invoice-schema'
import { invoiceTaxOf } from '../lib/invoice-tax'
import { newInvoiceValues } from '../lib/invoice-values'
import { todayIso } from '../lib/register-range'
import type { InvoiceScreenData } from './useInvoiceScreen'

// Books declares the host in its own manifest, so a missing host is a broken build
// (the generator did not run), not a state to render around.
function useInvoiceHost() {
    const host = useFormHost(INVOICE_HOST_KEY)
    if (!host) {
        const error = new Error(`form host ${INVOICE_HOST_KEY} is not registered`)
        log.error('books.invoice', error)
        throw error
    }
    return host
}

type TaxRows = InvoiceScreenData['taxOptions']['rows']

type FormInput = Pick<InvoiceScreenData, 'invoice' | 'lines' | 'customer' | 'currency'> & {
    taxRows: TaxRows
}

// `invoiceSchema` with the tax the validated values choose (their `tax_rate` through the
// tax rows), so the total rules count the header tax, and with the save mode at the time
// it runs (Post adds its rule to the same resolver).
function invoiceRecordSchema(
    currency: string,
    saveMode: RefObject<InvoiceSaveMode>,
    taxRows: RefObject<TaxRows>
) {
    return z
        .object({})
        .passthrough()
        .superRefine((values, ctx) => {
            const taxRate = typeof values.tax_rate === 'string' ? values.tax_rate : ''
            const { tax } = invoiceTaxOf(taxRows.current, taxRate)
            const result = invoiceSchema(currency, saveMode.current, tax).safeParse(values)
            if (result.success) return
            for (const issue of result.error.issues) {
                ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
            }
        })
}

/**
 * The invoice's engine form, new or draft, as useRecordForm builds a record's form. Both
 * core hooks run on every render (hooks cannot be conditional; a route's mode never
 * changes for its life) and the one for the mode is returned. The screen's copy of the
 * Books host UI adds `invoiceSchema` as the whole-record schema (invoiceRecordSchema).
 */
export function useInvoiceForm(input: FormInput) {
    const host = useInvoiceHost()
    const hostUi = useHostUi(host)
    const { user } = useAuth()
    const userId = user?.id ?? ''
    const context = useMemo<EvalContext>(() => ({ today: todayIso(), userId }), [userId])
    const saveMode = useRef<InvoiceSaveMode>('draft')
    // Read when the schema runs, so a rate list that loads later is the one checked.
    const taxRowsRef = useRef(input.taxRows)
    taxRowsRef.current = input.taxRows
    const { currency } = input
    const ui = useMemo<FormHostUi | null>(
        () =>
            hostUi
                ? {
                      ...hostUi,
                      recordSchema: invoiceRecordSchema(currency, saveMode, taxRowsRef),
                  }
                : null,
        [hostUi, currency]
    )
    const isNew = input.invoice === undefined
    // Read once: the create form seeds from its first values (core keeps them in a ref).
    const createValues = isNew
        ? newInvoiceValues({
              today: context.today as string,
              customer: input.customer ?? null,
              rates: input.taxRows,
              defaultRateId: input.taxRows.find(r => r.is_default && !r.inactive)?.id ?? '',
          })
        : {}
    const { lines } = input
    const tables = useMemo(() => ({ lines: tableRowsOf(lines, INVOICE_LINE_MAPPER) }), [lines])
    const schemas = ui?.schemas
    const recordSchema = ui?.recordSchema
    const create = useFormCreate(host, undefined, context, createValues, schemas, recordSchema)
    // Spread: the engine reads the row as a plain record, and a generated row interface
    // carries no index signature.
    const edit = useFormEdit(
        host,
        input.invoice ? { ...input.invoice } : { id: '' },
        context,
        {},
        tables,
        schemas,
        recordSchema
    )
    const chosen = isNew ? create : edit
    // Read through the form state proxy, so a change re-renders the guard (useRecordForm).
    const dirtyFields = chosen.form.formState.dirtyFields
    return {
        host,
        ui,
        context,
        isNew,
        create,
        edit,
        definition: chosen.definition,
        form: chosen.form,
        recordId: input.invoice?.id,
        saveMode,
        isReady: chosen.isReady && ui !== null,
        isDirty: Object.keys(dirtyFields).length > 0,
    }
}

export type InvoiceFormState = ReturnType<typeof useInvoiceForm>
