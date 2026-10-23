import type { CsvSource } from './csv-source'

// Web only ever receives a browser File; the picker's uri shape is native-only.
export async function readCsvSource(source: CsvSource): Promise<string> {
    if ('uri' in source) throw new Error('A file path cannot be read on web.')
    return source.text()
}
