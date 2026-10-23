import { log } from '@tinycld/core/lib/logger'
import { useRef, useState } from 'react'
import { Platform } from 'react-native'
import type { CsvSource } from '../lib/csv-source'
import { pickCsvFile } from '../lib/pick-csv-file'

const PICK_FAILED = 'The file picker could not open. Try again.'
const ONE_FILE = 'Drop one file'
const ONLY_CSV = 'Only comma-separated (CSV) files are supported'
const CSV_TYPES = ['text/csv', 'application/vnd.ms-excel']

// Browsers often report no type for a .csv file, so either the name or the type will do.
function looksLikeCsv(file: File) {
    return file.name.toLowerCase().endsWith('.csv') || CSV_TYPES.includes(file.type)
}

function dropProblem(files: File[]) {
    if (files.length > 1) return ONE_FILE
    if (files.length === 1 && !looksLikeCsv(files[0])) return ONLY_CSV
    return null
}

// Web opens the upload step's file input; native opens the document picker.
export function useCsvPicker(chooseFile: (file: CsvSource) => Promise<void>) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [pickError, setPickError] = useState<string | null>(null)

    const pickNative = async () => {
        try {
            const picked = await pickCsvFile()
            if (picked) await chooseFile(picked)
        } catch (error) {
            log.error('books.import', error)
            setPickError(PICK_FAILED)
        }
    }

    const open = () => {
        setPickError(null)
        if (Platform.OS === 'web') inputRef.current?.click()
        else void pickNative()
    }

    const onInputChange = (event: { target: HTMLInputElement }) => {
        const input = event.target
        const file = input.files?.[0]
        // Cleared so choosing the same file again still fires a change.
        input.value = ''
        setPickError(null)
        if (file) void chooseFile(file)
    }

    const onDrop = (files: File[]) => {
        const problem = dropProblem(files)
        setPickError(problem)
        if (!problem && files[0]) void chooseFile(files[0])
    }

    return { inputRef, open, onInputChange, onDrop, pickError }
}
