import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { type FieldErrors, useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { useMemo, useRef, useState } from 'react'
import { OFX_MAPPING, previewBankRows } from '../lib/bank-import'
import {
    type BankImportFormValues,
    bankImportFormSchema,
    bankImportRecord,
    EMPTY_MAPPING_VALUES,
    formFromMapping,
    MAPPING_FIELDS,
    mappingFromForm,
} from '../lib/bank-import-form'
import { guessBankMapping } from '../lib/bank-import-guess'
import {
    alreadyImportedLines,
    BANK_IMPORT_TRANSPORT_TEXT,
    choiceRows,
    columnOptions,
    dateFormatOptions,
    importButtonText,
    importResultText,
    importSummary,
    keepChoice,
    mapIntroText,
    nothingToChoose,
    readyLines,
    samplePreview,
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

// The Map step's summary lists only the mapping's errors: the `lines` rule and a refusal
// of the import belong to the Choose step.
function mappingErrors(
    errors: FieldErrors<BankImportFormValues>
): FieldErrors<BankImportFormValues> {
    const picked: FieldErrors<BankImportFormValues> = {}
    for (const field of MAPPING_FIELDS) {
        const error = errors[field]
        if (error) picked[field] = error
    }
    return picked
}

// An OFX file opens with its ready rows chosen. A CSV file opens on Map with nothing
// chosen, so it maps no rows here; it starts from the account's last CSV mapping, else from
// Books' guesses.
function firstValues(data: BankImportData) {
    if (data.format === 'ofx') {
        const lines = readyLines(
            previewBankRows(data.rows, OFX_MAPPING).rows,
            alreadyImportedLines(data.earlier, null)
        )
        return { values: { ...EMPTY_MAPPING_VALUES, lines }, remembered: false }
    }
    const mapping = formFromMapping(data.lastMapping ?? guessBankMapping(data.rows, data.columns))
    return { values: { ...mapping, lines: [] }, remembered: data.lastMapping !== null }
}

type FirstValues = ReturnType<typeof firstValues>

// The import page's form, step, choice and write. Mounted only once the page's data has
// loaded, so the form's default values come from loaded data and are never synced later.
export function useBankImportFlow(data: BankImportData) {
    const [importsCollection] = useStore('books_bank_imports')
    // Held from mount: the form's first values (mapping the rows is not repeated on each
    // render) and whether the intro says the mapping was remembered.
    const first = useRef<FirstValues | null>(null)
    if (first.current === null) first.current = firstValues(data)
    const { values: firstFormValues, remembered } = first.current
    const form = useForm<BankImportFormValues>({
        resolver: zodResolver(bankImportFormSchema(data.format, data.columns)),
        defaultValues: firstFormValues,
    })
    // A local step toggle: the Map step (CSV) comes first, OFX opens on Choose.
    const [step, setStep] = useState<Step>(data.format === 'ofx' ? 'choose' : 'map')
    const [resultId, setResultId] = useState<string | null>(null)
    // The Map step's error summary shows once Continue was pressed.
    const [continueTried, setContinueTried] = useState(false)
    // Every line that was ready on an earlier Continue, so a new mapping can tell a line
    // the person left unchosen from one that is ready for the first time.
    const seen = useRef<number[]>([])

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
    const { mapping, preview, samplePreviewLines } = useMemo(() => {
        const values: BankImportFormValues = {
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
        }
        if (data.format === 'ofx') {
            return {
                mapping: OFX_MAPPING,
                preview: previewBankRows(data.rows, OFX_MAPPING).rows,
                samplePreviewLines: { isComplete: false, lines: [] },
            }
        }
        const current = mappingFromForm(values)
        return {
            mapping: current,
            preview: previewBankRows(data.rows, current).rows,
            samplePreviewLines: samplePreview(data.rows, values, data.columns, data.currency),
        }
    }, [
        data.rows,
        data.format,
        data.columns,
        data.currency,
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

    // `trigger` with names runs the full resolver but sets only those fields' errors, so the
    // `lines` rule (the Choose step's) never shows here.
    const onContinue = async () => {
        setContinueTried(true)
        const ok = await form.trigger([...MAPPING_FIELDS])
        if (!ok) return
        const ready = readyLines(preview, already)
        // After a refused Import, the `lines` error must follow the new choice.
        form.setValue(
            'lines',
            keepChoice({ chosen: form.getValues('lines'), seen: seen.current }, ready),
            { shouldValidate: form.formState.isSubmitted }
        )
        seen.current = [...new Set([...seen.current, ...ready])]
        setStep('choose')
    }
    // The form validates on submit only, and Continue is not a submit, so once Continue was
    // pressed each changed answer validates the mapping again: the errors under the selects
    // and in the summary then describe the current answers.
    const onAnswerChange = () => {
        if (!continueTried) return
        void form.trigger([...MAPPING_FIELDS])
    }
    // The form keeps every answer and the choice, so Continue comes back to them.
    const onBack = () => {
        if (isBusy) return
        setStep('map')
    }

    const firstBody = data.rows[mapping.header_row ? 1 : 0]
    const firstDate = firstBody?.cells[mapping.date_column - 1] ?? ''
    const map = {
        intro: mapIntroText(remembered, data.accountLabel),
        sample: { rows: data.rows, columns: data.columns, headerRow: mapping.header_row },
        columnOptions: columnOptions(data.rows, data.columns),
        dateOptions: dateFormatOptions(firstDate),
        amountColumns: amount_columns,
        preview: samplePreviewLines,
        continueTried,
        onAnswerChange,
        errors: mappingErrors(form.formState.errors),
    }

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
        map,
        onContinue,
        onBack,
        onChangeMapping: onBack,
        result,
        onImportMore,
        isSubmitted: form.formState.isSubmitted,
    }
}

export type BankImportFlow = ReturnType<typeof useBankImportFlow>
