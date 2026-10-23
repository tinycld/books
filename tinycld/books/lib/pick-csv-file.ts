import type { CsvSource } from './csv-source'

// Web chooses files through the file input on the upload step, so there is no picker.
export async function pickCsvFile(): Promise<CsvSource | null> {
    return null
}
