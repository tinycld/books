import { File as NativeFile } from 'expo-file-system'
import type { CsvSource } from './csv-source'

// expo-file-system's File is a Blob, so a picked uri reads the same way as a browser File.
export async function readCsvSource(source: CsvSource): Promise<string> {
    if ('uri' in source) return new NativeFile(source.uri).text()
    return source.text()
}
