import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function migrationSource(file: string): string {
    return readFileSync(join(__dirname, '..', 'pb-migrations', file), 'utf8')
}

// The object literal that starts at `start` (a `{`), found by counting braces outside
// string literals, because a field's `pattern` may hold `{2}`.
function objectAt(source: string, start: number, what: string): string {
    let depth = 0
    let quote = ''
    for (let i = start; i < source.length; i++) {
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
            if (depth === 0) return source.slice(start, i + 1)
        }
    }
    throw new Error(`${what} is not closed`)
}

// The source text of the field object `{ name: '<name>', … }` in a Books migration,
// for drift tests. Read inside the test, so a missing field fails that drift test only.
export function migrationField(file: string, name: string): string {
    const source = migrationSource(file)
    const start = source.match(new RegExp(`\\{\\s*name:\\s*'${name}'`))
    if (start?.index === undefined) throw new Error(`${file} has no ${name} field`)
    return objectAt(source, start.index, `${file}: the ${name} field`)
}

// The collection a field at `index` belongs to: the last collection the migration
// created (`new Collection({ … name: '<c>'`) or looked up (`findCollectionByNameOrId`)
// before it.
function collectionBefore(source: string, index: number): string {
    const before = source.slice(0, index)
    let found = { at: -1, name: '' }
    const patterns = [
        /new Collection\(\{[\s\S]*?name:\s*'([^']+)'/g,
        /findCollectionByNameOrId\(\s*'([^']+)'\s*\)/g,
    ]
    for (const pattern of patterns) {
        for (const match of before.matchAll(pattern)) {
            if ((match.index ?? -1) > found.at) found = { at: match.index ?? -1, name: match[1] }
        }
    }
    return found.name
}

// Every field object named `<name>` in a Books migration, with the collection it is on.
export function migrationFields(
    file: string,
    name: string
): { collection: string; field: string }[] {
    const source = migrationSource(file)
    return [...source.matchAll(new RegExp(`\\{\\s*name:\\s*'${name}'`, 'g'))].map(match => {
        const index = match.index ?? 0
        return {
            collection: collectionBefore(source, index),
            field: objectAt(source, index, `${file}: a ${name} field`),
        }
    })
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
