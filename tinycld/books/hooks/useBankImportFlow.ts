import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { useMemo, useState } from 'react'
import { OFX_MAPPING, previewBankRows } from '../lib/bank-import'
import {
    type BankImportFormValues,
    bankImportFormSchema,
    bankImportRecord,
    EMPTY_MAPPING_VALUES,
    MAPPING_FIELDS,
    mappingFromForm,
} from '../lib/bank-import-form'
import {
    alreadyImportedLines,
    BANK_IMPORT_TRANSPORT_TEXT,
    choiceRows,
    importButtonText,
    importResultText,
    importSummary,
    nothingToChoose,
    readyLines,
    selectAllState,
    selectionText,
    selectionTotals,
    toggleAllLines,
    toggleLine,
} from '../lib/bank-import-view'
import { errorStatus, messageOnlyRefusal } from '../lib/refusal'
import { useBackToBanking } from './useBackToBanking'
import type { BankImportData } from './useBankImport'

type Step = 'map' | 'choose' | 'result'

// The import page's form, step, choice and write. Mounted only once the page's data has
// loaded, so the form's default values come from loaded data and are never synced later.
export function useBankImportFlow(data: BankImportData) {
    const [importsCollection] = useStore('books_bank_imports')
    // Computed once, at mount: an OFX file opens with its ready rows chosen. A CSV file
    // opens on Map with nothing chosen, so it maps no rows here.
    const [firstLines] = useState(() =>
        data.format === 'ofx'
            ? readyLines(
                  previewBankRows(data.rows, OFX_MAPPING).rows,
                  alreadyImportedLines(data.earlier, null)
              )
            : []
    )
    const form = useForm<BankImportFormValues>({
        resolver: zodResolver(bankImportFormSchema(data.format, data.columns)),
        defaultValues: { ...EMPTY_MAPPING_VALUES, lines: firstLines },
    })
    // A local step toggle: the Map step (CSV) comes first, OFX opens on Choose.
    const [step, setStep] = useState<Step>(data.format === 'ofx' ? 'choose' : 'map')
    const [resultId, setResultId] = useState<string | null>(null)

    const [
        header_row,
        date_column,
        date_format,
        description_column,
        amount_columns,
        amount_column,
        money_in_column,
        money_out_column,
        amount_sign,
    ] = useWatch({ control: form.control, name: MAPPING_FIELDS })
    // Keyed on the nine mapping strings only, so a box press (which changes only `lines`)
    // never maps the rows again: a file can hold 10,000 rows.
    const { mapping, preview } = useMemo(() => {
        const current =
            data.format === 'ofx'
                ? OFX_MAPPING
                : mappingFromForm({
                      header_row,
                      date_column,
                      date_format,
                      description_column,
                      amount_columns,
                      amount_column,
                      money_in_column,
                      money_out_column,
                      amount_sign,
                      lines: [],
                  })
        return { mapping: current, preview: previewBankRows(data.rows, current).rows }
    }, [
        data.rows,
        data.format,
        header_row,
        date_column,
        date_format,
        description_column,
        amount_columns,
        amount_column,
        money_in_column,
        money_out_column,
        amount_sign,
    ])

    const importMutation = useMutation({
        mutationFn: function* ({ id, values }: { id: string; values: BankImportFormValues }) {
            yield importsCollection.insert(
                bankImportRecord({ id, fileId: data.fileId, format: data.format, values })
            )
        },
        onSuccess: (_result, { id }) => {
            setResultId(id)
            setStep('result')
        },
        onError: (error: unknown) => {
            if (errorStatus(error) === 0) {
                form.setError('root.transport', { message: BANK_IMPORT_TRANSPORT_TEXT })
                log.warn('books.banking', 'import failed', { fileId: data.fileId })
                return
            }
            const message = messageOnlyRefusal(error)
            if (message) {
                form.setError('root.server', { message })
                return
            }
            handleMutationErrorsWithForm({ setError: form.setError, getValues: form.getValues })(
                error
            )
        },
    })
    const isBusy = importMutation.isPending
    const pendingId = isBusy ? (importMutation.variables?.id ?? null) : null
    const already = alreadyImportedLines(data.earlier, pendingId)

    const lines = useWatch({ control: form.control, name: 'lines' })
    const rows = choiceRows({
        rows: data.rows,
        preview,
        mapping,
        already,
        chosen: new Set(lines),
        currency: data.currency,
    })
    const totals = selectionTotals(rows)
    const errorCount = rows.filter(row => row.kind === 'error').length

    const setLines = (next: number[]) =>
        form.setValue('lines', next, { shouldValidate: form.formState.isSubmitted })
    const onToggle = (line: number) => {
        if (isBusy) return
        setLines(toggleLine(rows, new Set(form.getValues('lines')), line))
    }
    const onToggleAll = () => {
        if (isBusy) return
        setLines(toggleAllLines(rows))
    }
    // Realtime can turn a chosen row into "Already imported" (another tab imported it), so
    // only the rows that are ready and chosen now are sent, in file order: the count the
    // button shows.
    const onImport = () => {
        if (isBusy) return
        void form.handleSubmit(values => {
            const chosenNow = new Set(values.lines)
            const sent = rows
                .filter(row => row.kind === 'ready' && chosenNow.has(row.line))
                .map(row => row.line)
            importMutation.mutate({ id: newRecordId(), values: { ...values, lines: sent } })
        })()
    }
    const onCancel = useBackToBanking(data.connectionId)

    // The earlier-imports query holds the new row, so useRecord serves it from the store.
    const { record } = useRecord(importsCollection, resultId)
    const result = record
        ? {
              ...importResultText({
                  imported: record.imported,
                  duplicates: record.duplicates,
                  accountLabel: data.accountLabel,
              }),
              hasMore: readyLines(preview, already).length > 0,
          }
        : null
    const onImportMore = () => {
        form.setValue('lines', readyLines(preview, already))
        setResultId(null)
        setStep('choose')
    }

    return {
        step,
        form,
        rows,
        nothing: nothingToChoose(rows),
        summary: importSummary(rows),
        selection: selectionText(totals, data.currency),
        selectState: selectAllState(rows),
        errorCount,
        isBusy,
        submitText: importButtonText(totals.count),
        onToggle,
        onToggleAll,
        onImport,
        onCancel,
        result,
        onImportMore,
        isSubmitted: form.formState.isSubmitted,
    }
}

export type BankImportFlow = ReturnType<typeof useBankImportFlow>
