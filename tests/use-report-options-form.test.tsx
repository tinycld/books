// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { useController } from '@tinycld/core/ui/form'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReportOptionsForm } from '../tinycld/books/hooks/useReportOptionsForm'
import type { ReportSpec } from '../tinycld/books/lib/report-definition'
import { parseReportParams, type ReportParams } from '../tinycld/books/lib/report-options'
import {
    AS_OF_PRESET_IDS,
    type PeriodContext,
    RANGE_PRESET_IDS,
} from '../tinycld/books/lib/report-period'

// The URL holds the last valid options, and the screen parses them again on every render
// against a context read at render time. A named preset is stored by name, so when the day
// rolls over or the fiscal start month changes, `options.period` moves while the form stays
// mounted. The date fields of a named preset show that period, and Custom starts from it.

const AS_OF_SPEC: ReportSpec = {
    id: 'as-of-report',
    title: 'As-of report',
    period: { kind: 'as-of', presets: AS_OF_PRESET_IDS, defaultPreset: 'end-of-last-month' },
    hasBasis: false,
    rowsChoice: { default: 'non-zero' },
    filters: [{ id: 'account', label: 'Account', kind: 'accounts' }],
}

const RANGE_SPEC: ReportSpec = {
    id: 'range-report',
    title: 'Range report',
    period: {
        kind: 'range',
        presets: RANGE_PRESET_IDS,
        defaultPreset: 'this-fiscal-year-to-date',
        maxMonths: 12,
    },
    hasBasis: true,
    rowsChoice: { default: 'active' },
}

type Props = { definition: ReportSpec; params: ReportParams; context: PeriodContext }

// What useReportScreen gives the hook: the options parsed from the URL with this render's context.
function renderOptionsForm(initial: Props) {
    return renderHook(
        ({ definition, params, context }: Props) =>
            useReportOptionsForm({
                definition,
                options: parseReportParams(definition, params, context),
                context,
            }),
        { initialProps: initial }
    )
}

beforeEach(() => {
    vi.mocked(router.setParams).mockClear()
})

describe('useReportOptionsForm dates of a named preset', () => {
    it('follows options.period when the day rolls over, and Custom starts from the new day', async () => {
        const params = { preset: 'today' }
        const { result, rerender } = renderOptionsForm({
            definition: AS_OF_SPEC,
            params,
            context: { today: '2026-10-25', fiscalStartMonth: 1 },
        })
        expect(result.current.preset).toBe('today')
        expect(result.current.pendingTo).toBe('2026-10-25')

        rerender({
            definition: AS_OF_SPEC,
            params,
            context: { today: '2026-10-26', fiscalStartMonth: 1 },
        })
        expect(result.current.preset).toBe('today')
        expect(result.current.pendingTo).toBe('2026-10-26')

        await act(async () => result.current.onPreset('custom'))
        expect(result.current.preset).toBe('custom')
        expect(result.current.pendingTo).toBe('2026-10-26')
        await waitFor(() =>
            expect(router.setParams).toHaveBeenLastCalledWith(
                expect.objectContaining({ preset: undefined, to: '2026-10-26' })
            )
        )
    })

    it('follows options.period when the fiscal start month changes, and Custom starts from it', async () => {
        const params = { preset: 'this-fiscal-year-to-date' }
        const { result, rerender } = renderOptionsForm({
            definition: RANGE_SPEC,
            params,
            context: { today: '2026-10-25', fiscalStartMonth: 1 },
        })
        expect(result.current.pendingFrom).toBe('2026-01-01')
        expect(result.current.pendingTo).toBe('2026-10-25')

        rerender({
            definition: RANGE_SPEC,
            params,
            context: { today: '2026-10-25', fiscalStartMonth: 7 },
        })
        expect(result.current.preset).toBe('this-fiscal-year-to-date')
        expect(result.current.pendingFrom).toBe('2026-07-01')
        expect(result.current.pendingTo).toBe('2026-10-25')

        await act(async () => result.current.onPreset('custom'))
        expect(result.current.pendingFrom).toBe('2026-07-01')
        expect(result.current.pendingTo).toBe('2026-10-25')
        await waitFor(() =>
            expect(router.setParams).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    preset: undefined,
                    from: '2026-07-01',
                    to: '2026-10-25',
                })
            )
        )
    })
})

// The method toggle sets `basis` through the form's control and then calls onOptionChange,
// so this harness does the same with the real useController.
function renderWithBasis(initial: Props) {
    return renderHook(
        ({ definition, params, context }: Props) => {
            const form = useReportOptionsForm({
                definition,
                options: parseReportParams(definition, params, context),
                context,
            })
            const basis = useController({ control: form.control, name: 'basis' })
            const chooseBasis = (value: 'accrual' | 'cash') => {
                basis.field.onChange(value)
                form.onOptionChange()
            }
            return { ...form, chooseBasis }
        },
        { initialProps: initial }
    )
}

describe('useReportOptionsForm discardEdit', () => {
    const MARCH = { from: '2026-03-01', to: '2026-03-31' }
    const CONTEXT = { today: '2026-10-25', fiscalStartMonth: 1 }

    it('invalid edit then discard then option change writes the last valid period', async () => {
        const { result } = renderWithBasis({
            definition: RANGE_SPEC,
            params: MARCH,
            context: CONTEXT,
        })

        await act(async () => result.current.onDateChange('from', '2026-02-30'))
        await waitFor(() => expect(result.current.errors.from).toBeDefined())
        expect(router.setParams).not.toHaveBeenCalled()

        await act(async () => result.current.discardEdit())
        expect(result.current.errors.from).toBeUndefined()
        expect(result.current.pendingFrom).toBe('2026-03-01')

        await act(async () => result.current.chooseBasis('cash'))
        await waitFor(() =>
            expect(router.setParams).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    basis: 'cash',
                    preset: undefined,
                    from: '2026-03-01',
                    to: '2026-03-31',
                })
            )
        )
    })

    it('a valid edit survives discard before the screen re-renders with the new URL', async () => {
        const { result } = renderWithBasis({
            definition: RANGE_SPEC,
            params: MARCH,
            context: CONTEXT,
        })

        await act(async () => result.current.onDateChange('from', '2026-03-15'))
        await waitFor(() =>
            expect(router.setParams).toHaveBeenLastCalledWith(
                expect.objectContaining({ from: '2026-03-15', to: '2026-03-31' })
            )
        )

        // The params prop still holds March 1: the URL write has not re-rendered the screen yet.
        await act(async () => result.current.discardEdit())
        expect(result.current.pendingFrom).toBe('2026-03-15')

        await act(async () => result.current.chooseBasis('cash'))
        await waitFor(() =>
            expect(router.setParams).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    basis: 'cash',
                    preset: undefined,
                    from: '2026-03-15',
                    to: '2026-03-31',
                })
            )
        )
    })

    // discardEdit runs in the same tick as the keystroke when the period surface closes, so it
    // must decide from the current values, not from the errors of the last render.
    it('an invalid edit and a discard in the same tick drop the edit', async () => {
        const { result } = renderWithBasis({
            definition: RANGE_SPEC,
            params: MARCH,
            context: CONTEXT,
        })

        await act(async () => {
            result.current.onDateChange('from', '2026-02-30')
            result.current.discardEdit()
        })
        expect(result.current.errors.from).toBeUndefined()
        expect(result.current.pendingFrom).toBe('2026-03-01')
        expect(router.setParams).not.toHaveBeenCalled()

        await act(async () => result.current.chooseBasis('cash'))
        await waitFor(() =>
            expect(router.setParams).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    basis: 'cash',
                    preset: undefined,
                    from: '2026-03-01',
                    to: '2026-03-31',
                })
            )
        )
    })

    it('a valid last keystroke after a partial date survives a discard in the same tick', async () => {
        const { result } = renderWithBasis({
            definition: RANGE_SPEC,
            params: MARCH,
            context: CONTEXT,
        })

        await act(async () => result.current.onDateChange('from', '2026-03-1'))
        await waitFor(() => expect(result.current.errors.from).toBeDefined())

        await act(async () => {
            result.current.onDateChange('from', '2026-03-15')
            result.current.discardEdit()
        })
        expect(result.current.errors.from).toBeUndefined()
        expect(result.current.pendingFrom).toBe('2026-03-15')
        await waitFor(() =>
            expect(router.setParams).toHaveBeenLastCalledWith(
                expect.objectContaining({ from: '2026-03-15', to: '2026-03-31' })
            )
        )
    })
})
