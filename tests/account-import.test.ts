import { describe, expect, it } from 'vitest'
import {
    autoMatchColumns,
    buildImportPreview,
    type ColumnMap,
    type ExistingAccount,
    IMPORT_FIELDS,
    importExampleCsv,
    orderForInsert,
} from '../tinycld/books/lib/account-import'
import {
    type ResolveStats,
    type RowInput,
    resolveRows,
} from '../tinycld/books/lib/account-import-resolve'
import { parseCsv } from '../tinycld/books/lib/csv'

// Column order used by every row below.
const fullMap: ColumnMap = {
    number: 0,
    name: 1,
    type: 2,
    detail_type: 3,
    parent: 4,
    description: 5,
    inactive: 6,
}

function row(
    over: Partial<{
        number: string
        name: string
        type: string
        detail: string
        parent: string
        description: string
        inactive: string
    }> = {}
): string[] {
    const v = {
        number: '',
        name: 'Cash',
        type: 'bank',
        detail: 'checking',
        parent: '',
        description: '',
        inactive: '',
        ...over,
    }
    return [v.number, v.name, v.type, v.detail, v.parent, v.description, v.inactive]
}

function existing(
    over: Partial<ExistingAccount> & Pick<ExistingAccount, 'id' | 'name'>
): ExistingAccount {
    return { number: '', type: 'bank', parent: '', ...over }
}

function preview(rows: string[][], ex: ExistingAccount[] = [], columnMap: ColumnMap = fullMap) {
    return buildImportPreview({ rows, columnMap, existing: ex })
}

describe('IMPORT_FIELDS', () => {
    it('requires only name and type', () => {
        const required = IMPORT_FIELDS.filter(f => f.required).map(f => f.field)
        expect(required.sort()).toEqual(['name', 'type'])
        expect(IMPORT_FIELDS.map(f => f.field).sort()).toEqual(
            ['description', 'detail_type', 'inactive', 'name', 'number', 'parent', 'type'].sort()
        )
    })
})

describe('autoMatchColumns', () => {
    it('maps headers case and punctuation insensitively', () => {
        expect(
            autoMatchColumns([
                'Account #',
                'Account Name',
                'TYPE',
                'Detail Type',
                'Parent',
                'Notes',
            ])
        ).toEqual({
            number: 0,
            name: 1,
            type: 2,
            detail_type: 3,
            parent: 4,
            description: 5,
            inactive: null,
        })
    })

    it('leaves description and inactive null when no header matches', () => {
        const map = autoMatchColumns(['Account #', 'Account Name', 'TYPE', 'Detail Type', 'Parent'])
        expect(map.description).toBeNull()
        expect(map.inactive).toBeNull()
    })

    it('matches the synonyms for each field', () => {
        expect(
            autoMatchColumns([
                'No',
                'Name',
                'Account Type',
                'Sub-Type',
                'Parent Account',
                'Description',
                'Is Inactive',
            ])
        ).toEqual({
            number: 0,
            name: 1,
            type: 2,
            detail_type: 3,
            parent: 4,
            description: 5,
            inactive: 6,
        })
        expect(autoMatchColumns(['Acct', 'Account No', 'Inactive']).number).toBe(0)
        expect(autoMatchColumns(['Account Number', 'Name']).number).toBe(0)
    })

    it('maps every field to null for an empty header', () => {
        expect(autoMatchColumns([])).toEqual({
            number: null,
            name: null,
            type: null,
            detail_type: null,
            parent: null,
            description: null,
            inactive: null,
        })
    })
})

describe('buildImportPreview: field validation', () => {
    it('marks a valid row ready with normalized values and a 1-based line', () => {
        const [first, second] = preview([
            row({ name: 'A', number: '1' }),
            row({ name: 'Cash', number: '1000', description: 'main' }),
        ])
        expect(first).toMatchObject({ line: 1, status: 'ready', reason: null })
        expect(second).toEqual({
            line: 2,
            status: 'ready',
            reason: null,
            name: 'Cash',
            number: '1000',
            type: 'bank',
            detail_type: 'checking',
            parentPath: '',
            description: 'main',
            inactive: false,
        })
    })

    it('matches type and detail type by label or key, case insensitively', () => {
        const rows = preview([
            row({ name: 'A', type: 'Bank', detail: 'Money market' }),
            row({ name: 'B', type: 'BANK', detail: 'MONEY_MARKET' }),
            row({ name: 'C', type: 'accounts receivable', detail: 'Accounts Receivable' }),
            row({ name: 'D', type: 'cost_of_goods_sold', detail: 'cost of labor' }),
        ])
        expect(rows.map(r => r.status)).toEqual(['ready', 'ready', 'ready', 'ready'])
        expect(rows.map(r => [r.type, r.detail_type])).toEqual([
            ['bank', 'money_market'],
            ['bank', 'money_market'],
            ['accounts_receivable', 'accounts_receivable'],
            ['cost_of_goods_sold', 'cost_of_labor'],
        ])
    })

    it('errors a blank name', () => {
        const [r] = preview([row({ name: '' })])
        expect(r.status).toBe('error')
        expect(r.reason).toMatch(/name/i)
    })

    it('errors a whitespace-only name', () => {
        const [r] = preview([row({ name: '   ' })])
        expect(r.status).toBe('error')
        expect(r.reason).toMatch(/name/i)
    })

    it('errors a row too short to hold the name cell', () => {
        const [r] = preview([['1000']])
        expect(r.status).toBe('error')
        expect(r.reason).toMatch(/name/i)
    })

    it('errors a blank type with "type required"', () => {
        const [r] = preview([row({ type: '' })])
        expect(r).toMatchObject({ status: 'error', reason: 'type required' })
    })

    it('errors a type column that is not mapped with "type required"', () => {
        const [r] = preview([row()], [], { ...fullMap, type: null })
        expect(r).toMatchObject({ status: 'error', reason: 'type required' })
    })

    it('errors a blank detail type with "detail type required"', () => {
        const [r] = preview([row({ detail: '' })])
        expect(r).toMatchObject({ status: 'error', reason: 'detail type required' })
    })

    it('errors an unmapped detail type column with "detail type required"', () => {
        const [r] = preview([row()], [], { ...fullMap, detail_type: null })
        expect(r).toMatchObject({ status: 'error', reason: 'detail type required' })
    })

    it('errors an unknown type', () => {
        const [r] = preview([row({ type: 'Banana' })])
        expect(r.status).toBe('error')
        expect(r.reason).toMatch(/type/i)
        expect(r.reason).not.toBe('type required')
    })

    it('errors a detail type that is not valid for the type', () => {
        const [r] = preview([row({ type: 'bank', detail: 'inventory' })])
        expect(r.status).toBe('error')
        expect(r.reason).toMatch(/detail/i)
        expect(r.reason).not.toBe('detail type required')
    })

    it('reports the first failing rule: name, then type, then detail type, then inactive', () => {
        expect(
            preview([row({ name: '', type: '', detail: '', inactive: 'maybe' })])[0].reason
        ).toMatch(/name/i)
        expect(preview([row({ type: '', detail: '', inactive: 'maybe' })])[0].reason).toBe(
            'type required'
        )
        expect(preview([row({ detail: '', inactive: 'maybe' })])[0].reason).toBe(
            'detail type required'
        )
        expect(preview([row({ inactive: 'maybe' })])[0].reason).toMatch(/inactive/i)
    })

    it('treats a blank or unmapped inactive as false', () => {
        expect(preview([row({ inactive: '' })])[0]).toMatchObject({
            status: 'ready',
            inactive: false,
        })
        expect(
            preview([row({ inactive: 'yes' })], [], { ...fullMap, inactive: null })[0]
        ).toMatchObject({
            status: 'ready',
            inactive: false,
        })
    })

    it('accepts yes/no/true/false/1/0 for inactive, case insensitively', () => {
        const values = ['yes', 'YES', 'true', 'True', '1', 'no', 'No', 'false', 'FALSE', '0']
        const rows = preview(values.map((inactive, i) => row({ name: `A${i}`, inactive })))
        expect(rows.map(r => r.status)).toEqual(values.map(() => 'ready'))
        expect(rows.map(r => r.inactive)).toEqual([
            true,
            true,
            true,
            true,
            true,
            false,
            false,
            false,
            false,
            false,
        ])
    })

    it('errors any other inactive value', () => {
        const rows = preview([
            row({ name: 'A', inactive: 'maybe' }),
            row({ name: 'B', inactive: '2' }),
        ])
        for (const r of rows) {
            expect(r.status).toBe('error')
            expect(r.reason).toMatch(/inactive/i)
        }
    })
})

describe('buildImportPreview: parent resolution', () => {
    const assets = existing({ id: 'a1', name: 'Assets' })
    const checking = existing({ id: 'a2', name: 'Checking', parent: 'a1' })

    it('resolves an existing parent by full path', () => {
        const [r] = preview([row({ name: 'Petty', parent: 'Assets:Checking' })], [assets, checking])
        expect(r).toMatchObject({ status: 'ready', parentPath: 'Assets:Checking' })
    })

    it('resolves a bare name that matches exactly one existing account to its full path', () => {
        const [r] = preview([row({ name: 'Petty', parent: 'Checking' })], [assets, checking])
        expect(r).toMatchObject({ status: 'ready', parentPath: 'Assets:Checking' })
    })

    it('resolves an imported parent by path, wherever it is in the file', () => {
        const rows = preview([
            row({ name: 'Child', parent: 'Top:Mid' }),
            row({ name: 'Top' }),
            row({ name: 'Mid', parent: 'Top' }),
        ])
        expect(rows.map(r => r.status)).toEqual(['ready', 'ready', 'ready'])
        expect(rows[0].parentPath).toBe('Top:Mid')
        expect(rows[2].parentPath).toBe('Top')
    })

    it('resolves a bare name that matches one imported account', () => {
        const rows = preview([
            row({ name: 'Top' }),
            row({ name: 'Mid', parent: 'Top' }),
            row({ name: 'Child', parent: 'Mid' }),
        ])
        expect(rows[2]).toMatchObject({ status: 'ready', parentPath: 'Top:Mid' })
    })

    it('errors a bare name that matches two accounts with "ambiguous parent"', () => {
        const other = existing({ id: 'o1', name: 'Other' })
        const cash2 = existing({ id: 'c2', name: 'Checking', parent: 'o1' })
        const [r] = preview(
            [row({ name: 'Petty', parent: 'Checking' })],
            [assets, checking, other, cash2]
        )
        expect(r).toMatchObject({ status: 'error', reason: 'ambiguous parent' })
    })

    it('resolves the same duplicated name when given as a full path', () => {
        const other = existing({ id: 'o1', name: 'Other' })
        const cash2 = existing({ id: 'c2', name: 'Checking', parent: 'o1' })
        const [r] = preview(
            [row({ name: 'Petty', parent: 'Other:Checking' })],
            [assets, checking, other, cash2]
        )
        expect(r).toMatchObject({ status: 'ready', parentPath: 'Other:Checking' })
    })

    it('treats an ambiguous bare name across an existing and an imported account as ambiguous', () => {
        const other = existing({ id: 'o1', name: 'Other' })
        const rows = preview(
            [
                row({ name: 'Other2' }),
                row({ name: 'Checking', parent: 'Other2' }),
                row({ name: 'Petty', parent: 'Checking' }),
            ],
            [assets, checking, other]
        )
        expect(rows[2]).toMatchObject({ status: 'error', reason: 'ambiguous parent' })
    })

    it('errors a parent that matches nothing with "parent not found"', () => {
        const [r] = preview([row({ name: 'Petty', parent: 'Nowhere' })], [assets])
        expect(r).toMatchObject({ status: 'error', reason: 'parent not found' })
    })

    it('errors a parent of a different type', () => {
        const [r] = preview(
            [row({ name: 'Rent', type: 'expense', detail: 'rent_lease', parent: 'Assets' })],
            [assets]
        )
        expect(r.status).toBe('error')
        expect(r.reason).toMatch(/type/i)
    })

    it('errors an imported parent of a different type', () => {
        const rows = preview([
            row({ name: 'Top' }),
            row({ name: 'Rent', type: 'expense', detail: 'rent_lease', parent: 'Top' }),
        ])
        expect(rows[0].status).toBe('ready')
        expect(rows[1].status).toBe('error')
        expect(rows[1].reason).toMatch(/type/i)
    })

    it('allows depth 5 and errors depth 6 (1-based, top-level is 1)', () => {
        const chain = [
            existing({ id: 'd1', name: 'L1' }),
            existing({ id: 'd2', name: 'L2', parent: 'd1' }),
            existing({ id: 'd3', name: 'L3', parent: 'd2' }),
            existing({ id: 'd4', name: 'L4', parent: 'd3' }),
            existing({ id: 'd5', name: 'L5', parent: 'd4' }),
        ]
        const [atFive, atSix] = preview(
            [
                row({ name: 'New5', parent: 'L1:L2:L3:L4' }),
                row({ name: 'New6', parent: 'L1:L2:L3:L4:L5' }),
            ],
            chain
        )
        expect(atFive).toMatchObject({ status: 'ready', reason: null })
        expect(atSix.status).toBe('error')
        expect(atSix.reason).toMatch(/depth|level/i)
    })

    it('counts depth through imported parents', () => {
        const names = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6']
        const rows = preview(
            names.map((name, i) => row({ name, parent: names.slice(0, i).join(':') }))
        )
        expect(rows.slice(0, 5).map(r => r.status)).toEqual([
            'ready',
            'ready',
            'ready',
            'ready',
            'ready',
        ])
        expect(rows[5].status).toBe('error')
        expect(rows[5].reason).toMatch(/depth|level/i)
    })
})

describe('buildImportPreview: imported parent status', () => {
    it('errors a child whose imported parent row is an error', () => {
        const rows = preview([
            row({ name: 'Top', type: 'Banana' }),
            row({ name: 'Kid', parent: 'Top' }),
        ])
        expect(rows[0].status).toBe('error')
        expect(rows[1]).toMatchObject({ status: 'error', reason: 'parent row has an error' })
    })

    it('passes the parent error down to a grandchild', () => {
        const rows = preview([
            row({ name: 'Top', type: 'Banana' }),
            row({ name: 'Kid', parent: 'Top' }),
            row({ name: 'Grandkid', parent: 'Top:Kid' }),
        ])
        expect(rows[2]).toMatchObject({ status: 'error', reason: 'parent row has an error' })
    })

    it('resolves a child of a skipped parent to the existing account', () => {
        const rows = preview(
            [row({ name: 'Assets' }), row({ name: 'Petty', parent: 'Assets' })],
            [existing({ id: 'a1', name: 'Assets' })]
        )
        expect(rows[0]).toMatchObject({ status: 'skipped', reason: 'already exists' })
        expect(rows[1]).toMatchObject({ status: 'ready', reason: null, parentPath: 'Assets' })
    })

    it('resolves a grandchild under a skipped nested parent to the existing path', () => {
        const ex = [
            existing({ id: 'a1', name: 'Assets' }),
            existing({ id: 'a2', name: 'Bank', parent: 'a1' }),
        ]
        const rows = preview(
            [
                row({ name: 'Bank', parent: 'Assets' }),
                row({ name: 'Petty', parent: 'Assets:Bank' }),
            ],
            ex
        )
        expect(rows[0]).toMatchObject({ status: 'skipped', reason: 'already exists' })
        expect(rows[1]).toMatchObject({ status: 'ready', parentPath: 'Assets:Bank' })
    })

    it('errors two rows that name each other as parent with "parent cycle"', () => {
        const rows = preview([row({ name: 'A', parent: 'B' }), row({ name: 'B', parent: 'A' })])
        expect(rows.map(r => [r.status, r.reason])).toEqual([
            ['error', 'parent cycle'],
            ['error', 'parent cycle'],
        ])
    })

    it('errors a row that names itself as parent with "parent cycle"', () => {
        const [r] = preview([row({ name: 'A', parent: 'A' })])
        expect(r).toMatchObject({ status: 'error', reason: 'parent cycle' })
    })

    it('errors every row in a three-row cycle', () => {
        const rows = preview([
            row({ name: 'A', parent: 'C' }),
            row({ name: 'B', parent: 'A' }),
            row({ name: 'C', parent: 'B' }),
        ])
        expect(rows.map(r => r.reason)).toEqual(['parent cycle', 'parent cycle', 'parent cycle'])
    })
})

describe('buildImportPreview: precedence and duplicates', () => {
    const assets = existing({ id: 'a1', name: 'Assets', number: '1000' })

    it('skips a row whose (parent, name) already exists', () => {
        const [r] = preview([row({ name: 'Assets' })], [assets])
        expect(r).toMatchObject({ status: 'skipped', reason: 'already exists' })
    })

    it('skips an existing (parent, name) even when its number duplicates another existing account', () => {
        const other = existing({ id: 'o1', name: 'Other', number: '2000' })
        const [r] = preview([row({ name: 'Assets', number: '2000' })], [assets, other])
        expect(r).toMatchObject({ status: 'skipped', reason: 'already exists' })
    })

    it('skips an existing (parent, name) when the number matches itself', () => {
        const [r] = preview([row({ name: 'Assets', number: '1000' })], [assets])
        expect(r).toMatchObject({ status: 'skipped', reason: 'already exists' })
    })

    it('skips an existing child by (parent path, name)', () => {
        const ex = [assets, existing({ id: 'a2', name: 'Cash', parent: 'a1' })]
        const [r] = preview([row({ name: 'Cash', parent: 'Assets' })], ex)
        expect(r).toMatchObject({ status: 'skipped', reason: 'already exists' })
    })

    it('does not treat the same name under another parent as existing', () => {
        const ex = [assets, existing({ id: 'a2', name: 'Cash', parent: 'a1' })]
        const [r] = preview([row({ name: 'Cash' })], ex)
        expect(r).toMatchObject({ status: 'ready' })
    })

    it('errors the later row when (parent, name) repeats an earlier row in the file', () => {
        const rows = preview([
            row({ name: 'Cash', number: '1' }),
            row({ name: 'Cash', number: '2' }),
        ])
        expect(rows[0].status).toBe('ready')
        expect(rows[1].status).toBe('error')
        expect(rows[1].reason).toMatch(/duplicate/i)
        expect(rows[1].reason).not.toBe('already exists')
    })

    it('treats names as repeated when they differ only in case', () => {
        const rows = preview([row({ name: 'Cash' }), row({ name: 'CASH' })])
        expect(rows[0].status).toBe('ready')
        expect(rows[1].status).toBe('error')
    })

    it('allows the same name under different parents in the file', () => {
        const rows = preview([
            row({ name: 'A' }),
            row({ name: 'B' }),
            row({ name: 'Cash', parent: 'A' }),
            row({ name: 'Cash', parent: 'B' }),
        ])
        expect(rows.map(r => r.status)).toEqual(['ready', 'ready', 'ready', 'ready'])
    })

    it('errors the later row on a duplicate number within the file', () => {
        const rows = preview([
            row({ name: 'A', number: '1000' }),
            row({ name: 'B', number: '1000' }),
        ])
        expect(rows[0].status).toBe('ready')
        expect(rows[1].status).toBe('error')
        expect(rows[1].reason).toMatch(/number/i)
    })

    it('does not count blank numbers as duplicates', () => {
        const rows = preview(
            [row({ name: 'A' }), row({ name: 'B' })],
            [existing({ id: 'x', name: 'X' })]
        )
        expect(rows.map(r => r.status)).toEqual(['ready', 'ready'])
    })

    it('errors a number that duplicates an existing account with a different name', () => {
        const [r] = preview([row({ name: 'Brand new', number: '1000' })], [assets])
        expect(r.status).toBe('error')
        expect(r.reason).toMatch(/number/i)
    })

    it('does not let an errored row reserve its number', () => {
        const rows = preview([
            row({ name: 'A', type: 'Banana', number: '5' }),
            row({ name: 'B', number: '5' }),
        ])
        expect(rows[0].status).toBe('error')
        expect(rows[1].status).toBe('ready')
    })

    it('does not let a skipped row reserve its number against a later row', () => {
        const rows = preview(
            [row({ name: 'Assets', number: '7' }), row({ name: 'Other', number: '7' })],
            [assets]
        )
        expect(rows[0].status).toBe('skipped')
        expect(rows[1].status).toBe('ready')
    })

    it('gives the same result for the same rows regardless of file order', () => {
        const a = row({ name: 'Top' })
        const b = row({ name: 'Mid', parent: 'Top' })
        const c = row({ name: 'Leaf', parent: 'Top:Mid' })
        const forward = preview([a, b, c])
        const reversed = preview([c, b, a])
        const byName = (rows: typeof forward) =>
            Object.fromEntries(rows.map(r => [r.name, [r.status, r.parentPath]]))
        expect(byName(reversed)).toEqual(byName(forward))
        expect(byName(reversed)).toEqual({
            Top: ['ready', ''],
            Mid: ['ready', 'Top'],
            Leaf: ['ready', 'Top:Mid'],
        })
    })
})

describe('orderForInsert', () => {
    it('excludes error and skipped rows', () => {
        const rows = preview(
            [row({ name: 'Keep' }), row({ name: 'Bad', type: 'Banana' }), row({ name: 'Have' })],
            [existing({ id: 'h', name: 'Have' })]
        )
        expect(rows.map(r => r.status)).toEqual(['ready', 'error', 'skipped'])
        expect(orderForInsert(rows).map(r => r.name)).toEqual(['Keep'])
    })

    it('puts a parent before its child even when the file lists the child first', () => {
        const rows = preview([
            row({ name: 'Leaf', parent: 'Top:Mid' }),
            row({ name: 'Mid', parent: 'Top' }),
            row({ name: 'Top' }),
        ])
        expect(orderForInsert(rows).map(r => r.name)).toEqual(['Top', 'Mid', 'Leaf'])
    })

    it('keeps file order among rows at the same depth', () => {
        const rows = preview([
            row({ name: 'Kid1', parent: 'P' }),
            row({ name: 'P' }),
            row({ name: 'Kid2', parent: 'P' }),
            row({ name: 'Q' }),
        ])
        expect(orderForInsert(rows).map(r => r.name)).toEqual(['P', 'Q', 'Kid1', 'Kid2'])
    })

    it('returns an empty list when no row is ready', () => {
        expect(orderForInsert(preview([row({ name: '' })]))).toEqual([])
    })
})

describe('importExampleCsv', () => {
    it('auto-matches every column and every row is ready against an empty chart', () => {
        const { header, rows } = parseCsv(importExampleCsv)
        expect(header.length).toBeGreaterThan(0)
        expect(rows.length).toBeGreaterThan(0)
        const map = autoMatchColumns(header)
        const mapped = Object.values(map).filter((v): v is number => v !== null)
        expect([...mapped].sort()).toEqual(header.map((_, i) => i).sort())
        const result = buildImportPreview({ rows, columnMap: map, existing: [] })
        expect(result.map(r => [r.status, r.reason])).toEqual(result.map(() => ['ready', null]))
    })
})

const longText = (n: number) => 'x'.repeat(n)

describe('buildImportPreview: names containing a colon', () => {
    // Real depth 3: "A:a:b" > "C:c" > "D". Path segments would count 6.
    const chain = [
        existing({ id: 'e1', name: 'A:a:b' }),
        existing({ id: 'e2', name: 'C:c', parent: 'e1' }),
        existing({ id: 'e3', name: 'D', parent: 'e2' }),
    ]

    it('counts depth by parent links, not by path segments', () => {
        const [child] = preview([row({ name: 'Kid', parent: 'D' })], chain)
        expect(child.status).toBe('ready')
        expect(child.reason).toBeNull()
        expect(child.parentPath).toBe('A:a:b:C:c:D')
    })

    it('still errors at real depth 6', () => {
        const rows = preview(
            [
                row({ name: 'L4', parent: 'D' }),
                row({ name: 'L5', parent: 'L4' }),
                row({ name: 'L6', parent: 'L5' }),
            ],
            chain
        )
        expect(rows.map(r => r.status)).toEqual(['ready', 'ready', 'error'])
        expect(rows[2].reason).toMatch(/depth/i)
    })

    it('resolves a parent whose name contains a colon by its bare name', () => {
        const ex = [existing({ id: 'e1', name: 'Cash: Main' })]
        const [child] = preview([row({ name: 'Kid', parent: 'Cash: Main' })], ex)
        expect(child.status).toBe('ready')
        expect(child.parentPath).toBe('Cash: Main')
    })

    it('resolves an imported parent whose name contains a colon', () => {
        const rows = preview([
            row({ name: 'Kid', parent: 'Ops: East' }),
            row({ name: 'Ops: East' }),
        ])
        expect(rows.map(r => r.status)).toEqual(['ready', 'ready'])
        expect(rows[0].parentPath).toBe('Ops: East')
    })

    it('orders parents first when names contain colons', () => {
        const rows = preview([
            row({ name: 'Kid', parent: 'Ops: East' }),
            row({ name: 'Ops: East' }),
        ])
        expect(orderForInsert(rows).map(r => r.name)).toEqual(['Ops: East', 'Kid'])
    })
})

describe('buildImportPreview: field limits', () => {
    it('errors a name over 200 characters and accepts exactly 200', () => {
        const [over, at] = preview([row({ name: longText(201) }), row({ name: longText(200) })])
        expect(over.status).toBe('error')
        expect(over.reason).toBe('name too long')
        expect(at.status).toBe('ready')
    })

    it('errors a number with characters outside [0-9A-Za-z.-]', () => {
        for (const number of ['10 00', '10_00', '10:00', '10/00', '1é']) {
            const [r] = preview([row({ number })])
            expect(r.status, number).toBe('error')
            expect(r.reason, number).toBe('number invalid')
        }
    })

    it('errors a number over 20 characters and accepts exactly 20', () => {
        const [over, at] = preview([
            row({ number: '1'.repeat(21) }),
            row({ name: 'Other', number: '1'.repeat(20) }),
        ])
        expect(over.reason).toBe('number invalid')
        expect(at.status).toBe('ready')
    })

    it('accepts letters, digits, dot and hyphen in a number', () => {
        const [r] = preview([row({ number: 'AB-1.2z' })])
        expect(r.status).toBe('ready')
    })

    it('errors a description over 1000 characters and accepts exactly 1000', () => {
        const [over, at] = preview([
            row({ description: longText(1001) }),
            row({ name: 'Other', description: longText(1000) }),
        ])
        expect(over.status).toBe('error')
        expect(over.reason).toBe('description too long')
        expect(at.status).toBe('ready')
    })

    it('checks limits after the type rules and before parent checks', () => {
        const [badType, badParent] = preview([
            row({ name: longText(201), type: 'nope' }),
            row({ name: longText(201), parent: 'Missing' }),
        ])
        expect(badType.reason).toBe('unknown type')
        expect(badParent.reason).toBe('name too long')
    })
})

describe('buildImportPreview: parent text equal to own name', () => {
    it('resolves to the existing account of that name', () => {
        const ex = [existing({ id: 'e1', name: 'Cash' })]
        const [r] = preview([row({ name: 'Cash', parent: 'Cash' })], ex)
        expect(r.status).toBe('ready')
        expect(r.reason).toBeNull()
        expect(r.parentPath).toBe('Cash')
    })

    it('is a parent cycle without an existing account', () => {
        const [r] = preview([row({ name: 'Cash', parent: 'Cash' })])
        expect(r.status).toBe('error')
        expect(r.reason).toBe('parent cycle')
    })
})

describe('buildImportPreview: performance', () => {
    const existingMany = Array.from({ length: 3000 }, (_, i) =>
        existing({ id: `x${i}`, name: `Existing ${i}`, number: `E${i}` })
    )

    it('resolves a 2000-row reversed chain against 3000 existing accounts in under 1500 ms', () => {
        const rows = Array.from({ length: 2000 }, (_, i) =>
            row({ name: `N${i}`, parent: i < 1999 ? `N${i + 1}` : '' })
        )
        const start = performance.now()
        const result = preview(rows, existingMany)
        const elapsed = performance.now() - start
        expect(result).toHaveLength(2000)
        expect(elapsed).toBeLessThan(1500)
    })

    it('resolves a valid reversed 2000-row file in under 500 ms', () => {
        const rows: string[][] = []
        for (let g = 0; g < 400; g++) {
            for (let level = 5; level >= 1; level--) {
                rows.push(
                    row({
                        name: `G${g}L${level}`,
                        parent: level === 1 ? '' : `G${g}L${level - 1}`,
                    })
                )
            }
        }
        const start = performance.now()
        const result = preview(rows, existingMany)
        const elapsed = performance.now() - start
        expect(result.every(r => r.status === 'ready')).toBe(true)
        expect(elapsed).toBeLessThan(500)
    })
})

describe('buildImportPreview: ASCII-only case folding of names', () => {
    it('does not treat accented names with different case as duplicates of existing', () => {
        const ex = [existing({ id: 'e1', name: 'élan' })]
        const [r] = preview([row({ name: 'Élan' })], ex)
        expect(r.status).toBe('ready')
    })

    it('does not treat accented names with different case as duplicates in the file', () => {
        const rows = preview([row({ name: 'élan' }), row({ name: 'Élan' })])
        expect(rows.map(r => r.status)).toEqual(['ready', 'ready'])
    })

    it('still skips an ASCII case variant of an existing name', () => {
        const ex = [existing({ id: 'e1', name: 'cash' })]
        const [r] = preview([row({ name: 'CASH' })], ex)
        expect(r.status).toBe('skipped')
        expect(r.reason).toBe('already exists')
    })

    it('still errors an ASCII case variant repeated in the file', () => {
        const rows = preview([row({ name: 'Cash' }), row({ name: 'cash' })])
        expect(rows[0].status).toBe('ready')
        expect(rows[1].status).toBe('error')
        expect(rows[1].reason).toBe('duplicate name under one parent')
    })
})

describe('buildImportPreview: errors that free names and numbers', () => {
    it('reports a child of a duplicate-number row as having a parent error', () => {
        const rows = preview([
            row({ name: 'A', number: '1' }),
            row({ name: 'B', number: '1' }),
            row({ name: 'Kid', parent: 'B' }),
        ])
        expect(rows[1].reason).toBe('duplicate number in file')
        expect(rows[2].status).toBe('error')
        expect(rows[2].reason).toBe('parent row has an error')
    })

    it('frees a number when its holder fails through an errored parent, across rounds', () => {
        const rows = preview([
            row({ name: 'P', number: '1' }),
            row({ name: 'Z', number: '1' }),
            row({ name: 'Y', number: '2', parent: 'Z' }),
            row({ name: 'X', number: '2' }),
            row({ name: 'W', parent: 'X' }),
        ])
        expect(rows.map(r => [r.status, r.reason])).toEqual([
            ['ready', null],
            ['error', 'duplicate number in file'],
            ['error', 'parent row has an error'],
            ['ready', null],
            ['ready', null],
        ])
    })
})

describe('buildImportPreview: parent candidates on the resolver stack', () => {
    const bankX = existing({ id: 'x', name: 'X' })
    const bankXA = existing({ id: 'xa', name: 'A', parent: 'x' })

    it('does not call a row a cycle when its parent text cannot be the other row path', () => {
        const rows = preview(
            [row({ name: 'A', parent: 'B' }), row({ name: 'B', parent: 'X:A' })],
            [bankX, bankXA]
        )
        expect(rows.map(r => r.reason)).toEqual([null, null])
        expect(rows[1]).toMatchObject({ status: 'ready', parentPath: 'X:A' })
        expect(rows[0]).toMatchObject({ status: 'ready', parentPath: 'X:A:B' })
    })

    it('gives the same answer with the two rows swapped', () => {
        const rows = preview(
            [row({ name: 'B', parent: 'X:A' }), row({ name: 'A', parent: 'B' })],
            [bankX, bankXA]
        )
        expect(rows.map(r => r.reason)).toEqual([null, null])
        expect(rows[0]).toMatchObject({ status: 'ready', parentPath: 'X:A' })
        expect(rows[1]).toMatchObject({ status: 'ready', parentPath: 'X:A:B' })
    })

    it('reports parent not found, not a cycle, when the path has no matching row', () => {
        const rows = preview([
            row({ name: 'A', parent: 'B' }),
            row({ name: 'B', parent: 'Q:A' }),
            row({ name: 'Q' }),
        ])
        expect(rows[1]).toMatchObject({ status: 'error', reason: 'parent not found' })
        expect(rows[0]).toMatchObject({ status: 'error', reason: 'parent row has an error' })
        expect(rows[2]).toMatchObject({ status: 'ready', reason: null })
    })

    it('finds no cycle among same-named rows under different parents', () => {
        const exp = (id: string, name: string) => existing({ id, name, type: 'expense' })
        const expense = (name: string, parent: string) =>
            row({ name, type: 'expense', detail: 'rent_lease', parent })
        const rows = preview(
            [
                expense('Phone', 'Expenses:Office'),
                expense('Phone', 'Rent'),
                expense('Office', 'Expenses'),
                expense('Office', 'Rent:Phone'),
            ],
            [exp('ex', 'Expenses'), exp('rt', 'Rent')]
        )
        expect(rows.map(r => r.reason)).not.toContain('parent cycle')
        expect(rows.map(r => [r.status, r.parentPath])).toEqual([
            ['ready', 'Expenses:Office'],
            ['ready', 'Rent'],
            ['ready', 'Expenses'],
            ['ready', 'Rent:Phone'],
        ])
    })

    it('still detects a two-row cycle, a self-parent and a cycle with a dependent', () => {
        const two = preview([row({ name: 'A', parent: 'B' }), row({ name: 'B', parent: 'A' })])
        expect(two.map(r => r.reason)).toEqual(['parent cycle', 'parent cycle'])
        const [self] = preview([row({ name: 'A', parent: 'A' })])
        expect(self.reason).toBe('parent cycle')
        const dep = preview([
            row({ name: 'A', parent: 'C' }),
            row({ name: 'B', parent: 'A' }),
            row({ name: 'C', parent: 'B' }),
            row({ name: 'D', parent: 'A' }),
        ])
        expect(dep.slice(0, 3).map(r => r.reason)).toEqual([
            'parent cycle',
            'parent cycle',
            'parent cycle',
        ])
        expect(dep[3]).toMatchObject({ status: 'error', reason: 'parent row has an error' })
    })

    it('resolves 2000 self-named rows with self parents with bounded work, none ready', () => {
        const rows = Array.from({ length: 2000 }, () => row({ name: 'A', parent: 'A' }))
        const result = preview(rows)
        expect(result).toHaveLength(2000)
        expect(result.every(r => r.status === 'error')).toBe(true)
        expect(
            result.every(r =>
                [
                    'parent cycle',
                    'duplicate name under one parent',
                    'parent row has an error',
                    'ambiguous parent',
                ].includes(r.reason ?? '')
            )
        ).toBe(true)
    })
})

describe('resolveRows: work on self-named rows with self parents', () => {
    const selfNamed = (n: number): RowInput[] =>
        Array.from({ length: n }, () => ({
            name: 'A',
            typeKey: 'expense',
            parentRaw: 'A',
            fieldError: null,
        }))

    function work(n: number): ResolveStats {
        const stats = { scanned: 0, lookups: 0 }
        resolveRows(selfNamed(n), [], stats)
        return stats
    }

    it('looks each row up a constant number of times and scans at most quadratically', () => {
        const small = work(500)
        const large = work(2000)
        expect(small.lookups).toBeLessThanOrEqual(3 * 500)
        expect(large.lookups).toBeLessThanOrEqual(3 * 2000)
        // Measured: 3.5 * n^2 scans (the cycle pass compares every same-named row).
        expect(large.scanned).toBeLessThanOrEqual(5 * 2000 * 2000)
        // 4x the rows may cost about 16x the scans, never the exponential or worse.
        expect(large.scanned / small.scanned).toBeLessThanOrEqual(20)
    })
})

describe('buildImportPreview: parent text is pruned by segment count', () => {
    const expense = (name: string, parent: string) =>
        row({ name, type: 'expense', detail: 'rent_lease', parent })

    function permutations<T>(items: T[]): T[][] {
        if (items.length < 2) return [items]
        return items.flatMap((item, i) =>
            permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest])
        )
    }

    const ring: [string, string][] = [
        ['Fees', ''],
        ['Bank', 'Fees'],
        ['Fees', 'Fees:Bank'],
        ['Bank', 'Fees:Bank:Fees'],
    ]
    const expectedPaths: Record<string, string> = {
        'Fees|': '',
        'Bank|Fees': 'Fees',
        'Fees|Fees:Bank': 'Fees:Bank',
        'Bank|Fees:Bank:Fees': 'Fees:Bank:Fees',
    }

    it('marks all four same-named nested rows ready with no cycle', () => {
        const rows = preview(ring.map(([n, p]) => expense(n, p)))
        expect(rows.map(r => r.reason)).toEqual([null, null, null, null])
        expect(rows.map(r => r.status)).toEqual(['ready', 'ready', 'ready', 'ready'])
        expect(rows.map(r => r.parentPath)).toEqual(['', 'Fees', 'Fees:Bank', 'Fees:Bank:Fees'])
    })

    it('gives the same per-row result in all 24 row orders', () => {
        const orders = permutations(ring)
        expect(orders).toHaveLength(24)
        for (const order of orders) {
            const rows = preview(order.map(([n, p]) => expense(n, p)))
            order.forEach(([n, p], i) => {
                const label = `${JSON.stringify(order)} @ ${n}|${p}`
                expect({ label, reason: rows[i].reason, status: rows[i].status }).toEqual({
                    label,
                    reason: null,
                    status: 'ready',
                })
                expect({ label, path: rows[i].parentPath }).toEqual({
                    label,
                    path: expectedPaths[`${n}|${p}`],
                })
            })
        }
    })

    it('matches a k-segment parent text only to a row whose path has k segments', () => {
        const rows = preview([expense('A', ''), expense('B', 'A'), expense('B', 'A:B:C')])
        expect(rows[2]).toMatchObject({ status: 'error', reason: 'parent not found' })
        expect(rows.map(r => r.reason)).not.toContain('parent cycle')
        expect(rows.map(r => r.reason)).not.toContain('ambiguous parent')
        expect(rows[0]).toMatchObject({ status: 'ready', reason: null, parentPath: '' })
        expect(rows[1]).toMatchObject({ status: 'ready', reason: null, parentPath: 'A' })
    })

    it('leaves the other rows unchanged compared with leaving the third row out', () => {
        const without = preview([expense('A', ''), expense('B', 'A')])
        const withThird = preview([expense('A', ''), expense('B', 'A'), expense('B', 'A:B:C')])
        expect(withThird.slice(0, 2)).toEqual(without)
    })

    it('keeps detecting real cycles (two-row, self, three-row with dependent)', () => {
        const two = preview([expense('A', 'B'), expense('B', 'A')])
        expect(two.map(r => r.reason)).toEqual(['parent cycle', 'parent cycle'])
        const [self] = preview([expense('A', 'A')])
        expect(self.reason).toBe('parent cycle')
        const dep = preview([
            expense('A', 'C'),
            expense('B', 'A'),
            expense('C', 'B'),
            expense('D', 'A'),
        ])
        expect(dep.slice(0, 3).map(r => r.reason)).toEqual([
            'parent cycle',
            'parent cycle',
            'parent cycle',
        ])
        expect(dep[3]).toMatchObject({ status: 'error', reason: 'parent row has an error' })
    })
})
