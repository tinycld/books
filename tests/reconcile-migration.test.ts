import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Reconcile spec §4 Schema. The migration takes the next free number at build time, so
// this test names no number: it finds the one file by its suffix. The migration is run
// here against a fake app, so the assertions read the rules and fields PocketBase gets,
// not the way the file spells them.

const MIGRATIONS_DIR = join(__dirname, '..', 'pb-migrations')
const SUFFIX = '_create_books_reconciliations.js'
const MAX_AMOUNT = 1000000000000000

type Field = {
    name: string
    type?: string
    required?: boolean
    collectionId?: string
    cascadeDelete?: boolean
    maxSelect?: number
    min?: number
    max?: number
    onlyInt?: boolean
    values?: string[]
    onCreate?: boolean
    onUpdate?: boolean
}

type SavedCollection = {
    id?: string
    name: string
    type?: string
    listRule?: string | null
    viewRule?: string | null
    createRule?: string | null
    updateRule?: string | null
    deleteRule?: string | null
    fields?: Field[]
    indexes?: string[]
    viewQuery?: string
}

function migrationFiles(): string[] {
    return readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith(SUFFIX))
}

// The ids 2100000002 gives the ledger collections, so a migration that looks them up and
// one that names the id give the same relation.
const LEDGER_IDS: Record<string, string> = {
    books_accounts: 'pbc_books_accounts',
    books_journal_entries: 'pbc_books_jentries',
    books_journal_lines: 'pbc_books_jlines',
}

function existing(name: string): SavedCollection {
    return { id: LEDGER_IDS[name] ?? `existing_${name}`, name, fields: [], indexes: [] }
}

// Runs the migration's up and down functions against a fake app and returns what each saved
// and deleted, in order.
function runMigration() {
    const files = migrationFiles()
    if (files.length !== 1) throw new Error(`expected one *${SUFFIX}, found ${files.length}`)
    const source = readFileSync(join(MIGRATIONS_DIR, files[0] ?? ''), 'utf8')
    let up: ((app: unknown) => void) | undefined
    let down: ((app: unknown) => void) | undefined
    const migrate = (u: (app: unknown) => void, d: (app: unknown) => void) => {
        up = u
        down = d
    }
    class Collection {
        constructor(options: SavedCollection) {
            Object.assign(this, options)
        }
    }
    new Function('migrate', 'Collection', source)(migrate, Collection)
    const saved: SavedCollection[] = []
    const byName = new Map<string, SavedCollection>()
    const upApp = {
        findCollectionByNameOrId: (name: string) => byName.get(name) ?? existing(name),
        save: (collection: SavedCollection) => {
            saved.push(collection)
            byName.set(collection.name, collection)
        },
        delete: () => undefined,
    }
    up?.(upApp)
    const deleted: string[] = []
    const downApp = {
        findCollectionByNameOrId: (name: string) => byName.get(name) ?? existing(name),
        save: () => undefined,
        delete: (collection: SavedCollection) => {
            deleted.push(collection.name)
        },
    }
    down?.(downApp)
    return { source, saved, byName, deleted }
}

function collection(name: string): SavedCollection {
    const found = runMigration().byName.get(name)
    if (!found) throw new Error(`the migration saves no ${name}`)
    return found
}

function field(of: SavedCollection, name: string): Field {
    const found = of.fields?.find(f => f.name === name)
    if (!found) throw new Error(`${of.name} has no ${name} field`)
    return found
}

const isset = (name: string) => `@request.body.${name}:isset = false`

const RECONCILIATION_STAMPED = [
    'beginning_balance',
    'cleared_out',
    'cleared_in',
    'cleared_out_count',
    'cleared_in_count',
    'created_by',
    'finished_by',
    'finished_at',
    'currency',
]

const LINE_STAMPED = ['account', 'entry', 'date', 'debit', 'credit', 'finished']

describe('reconcile migration', () => {
    it('is exactly one file whose name ends with _create_books_reconciliations.js', () => {
        expect(migrationFiles()).toHaveLength(1)
    })

    it('creates books_reconciliations with every field of spec §4', () => {
        const recs = collection('books_reconciliations')
        expect(recs.id).toBe('pbc_books_reconcil')
        expect(recs.type).toBe('base')
        const names = (recs.fields ?? []).map(f => f.name).sort()
        expect(names).toEqual(
            [
                'account',
                'statement_date',
                'statement_balance',
                'has_statement_totals',
                'statement_out',
                'statement_in',
                'status',
                'beginning_balance',
                'cleared_out',
                'cleared_in',
                'cleared_out_count',
                'cleared_in_count',
                'created_by',
                'finished_by',
                'finished_at',
                'currency',
                'created',
                'updated',
            ].sort()
        )
        expect(field(recs, 'account')).toMatchObject({
            type: 'relation',
            required: true,
            collectionId: 'pbc_books_accounts',
            cascadeDelete: false,
            maxSelect: 1,
        })
        expect(field(recs, 'statement_date')).toMatchObject({ type: 'text', required: true })
        for (const name of ['statement_balance', 'beginning_balance']) {
            expect(field(recs, name)).toMatchObject({
                type: 'number',
                onlyInt: true,
                min: -MAX_AMOUNT,
                max: MAX_AMOUNT,
            })
        }
        for (const name of [
            'statement_out',
            'statement_in',
            'cleared_out',
            'cleared_in',
            'cleared_out_count',
            'cleared_in_count',
        ]) {
            expect(field(recs, name)).toMatchObject({ type: 'number', onlyInt: true, min: 0 })
        }
        expect(field(recs, 'has_statement_totals').type).toBe('bool')
        const status = field(recs, 'status')
        expect(status).toMatchObject({ type: 'select', required: true })
        expect(status.values).toEqual(['in_progress', 'finished'])
        for (const name of ['created_by', 'finished_by']) {
            expect(field(recs, name)).toMatchObject({
                type: 'relation',
                collectionId: '_pb_users_auth_',
            })
        }
        expect(field(recs, 'finished_at').type).toBe('date')
        expect(field(recs, 'currency').type).toBe('text')
        expect(field(recs, 'created')).toMatchObject({ type: 'autodate', onCreate: true })
        expect(field(recs, 'updated')).toMatchObject({ type: 'autodate', onUpdate: true })
    })

    it('pins each server-stamped field of books_reconciliations with unset( in its create and update rules', () => {
        const { source } = runMigration()
        expect(source).toContain('unset(')
        const recs = collection('books_reconciliations')
        expect(recs.listRule).toContain('can_read ?= true')
        expect(recs.viewRule).toContain('can_read ?= true')
        const create = recs.createRule ?? ''
        expect(create).toContain('can_write ?= true')
        expect(create).toContain('@request.body.status = "in_progress"')
        for (const name of RECONCILIATION_STAMPED) expect(create).toContain(isset(name))
        expect(create).not.toContain(isset('account'))
        const update = recs.updateRule ?? ''
        expect(update).toContain('can_write ?= true')
        expect(update).toMatch(/(^|[^.])status = "in_progress"/)
        expect(update).not.toContain('@request.body.status = "in_progress"')
        for (const name of ['account', ...RECONCILIATION_STAMPED]) {
            expect(update).toContain(isset(name))
        }
        const del = recs.deleteRule ?? ''
        expect(del).toContain('can_write ?= true')
        expect(del).toMatch(/(^|[^.])status = "in_progress"/)
    })

    it('indexes books_reconciliations: one in progress per account, and (account, statement_date)', () => {
        const indexes = collection('books_reconciliations').indexes ?? []
        expect(
            indexes.some(index =>
                /CREATE UNIQUE INDEX \w+ ON books_reconciliations \(account\) WHERE status = 'in_progress'/.test(
                    index
                )
            )
        ).toBe(true)
        expect(
            indexes.some(index =>
                /CREATE INDEX \w+ ON books_reconciliations \(account, statement_date\)/.test(index)
            )
        ).toBe(true)
    })

    it('creates books_reconciliation_lines with no update rule and its stamped fields unset on create', () => {
        const recs = collection('books_reconciliations')
        const lines = collection('books_reconciliation_lines')
        expect(lines.id).toBe('pbc_books_recn_lin')
        expect(lines.updateRule).toBeNull()
        expect(lines.listRule).toContain('can_read ?= true')
        expect(lines.viewRule).toContain('can_read ?= true')
        const create = lines.createRule ?? ''
        expect(create).toContain('can_write ?= true')
        for (const name of LINE_STAMPED) expect(create).toContain(isset(name))
        expect(lines.deleteRule).toContain('can_write ?= true')
        expect(lines.deleteRule).toMatch(/(^|[^.])finished = false/)
        expect(field(lines, 'reconciliation')).toMatchObject({
            type: 'relation',
            required: true,
            collectionId: recs.id,
            cascadeDelete: true,
        })
        expect(field(lines, 'line')).toMatchObject({
            type: 'text',
            required: true,
            min: 15,
            max: 15,
            pattern: '^[a-z0-9]{15}$',
        })
        for (const name of ['account', 'entry', 'date', 'debit', 'credit', 'finished']) {
            field(lines, name)
        }
        expect(field(lines, 'finished').type).toBe('bool')
        const indexes = lines.indexes ?? []
        expect(
            indexes.some(index =>
                /CREATE UNIQUE INDEX \w+ ON books_reconciliation_lines \(line\)/.test(index)
            )
        ).toBe(true)
        expect(
            indexes.some(index =>
                /CREATE INDEX \w+ ON books_reconciliation_lines \(reconciliation\)/.test(index)
            )
        ).toBe(true)
        expect(
            indexes.some(index =>
                /CREATE INDEX \w+ ON books_reconciliation_lines \(entry\)/.test(index)
            )
        ).toBe(true)
    })

    it('creates the books_reconcile_lines view as one SELECT with no UNION', () => {
        const view = collection('books_reconcile_lines')
        expect(view.id).toBe('pbc_books_recn_viw')
        expect(view.type).toBe('view')
        expect(view.listRule).toContain('can_read ?= true')
        expect(view.viewRule).toContain('can_read ?= true')
        const query = view.viewQuery ?? ''
        expect(query).toMatch(/^\s*SELECT\b/i)
        expect(query).not.toMatch(/\bUNION\b/i)
        for (const column of [
            'line',
            'account',
            'entry',
            'date',
            'debit',
            'credit',
            'memo',
            'number',
            'doc_type',
            'origin',
            'document',
            'payee',
            'reconciliation',
            'finished',
            'bank_matched',
        ]) {
            expect(query).toMatch(new RegExp(`\\bAS ${column}\\b`))
        }
        expect(query).toContain('books_bank_match_lines')
        expect(query).toContain("'void_reversal'")
    })

    it('deletes the view, then the two collections, on the way down', () => {
        const { deleted } = runMigration()
        expect(deleted).toEqual([
            'books_reconcile_lines',
            'books_reconciliation_lines',
            'books_reconciliations',
        ])
    })
})
