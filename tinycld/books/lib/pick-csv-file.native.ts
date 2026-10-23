import { getDocumentAsync } from 'expo-document-picker'
import type { CsvSource } from './csv-source'

export async function pickCsvFile(): Promise<CsvSource | null> {
    const result = await getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
        multiple: false,
        copyToCacheDirectory: true,
    })
    if (result.canceled) return null
    const [asset] = result.assets
    return { uri: asset.uri, name: asset.name, size: asset.size }
}
