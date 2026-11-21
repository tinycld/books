import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ParamDef, ReportSpec } from '@tinycld/core/reports/lib/spec'
import { describe, expect, it } from 'vitest'
import {
    AP_AGING_DESCRIPTION,
    AP_AGING_DISPLAY,
    AP_AGING_EMPTY_DAY,
    AP_AGING_PARAMS,
    AP_AGING_TITLE,
} from '../tinycld/books/lib/ap-aging-fixture'

type ApAgingSpecFile = {
    title: string
    description: string
    emptyDay: string
    params: ParamDef[]
    display: NonNullable<ReportSpec['display']>
}

// Plan D11: the Go shipped report and this fixture hold the same title, description,
// params and display. Both are compared with server/testdata/ap_aging_spec.json
// (TestAPAgingMatchesSharedSpecFile reads it too), so a value changed on one side only
// fails one of the two tests.
const specFile: ApAgingSpecFile = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'ap_aging_spec.json'), 'utf8')
)

describe('A/P Aging fixture against the shared spec file', () => {
    it('has the title and the description the report ships with', () => {
        expect(AP_AGING_TITLE).toBe(specFile.title)
        expect(AP_AGING_DESCRIPTION).toBe(specFile.description)
    })

    it('has the params the report ships with', () => {
        expect(AP_AGING_PARAMS).toEqual(specFile.params)
    })

    it('draws the rows with the display the report ships with, its two layouts included', () => {
        expect(AP_AGING_DISPLAY).toEqual(specFile.display)
    })

    it('has the empty day TestAPAgingEmpty runs on', () => {
        expect(AP_AGING_EMPTY_DAY).toBe(specFile.emptyDay)
    })
})
