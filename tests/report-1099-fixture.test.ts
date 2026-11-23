import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import type { ResultRow } from '@tinycld/core/reports/lib/types'
import { describe, expect, it } from 'vitest'
import { BOX_1099_KEYS } from '../tinycld/books/lib/form-1099'
import {
    boxOpenKey,
    type FormChoice,
    type OrderChoice,
    REPORT_1099_COLUMNS,
    REPORT_1099_DESCRIPTION,
    REPORT_1099_DISPLAY,
    REPORT_1099_PARAMS,
    REPORT_1099_TITLE,
    report1099Result,
    type ShowChoice,
} from '../tinycld/books/lib/report-1099-fixture'
import { VENDORS_1099 } from '../tinycld/books/lib/vendor-1099-fixture'

type Form1099SpecFile = {
    title: string
    description: string
    params: ParamDef[]
    display: NonNullable<ReportSpec['display']>
}

// The Go shipped report and this fixture hold the same title, description, params and
// display. Both are compared with server/testdata/form_1099_spec.json
// (TestForm1099MatchesSharedSpecFile reads it too), so a value changed on one side only
// fails one of the two tests.
function readSpecFile(): Form1099SpecFile {
    return JSON.parse(
        readFileSync(join(__dirname, '..', 'server', 'testdata', 'form_1099_spec.json'), 'utf8')
    )
}

describe('1099 Summary and Detail fixture against the shared spec file', () => {
    it('has the title and the description the report ships with', () => {
        const specFile = readSpecFile()
        expect(REPORT_1099_TITLE).toBe(specFile.title)
        expect(REPORT_1099_DESCRIPTION).toBe(specFile.description)
    })

    it('has the params the report ships with', () => {
        expect(REPORT_1099_PARAMS).toEqual(readSpecFile().params)
    })

    it('draws the rows with the display the report ships with (plan D1)', () => {
        expect(REPORT_1099_DISPLAY).toEqual(readSpecFile().display)
    })
})

// Every box of every vendor of the fixture opened, so the results hold payment rows too.
const EVERY_BOX = VENDORS_1099.flatMap(vendor =>
    [...BOX_1099_KEYS, '' as const].map(box => boxOpenKey(vendor.display_name, box))
)

const SHOWS: ShowChoice[] = ['meets', 'below', 'tracked', 'untracked']
const FORMS: FormChoice[] = ['all', 'nec', 'misc']
const ORDERS: OrderChoice[] = ['name', 'amount']

const rowKind = (row: ResultRow) => {
    if (row.kind === 'group') return row.level === 1 ? 'vendor' : 'box'
    return row.kind === 'detail' ? 'payment' : row.kind
}

// Plan D7: Excluded is blank when zero on a payment, a box, a vendor and the Total row, as
// the run gives it through the hidden column excludedSum; a hidden column is in no result.
describe('REPORT_1099 Excluded cells', () => {
    it('no payment, box, vendor or Total row has an Excluded of 0: a zero is null', () => {
        const zeros: string[] = []
        const kinds = new Set<string>()
        for (const show of SHOWS) {
            for (const form of FORMS) {
                for (const order of ORDERS) {
                    const result = report1099Result({ show, form, order, openBoxes: EVERY_BOX })
                    for (const row of result.rows) {
                        kinds.add(rowKind(row))
                        if (row.cells.excluded === 0) {
                            zeros.push(`${show}/${form}/${order} ${rowKind(row)} ${row.label}`)
                        }
                    }
                }
            }
        }
        expect(zeros).toEqual([])
        // The check reads every row kind, so it holds for each of them.
        expect([...kinds].sort()).toEqual(['box', 'payment', 'total', 'vendor'])
    })

    it('a row with no excluded amount has a null Excluded, not a missing cell', () => {
        const below = report1099Result({ show: 'below' })
        const total = below.rows.find(row => row.kind === 'total')
        expect(total?.cells).toHaveProperty('excluded', null)
    })

    it('REPORT_1099_COLUMNS are the four shown columns, with no excludedSum', () => {
        expect(REPORT_1099_COLUMNS.map(column => column.id)).toEqual([
            'name',
            'reportable',
            'excluded',
            'all',
        ])
        expect(REPORT_1099_COLUMNS.map(column => column.id)).not.toContain('excludedSum')
    })

    // The run's excluded is blankZero(col("excludedSum")) with no aggregate (plan D7:
    // never a recompute sum of its own), so the fixture's column declares none either.
    it('the excluded column has no aggregate, as the run gives it', () => {
        const excluded = REPORT_1099_COLUMNS.find(column => column.id === 'excluded')
        expect(excluded).toBeDefined()
        expect(excluded).not.toHaveProperty('aggregate')
    })
})
