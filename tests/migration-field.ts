import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The source text of the field object `{ name: '<name>', … }` in a Books migration,
// for drift tests. A regex finds the object's start; the end is found by counting
// braces outside string literals, because a field's `pattern` may hold `{2}`.
// Read inside the test, so a missing field fails that drift test only.
export function migrationField(file: string, name: string): string {
    const source = readFileSync(join(__dirname, '..', 'pb-migrations', file), 'utf8')
    const start = source.match(new RegExp(`\\{\\s*name:\\s*'${name}'`))
    if (start?.index === undefined) throw new Error(`${file} has no ${name} field`)
    let depth = 0
    let quote = ''
    for (let i = start.index; i < source.length; i++) {
        const char = source[i]
        if (quote) {
            if (char === '\\') i++
            else if (char === quote) quote = ''
            continue
        }
        if (char === "'" || char === '"' || char === '`') quote = char
        else if (char === '{') depth++
        else if (char === '}') {
            depth--
            if (depth === 0) return source.slice(start.index, i + 1)
        }
    }
    throw new Error(`${file}: the ${name} field is not closed`)
}

export function fieldValues(field: string): string[] {
    const values = field.match(/values:\s*\[([^\]]*)\]/)
    if (!values) throw new Error(`no values list in ${field}`)
    return [...values[1].matchAll(/'([^']*)'/g)].map(match => match[1])
}

// The pattern as the regex PocketBase checks: the JS string literal unescaped.
export function fieldPattern(field: string): string {
    const pattern = field.match(/pattern:\s*'((?:[^'\\]|\\.)*)'/)
    if (!pattern) throw new Error(`no pattern literal in ${field}`)
    return pattern[1].replace(/\\(.)/g, '$1')
}

export function fieldMax(field: string): number {
    const max = field.match(/\bmax:\s*(\d+)/)
    if (!max) throw new Error(`no max in ${field}`)
    return Number(max[1])
}
