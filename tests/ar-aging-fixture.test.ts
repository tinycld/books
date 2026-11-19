import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import { describe, expect, it } from 'vitest'
import {
    AR_AGING_DESCRIPTION,
    AR_AGING_DISPLAY,
    AR_AGING_PARAMS,
    AR_AGING_TITLE,
} from '../tinycld/books/lib/ar-aging-fixture'

type ArAgingSpecFile = {
    title: string
    description: string
    params: ParamDef[]
    display: NonNullable<ReportSpec['display']>
}

// Plan D15: the Go shipped report and this fixture hold the same title, description,
// params and display. Both are compared with server/testdata/ar_aging_spec.json
// (TestARAgingMatchesSharedSpecFile reads it too), so a value changed on one side only
// fails one of the two tests.
const specFile: ArAgingSpecFile = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'ar_aging_spec.json'), 'utf8')
)

describe('A/R Aging fixture against the shared spec file', () => {
    it('has the title and the description the report ships with', () => {
        expect(AR_AGING_TITLE).toBe(specFile.title)
        expect(AR_AGING_DESCRIPTION).toBe(specFile.description)
    })

    it('has the params the report ships with', () => {
        expect(AR_AGING_PARAMS).toEqual(specFile.params)
    })

    it('draws the rows with the display the report ships with, its two layouts included', () => {
        expect(AR_AGING_DISPLAY).toEqual(specFile.display)
    })
})
