export const csvLimits = { maxRows: 2000, maxBytes: 1048576 } as const

export type ParsedCsv = { header: string[]; rows: string[][]; error: string | null }

export function parseCsv(text: string): ParsedCsv {
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
    const records: string[][] = []
    let record: string[] = []
    let field = ''
    let inQuotes = false
    // A quoted empty cell ("") is content; only a bare empty line is blank.
    let recordHasQuotes = false

    const endRecord = () => {
        record.push(field)
        const isBlank = !recordHasQuotes && record.every(cell => cell.trim() === '')
        if (!isBlank) records.push(record)
        record = []
        field = ''
        recordHasQuotes = false
    }

    for (let i = 0; i < src.length; i++) {
        const c = src[i]
        if (inQuotes) {
            if (c !== '"') {
                field += c
            } else if (src[i + 1] === '"') {
                field += '"'
                i++
            } else {
                inQuotes = false
            }
            continue
        }
        if (c === '"' && field === '') {
            inQuotes = true
            recordHasQuotes = true
        } else if (c === ',') {
            record.push(field)
            field = ''
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && src[i + 1] === '\n') i++
            endRecord()
        } else {
            field += c
        }
    }
    // The record still being read when the text ends inside quotes is incomplete, so drop it.
    if (inQuotes) {
        const [header = [], ...rows] = records
        return { header, rows, error: 'A quoted value is missing its closing quote.' }
    }
    if (field !== '' || record.length > 0 || recordHasQuotes) endRecord()

    const [header = [], ...rows] = records
    return { header, rows, error: null }
}

export function checkCsvLimits(sizeBytes: number | undefined, rowCount: number): string | null {
    if (sizeBytes !== undefined && sizeBytes > csvLimits.maxBytes) {
        return 'This file is larger than 1 MB. Split it into smaller files.'
    }
    if (rowCount > csvLimits.maxRows) {
        return `This file has more than ${csvLimits.maxRows} rows. Split it into smaller files.`
    }
    return null
}
