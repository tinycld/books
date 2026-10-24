import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
    autoMatchColumns,
    buildImportPreview,
    type ColumnMap,
    type ExistingAccount,
    type ImportField,
    type ImportRow,
    orderForInsert,
} from '../lib/account-import'
import { foldName } from '../lib/account-import-resolve'
import { columnMapSchema } from '../lib/column-map-schema'
import { checkCsvLimits, parseCsv } from '../lib/csv'
import type { CsvSource } from '../lib/csv-source'
import { readCsvSource } from '../lib/read-csv-source'
import type { BooksAccounts } from '../types'

type Step = 1 | 2 | 3 | 4

const NO_COLUMNS: ColumnMap = {
    number: null,
    name: null,
    type: null,
    detail_type: null,
    parent: null,
    description: null,
    inactive: null,
}

const ONLY_COMMA =
    'Only comma-separated (CSV) files are supported. Save the file with commas between columns.'
const NEEDS_DATA = 'The file needs a header row and at least one data row.'
const PARENT_MISSING = 'The parent account could not be found. Go back and check the file.'
const READ_FAILED = 'This file could not be read. Choose a different file.'

type Parsed = { header: string[]; rows: string[][] }

// A semicolon or tab file parses as one wide column, so the header gives it away.
function isOtherDelimiter(header: string[]) {
    return header.length === 1 && /[;\t]/.test(header[0])
}

function byteLength(text: string) {
    return new TextEncoder().encode(text).length
}

// Why the file cannot be used, or the parsed file when it can. The byte limit is checked
// before parsing, on the decoded text when the source reports no size.
function readableCsv(text: string, size: number | undefined): Parsed | string {
    const tooBig = checkCsvLimits(size ?? byteLength(text), 0)
    if (tooBig) return tooBig
    const parsed = parseCsv(text)
    if (parsed.error) return parsed.error
    if (isOtherDelimiter(parsed.header)) return ONLY_COMMA
    if (parsed.rows.length === 0) return NEEDS_DATA
    const tooLong = checkCsvLimits(undefined, parsed.rows.length)
    return tooLong ?? { header: parsed.header, rows: parsed.rows }
}

function pathOf(account: ExistingAccount, byId: ReadonlyMap<string, ExistingAccount>) {
    const names = [account.name]
    const seen = new Set([account.id])
    let parent = byId.get(account.parent)
    while (parent && !seen.has(parent.id)) {
        names.unshift(parent.name)
        seen.add(parent.id)
        parent = byId.get(parent.parent)
    }
    return names.join(':')
}

// Existing accounts by folded full path, so a row's parent path finds its id.
function existingIds(existing: readonly ExistingAccount[]) {
    const byId = new Map(existing.map(a => [a.id, a]))
    return new Map(existing.map(a => [foldName(pathOf(a, byId)), a.id]))
}

// Existing accounts compared by content, so a new array with the same accounts is not a change.
function existingSignature(existing: readonly ExistingAccount[]) {
    return existing
        .map(a => [a.id, a.parent, a.name, a.number, a.type].join('\u0000'))
        .join('\u0001')
}

type InsertVariables = { row: ImportRow; parent: string; id: string }
type Failure = { line: number; name: string; message: string }
type Progress = { done: number; total: number }

export function useAccountImport(existing: ExistingAccount[]) {
    const [accountsCollection] = useStore('books_accounts')
    const [step, setStep] = useState<Step>(1)
    const [fileError, setFileError] = useState<string | null>(null)
    const [parsed, setParsed] = useState<Parsed | null>(null)
    const [progress, setProgress] = useState<Progress | null>(null)
    const [failure, setFailure] = useState<Failure | null>(null)
    const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)
    // The preview a run was started from. Rows the run creates flip to Skipped in a fresh
    // preview, so the screen keeps showing this one until the run ends.
    const [frozen, setFrozen] = useState<ImportRow[] | null>(null)
    // Refs, because two presses in one tick both see the same stale state.
    const inFlight = useRef(false)
    const isMounted = useRef(true)
    const chooseSequence = useRef(0)
    // Rows earlier failed attempts of this file created, and the rows its first preview skipped.
    const carried = useRef<{ created: number; skipped: number } | null>(null)
    const stableExisting = useRef({ signature: '', value: existing })

    const mapForm = useForm<ColumnMap>({
        resolver: zodResolver(columnMapSchema),
        defaultValues: NO_COLUMNS,
    })
    const watched = useWatch({ control: mapForm.control })
    const columnMap: ColumnMap = useMemo(() => ({ ...NO_COLUMNS, ...watched }), [watched])

    useEffect(() => {
        isMounted.current = true
        return () => {
            isMounted.current = false
        }
    }, [])

    const signature = existingSignature(existing)
    if (stableExisting.current.signature !== signature) {
        stableExisting.current = { signature, value: existing }
    }
    const stable = stableExisting.current.value

    const needsPreview = step === 3 && frozen === null
    const live = useMemo(
        () =>
            needsPreview && parsed
                ? buildImportPreview({ rows: parsed.rows, columnMap, existing: stable })
                : [],
        [needsPreview, parsed, columnMap, stable]
    )
    const preview = frozen ?? live
    const readyCount = useMemo(
        () => preview.filter(row => row.status === 'ready').length,
        [preview]
    )
    const isRunning = frozen !== null

    const insert = useMutation({
        mutationFn: function* ({ row, parent, id }: InsertVariables) {
            yield accountsCollection.insert({
                id,
                name: row.name,
                number: row.number,
                type: row.type as BooksAccounts['type'],
                detail_type: row.detail_type,
                parent,
                description: row.description,
                inactive: row.inactive,
            })
        },
    })

    const chooseFile = async (file: CsvSource) => {
        chooseSequence.current += 1
        const mine = chooseSequence.current
        setFileError(null)
        const tooBig = checkCsvLimits(file.size, 0)
        if (tooBig) {
            setFileError(tooBig)
            return
        }
        let text: string
        try {
            text = await readCsvSource(file)
        } catch (error) {
            log.error('books.import', error, { name: file.name })
            if (mine === chooseSequence.current) setFileError(READ_FAILED)
            return
        }
        // A slower, earlier read must not overwrite the file chosen after it.
        if (mine !== chooseSequence.current) return
        const outcome = readableCsv(text, file.size)
        if (typeof outcome === 'string') {
            setFileError(outcome)
            return
        }
        setParsed(outcome)
        mapForm.reset(autoMatchColumns(outcome.header))
        setStep(2)
    }

    const setColumn = (field: ImportField, index: number | null) => {
        const isSubmitted = mapForm.formState.isSubmitted
        mapForm.setValue(field, index, { shouldDirty: true, shouldValidate: isSubmitted })
        // Validation settles after a tick; a chosen column clears its stale error right away.
        if (isSubmitted && index !== null) mapForm.clearErrors(field)
    }

    const clearRun = () => {
        setProgress(null)
        setFailure(null)
    }

    const goToMap = () => {
        if (!parsed) return
        carried.current = null
        clearRun()
        setStep(2)
    }

    const goToPreview = mapForm.handleSubmit(() => {
        if (!parsed) return
        clearRun()
        setStep(3)
    })

    const runImport = async () => {
        if (inFlight.current || step !== 3) return
        inFlight.current = true
        let current: ImportRow | null = null
        try {
            const rows = orderForInsert(preview)
            if (rows.length === 0) return
            const skipped =
                carried.current?.skipped ?? preview.filter(row => row.status === 'skipped').length
            const createdBefore = carried.current?.created ?? 0
            let created = 0
            carried.current = { created: createdBefore, skipped }
            setFrozen(preview)
            setFailure(null)
            setResult(null)
            setProgress({ done: 0, total: rows.length })
            const ids = existingIds(existing)
            for (const [done, row] of rows.entries()) {
                current = row
                const parent = row.parentPath === '' ? '' : ids.get(foldName(row.parentPath))
                if (parent === undefined) {
                    // Parents are inserted first, so this means the preview and the store disagree.
                    setFailure({ line: row.line, name: row.name, message: PARENT_MISSING })
                    return
                }
                const id = newRecordId()
                await insert.mutateAsync({ row, parent, id })
                if (!isMounted.current) return
                const path = row.parentPath === '' ? row.name : `${row.parentPath}:${row.name}`
                ids.set(foldName(path), id)
                created += 1
                carried.current = { created: createdBefore + created, skipped }
                setProgress({ done: done + 1, total: rows.length })
            }
            setResult({ created: createdBefore + created, skipped })
            carried.current = null
            setStep(4)
        } catch (error) {
            log.error('books.import', error, { line: current?.line })
            if (isMounted.current) {
                setFailure({
                    line: current?.line ?? 0,
                    name: current?.name ?? '',
                    message: errorToString(error),
                })
            }
        } finally {
            inFlight.current = false
            if (isMounted.current) setFrozen(null)
        }
    }

    const reset = () => {
        chooseSequence.current += 1
        setStep(1)
        setFileError(null)
        setParsed(null)
        carried.current = null
        mapForm.reset(NO_COLUMNS)
        clearRun()
        setResult(null)
    }

    return {
        step,
        fileError,
        header: parsed?.header ?? [],
        columnMap: columnMap,
        setColumn,
        mapForm,
        isRunning,
        preview,
        readyCount,
        chooseFile,
        goToMap,
        goToPreview,
        runImport,
        progress,
        failure,
        result,
        reset,
    }
}
