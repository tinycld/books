import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fieldMax, migrationField } from './migration-field'

// Reconciliation report spec §4 Schema, with settled difference 12 of the plan: the undo
// rule's second alternative is a writer's (WRITE), and the Go request hook refuses a user
// who is not a Books admin, so a bookkeeper reads the hook's text and not the rule's 404.
// The migration takes the next free number at build time, so this test names no number:
// it finds the one file by its suffix. The migration runs against a fake app over the
// collections the reconcile migration creates, so the assertions read the rules, fields
// and view PocketBase gets.

const MIGRATIONS_DIR = join(__dirname, '..', 'pb-migrations')
const SUFFIX = '_books_reconciliation_report.js'
const RECONCILE_SUFFIX = '_create_books_reconciliations.js'

type Field = { name: string; type?: string; max?: number }

class FieldList extends Array<Field> {
    add(field: Field) {
        const at = this.findIndex(f => f.name === field.name)
        if (at >= 0) this[at] = field
        else this.push(field)
    }
    removeByName(name: string) {
        const at = this.findIndex(f => f.name === name)
        if (at >= 0) this.splice(at, 1)
    }
    getByName(name: string) {
        return this.find(f => f.name === name)
    }
}

type Rules = {
    listRule?: string | null
    viewRule?: string | null
    createRule?: string | null
    updateRule?: string | null
    deleteRule?: string | null
}

type LiveCollection = Rules & {
    id?: string
    name: string
    type?: string
    fields: FieldList
    viewQuery?: string
}

// What a save handed PocketBase at that moment (the live object may change later).
type Saved = Rules & {
    id?: string
    name: string
    type?: string
    fields: Field[]
    viewQuery?: string
}

class Collection {
    fields: FieldList
    constructor(options: Record<string, unknown>) {
        Object.assign(this, options)
        this.fields = FieldList.from((options.fields as Field[] | undefined) ?? []) as FieldList
    }
}

const fieldClass = (type: string) =>
    class {
        constructor(options: Record<string, unknown>) {
            Object.assign(this, { type }, options)
        }
    }

const GLOBALS: Record<string, unknown> = {
    Collection,
    Field: fieldClass('text'),
    TextField: fieldClass('text'),
    NumberField: fieldClass('number'),
    BoolField: fieldClass('bool'),
    DateField: fieldClass('date'),
    RelationField: fieldClass('relation'),
    SelectField: fieldClass('select'),
    AutodateField: fieldClass('autodate'),
    JSONField: fieldClass('json'),
}

function filesWith(suffix: string): string[] {
    return readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith(suffix))
}

function theFile(suffix: string): string {
    const files = filesWith(suffix)
    if (files.length !== 1) throw new Error(`expected one *${suffix}, found ${files.length}`)
    return files[0] ?? ''
}

function load(file: string) {
    const source = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    let up: ((app: unknown) => void) | undefined
    let down: ((app: unknown) => void) | undefined
    const migrate = (u: (app: unknown) => void, d: (app: unknown) => void) => {
        up = u
        down = d
    }
    const names = Object.keys(GLOBALS)
    new Function('migrate', ...names, source)(migrate, ...names.map(name => GLOBALS[name]))
    return { source, up, down }
}

function snapshot(collection: LiveCollection): Saved {
    return {
        id: collection.id,
        name: collection.name,
        type: collection.type,
        listRule: collection.listRule,
        viewRule: collection.viewRule,
        createRule: collection.createRule,
        updateRule: collection.updateRule,
        deleteRule: collection.deleteRule,
        fields: collection.fields.map(field => ({ ...field })),
        viewQuery: collection.viewQuery,
    }
}

// A fake app: it serves the collections saved so far, else an empty one of that name.
function fakeApp(store: Map<string, LiveCollection>) {
    const saved: Saved[] = []
    const deleted: string[] = []
    const app = {
        findCollectionByNameOrId: (name: string): LiveCollection => {
            const found = store.get(name) ?? [...store.values()].find(c => c.id === name)
            if (found) return found
            const made = new Collection({ id: `existing_${name}`, name }) as LiveCollection
            store.set(name, made)
            return made
        },
        save: (collection: LiveCollection) => {
            store.set(collection.name, collection)
            saved.push(snapshot(collection))
        },
        delete: (collection: LiveCollection) => {
            deleted.push(collection.name)
            store.delete(collection.name)
        },
    }
    return { app, saved, deleted }
}

// Runs the reconcile migration's up, then this migration's up and down, on one store.
function runMigration() {
    const store = new Map<string, LiveCollection>()
    const reconcile = fakeApp(store)
    load(theFile(RECONCILE_SUFFIX)).up?.(reconcile.app)
    const before = snapshot(store.get('books_reconciliations') as LiveCollection)
    const file = theFile(SUFFIX)
    const { source, up, down } = load(file)
    const upRun = fakeApp(store)
    up?.(upRun.app)
    const after = snapshot(store.get('books_reconciliations') as LiveCollection)
    const view = upRun.saved.find(c => c.name === 'books_reconciled_lines')
    const downRun = fakeApp(store)
    down?.(downRun.app)
    const restored = downRun.saved.filter(c => c.name === 'books_reconciliations').at(-1)
    return { file, source, before, after, view, downRun, restored }
}

const isset = (name: string) => `@request.body.${name}:isset = false`

// The rule's alternatives joined by `||` outside parentheses and quotes, each without its
// outer parentheses.
function alternatives(rule: string): string[] {
    const parts: string[] = []
    let depth = 0
    let quote = ''
    let start = 0
    for (let i = 0; i < rule.length; i++) {
        const char = rule[i]
        if (quote) {
            if (char === quote) quote = ''
            continue
        }
        if (char === '"' || char === "'") quote = char
        else if (char === '(') depth++
        else if (char === ')') depth--
        else if (depth === 0 && char === '|' && rule[i + 1] === '|') {
            parts.push(rule.slice(start, i))
            start = i + 2
            i++
        }
    }
    parts.push(rule.slice(start))
    return parts.map(part =>
        part
            .trim()
            .replace(/^\(([\s\S]*)\)$/, '$1')
            .trim()
    )
}

// The view's column names: each `AS <name>` that is not a CAST's type.
const CAST_TYPES = new Set(['TEXT', 'REAL', 'NUMERIC', 'INTEGER', 'BOOLEAN', 'INT'])

function viewColumns(query: string): string[] {
    return [...query.matchAll(/\bAS\s+(\w+)/gi)]
        .map(match => match[1] ?? '')
        .filter(name => !CAST_TYPES.has(name.toUpperCase()))
}

// Every field of books_reconciliations but status, id and the two autodates.
const UNDO_PINS_EXCEPT = new Set(['status', 'id', 'created', 'updated'])

describe('reconciliation report migration', () => {
    it('is exactly one file whose name ends with _books_reconciliation_report.js', () => {
        expect(filesWith(SUFFIX)).toHaveLength(1)
    })

    it('adds finished_by_name (text, max 200) to books_reconciliations', () => {
        const { file, before, after } = runMigration()
        expect(before.fields.map(f => f.name)).not.toContain('finished_by_name')
        const field = after.fields.find(f => f.name === 'finished_by_name')
        expect(field?.type).toBe('text')
        expect(field?.max).toBe(200)
        expect(fieldMax(migrationField(file, 'finished_by_name'))).toBe(200)
    })

    it('pins finished_by_name in the create rule and keeps the rest of the reconcile create rule', () => {
        const { before, after } = runMigration()
        const create = after.createRule ?? ''
        expect(create).toContain(isset('finished_by_name'))
        expect(create.replace(` && ${isset('finished_by_name')}`, '')).toBe(before.createRule)
    })

    it('gives the update rule two alternatives: an edit in progress, and the undo of a finished one', () => {
        const { before, after } = runMigration()
        const parts = alternatives(after.updateRule ?? '')
        expect(parts).toHaveLength(2)
        const [edit = '', undo = ''] = parts

        expect(edit).toMatch(/(^|[^.])status = "in_progress"/)
        expect(edit).not.toContain('@request.body.status')
        expect(edit).toContain(isset('finished_by_name'))
        expect(edit.replace(` && ${isset('finished_by_name')}`, '')).toBe(before.updateRule)

        expect(undo).toContain('@collection.books_access:me.can_write ?= true')
        expect(undo).not.toContain('is_admin')
        expect(undo).toMatch(/(^|[^.])status = "finished"/)
        expect(undo).toContain('@request.body.status = "in_progress"')
        expect(undo).not.toContain(isset('status'))
        const others = after.fields.map(f => f.name).filter(name => !UNDO_PINS_EXCEPT.has(name))
        expect(others).toContain('finished_by_name')
        expect(others).toContain('statement_balance')
        const unpinned = others.filter(name => !undo.includes(isset(name)))
        expect(unpinned).toEqual([])
    })

    it('creates the view books_reconciled_lines with the READ rules, no write rule, the eleven columns and no UNION', () => {
        const { before, view } = runMigration()
        expect(view).toBeDefined()
        expect(view?.type).toBe('view')
        expect(view?.id).toBe('pbc_books_recd_lin')
        expect(view?.listRule).toBe(before.listRule)
        expect(view?.viewRule).toBe(before.viewRule)
        expect(view?.createRule ?? null).toBeNull()
        expect(view?.updateRule ?? null).toBeNull()
        expect(view?.deleteRule ?? null).toBeNull()
        const query = view?.viewQuery ?? ''
        expect(query).toMatch(/^\s*SELECT\b/i)
        expect(query).not.toMatch(/\bUNION\b/i)
        expect([...viewColumns(query)].sort()).toEqual(
            [
                'id',
                'reconciliation',
                'account',
                'entry',
                'date',
                'debit',
                'credit',
                'position',
                'currency',
                'memo',
                'payee',
            ].sort()
        )
    })

    it('on the way down deletes the view, removes the field and restores the reconcile rules', () => {
        const { before, downRun, restored } = runMigration()
        expect(downRun.deleted).toContain('books_reconciled_lines')
        expect(restored).toBeDefined()
        expect(restored?.fields.map(f => f.name)).not.toContain('finished_by_name')
        expect({
            listRule: restored?.listRule,
            viewRule: restored?.viewRule,
            createRule: restored?.createRule,
            updateRule: restored?.updateRule,
            deleteRule: restored?.deleteRule,
        }).toEqual({
            listRule: before.listRule,
            viewRule: before.viewRule,
            createRule: before.createRule,
            updateRule: before.updateRule,
            deleteRule: before.deleteRule,
        })
    })
})
