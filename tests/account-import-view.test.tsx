// @vitest-environment happy-dom
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
import { useForm } from '@tinycld/core/ui/form'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { getStringAsync } from 'expo-clipboard'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportView } from '../tinycld/books/components/accounts/import/ImportView'
import type { useAccountImport } from '../tinycld/books/hooks/useAccountImport'
import {
    type ColumnMap,
    IMPORT_FIELDS,
    type ImportRow,
    importExampleCsv,
} from '../tinycld/books/lib/account-import'
import { byTestId } from './accounts-test-rows'

type Flow = ReturnType<typeof useAccountImport>

const FULL_MAP: ColumnMap = {
    number: 0,
    name: 1,
    type: 2,
    detail_type: 3,
    parent: 4,
    description: 5,
    inactive: 6,
}

function previewRow(over: Partial<ImportRow> & Pick<ImportRow, 'line' | 'name'>): ImportRow {
    return {
        status: 'ready',
        reason: null,
        number: '',
        type: 'expense',
        detail_type: 'office_general',
        parentPath: '',
        description: '',
        inactive: false,
        ...over,
    }
}

const ROWS: ImportRow[] = [
    previewRow({ line: 1, name: 'Tools Co' }),
    previewRow({ line: 2, name: 'Reserve savings', status: 'skipped', reason: 'already exists' }),
    previewRow({ line: 3, name: 'Bogus', status: 'error', reason: 'unknown type' }),
]

// `mapForm` holds the column map as a react-hook-form instance whose field names are the
// ImportField keys (number, name, type, ...); `setColumn` writes a select's choice into it.
function mapFormOf(values: ColumnMap): Flow['mapForm'] {
    return renderHook(() => useForm<ColumnMap>({ defaultValues: values })).result.current
}

function flowOf(over: Partial<Flow> = {}): Flow {
    return {
        step: 1,
        fileError: null,
        header: [],
        columnMap: FULL_MAP,
        setColumn: vi.fn(),
        mapForm: mapFormOf(FULL_MAP),
        isRunning: false,
        preview: [],
        readyCount: 0,
        chooseFile: vi.fn(async () => {}),
        goToMap: vi.fn(),
        goToPreview: vi.fn(),
        runImport: vi.fn(async () => {}),
        progress: null,
        failure: null,
        result: null,
        reset: vi.fn(),
        ...over,
    }
}

function renderView(
    over: Partial<Flow> = {},
    props: { canWrite?: boolean; isReady?: boolean } = {}
) {
    const flow = flowOf(over)
    const view = render(
        <OverlayProvider>
            <ImportView
                canWrite={props.canWrite ?? true}
                isReady={props.isReady ?? true}
                flow={flow}
            />
        </OverlayProvider>
    )
    return { ...view, flow }
}

function isDisabled(el: HTMLElement | null) {
    return (
        el?.getAttribute('aria-disabled') === 'true' || el?.getAttribute('data-disabled') === 'true'
    )
}

beforeEach(() => {
    vi.mocked(router.push).mockClear()
    vi.mocked(router.replace).mockClear()
    vi.mocked(router.back).mockClear()
})

function pushedTargets() {
    return vi.mocked(router.push).mock.calls.map(call => call[0])
}

function clickText(container: HTMLElement, label: string) {
    const target = [...container.querySelectorAll('rn-text')].find(el => el.textContent === label)
    expect(target, label).toBeDefined()
    fireEvent.click(target as HTMLElement)
}

describe('UploadStep', () => {
    it('shows the rules, the example table and the balances note', () => {
        const { container } = renderView({ step: 1 })
        const text = container.textContent ?? ''
        expect(text).toMatch(/one file/i)
        expect(text).toMatch(/header row/i)
        expect(text).toContain('UTF-8')
        expect(text).toContain('2000 rows')
        expect(text).toContain('1 MB')
        expect(text).toContain('Imported balances are not supported')
        expect(text).toContain('Choose file')
        // The example table shows the example CSV's cells.
        expect(text).toContain('Operating account')
        expect(text).toContain('Consulting income')
        expect(text).toContain('Cash on hand')
        expect(container.querySelector('[data-testid="account-import-drop"]')).not.toBeNull()
    })

    it('Copy example writes importExampleCsv to the clipboard', async () => {
        const { container } = renderView({ step: 1 })
        const button = byTestId(container, 'account-import-copy-example')
        expect(button?.textContent).toContain('Copy example')
        fireEvent.click(button as HTMLElement)
        await waitFor(async () => expect(await getStringAsync()).toBe(importExampleCsv))
    })

    it('shows the file error', () => {
        const message = 'Only comma-separated (CSV) files are supported.'
        const { container } = renderView({ step: 1, fileError: message })
        expect(container.textContent).toContain(message)
    })

    it('has no Continue button on step 1, and keeps Cancel', () => {
        const { container } = renderView({ step: 1 })
        expect(byTestId(container, 'account-import-next')).toBeNull()
        expect(container.textContent).not.toContain('Continue')
        expect(container.textContent).toContain('Cancel')
    })

    it('puts account-import-drop on the drop zone element itself', () => {
        const { container } = renderView({ step: 1 })
        // DropZone renders a div with data-testid and data-enabled; an inner View would have neither.
        const drop = container.querySelector('[data-testid="account-import-drop"]')
        expect(drop).not.toBeNull()
        expect(drop?.hasAttribute('data-enabled')).toBe(true)
    })
})

describe('UploadStep errors', () => {
    function dropFile(container: HTMLElement, file: File) {
        const zone = container.querySelector('[data-testid="account-import-drop"]') as HTMLElement
        fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } })
    }

    it('a bad drop replaces an earlier file error: only the newest error shows', () => {
        const old = 'The file needs a header row and at least one data row.'
        const { container } = renderView({ step: 1, fileError: old })
        expect(container.textContent).toContain(old)
        dropFile(container, new File(['x'], 'notes.txt', { type: 'text/plain' }))
        const text = container.textContent ?? ''
        expect(text).toContain('Only comma-separated (CSV) files are supported')
        expect(text).not.toContain(old)
    })
})

describe('leaving the import screen', () => {
    it('Cancel goes back to the accounts list without pushing a second Chart of Accounts', () => {
        const { container } = renderView({ step: 1 })
        clickText(container, 'Cancel')
        expect(pushedTargets()).not.toContain('/a/books/accounts')
        expect(router.back).toHaveBeenCalledTimes(1)
        expect(router.replace).toHaveBeenCalledWith('/a/books/accounts')
    })

    it('All lists never pushes a second Chart of Accounts and lands on the lists page', () => {
        const { container } = renderView({ step: 1 })
        clickText(container, 'All lists')
        expect(pushedTargets()).not.toContain('/a/books/accounts')
        const targets = [
            ...vi.mocked(router.push).mock.calls,
            ...vi.mocked(router.replace).mock.calls,
        ].map(call => call[0])
        expect(targets).toContain('/a/books/lists')
    })
})

describe('MapStep', () => {
    const header = ['Number', 'Name', 'Type', 'Detail type', 'Parent', 'Description', 'Inactive']

    it('shows one select per import field, with Name and Type marked required', () => {
        const { container } = renderView({ step: 2, header })
        const required = IMPORT_FIELDS.filter(f => f.required).map(f => f.field)
        expect(required).toEqual(['name', 'type'])
        expect(IMPORT_FIELDS).toHaveLength(7)
        for (const { field, label, required: isRequired } of IMPORT_FIELDS) {
            const select = byTestId(container, `account-import-map-${field}`)
            expect(select, field).not.toBeNull()
            expect(select?.textContent).toContain(label)
            expect(select?.textContent?.includes('Required'), field).toBe(isRequired)
        }
    })

    it('does not disable Continue when Type is unmapped: it submits and the form shows the errors', () => {
        const { container, flow } = renderView({
            step: 2,
            header,
            columnMap: { ...FULL_MAP, type: null },
            mapForm: mapFormOf({ ...FULL_MAP, type: null }),
        })
        const next = byTestId(container, 'account-import-next')
        expect(isDisabled(next)).toBe(false)
        fireEvent.click(next as HTMLElement)
        expect(flow.goToPreview).toHaveBeenCalledTimes(1)
    })

    it('Continue runs goToPreview when everything is mapped', () => {
        const { container, flow } = renderView({ step: 2, header })
        const next = byTestId(container, 'account-import-next')
        expect(isDisabled(next)).toBe(false)
        fireEvent.click(next as HTMLElement)
        expect(flow.goToPreview).toHaveBeenCalledTimes(1)
    })
})

describe('PreviewStep', () => {
    it('renders a status for every row and labels the row number Row, never Line', () => {
        const { container } = renderView({ step: 3, preview: ROWS, readyCount: 1 })
        const ready = byTestId(container, 'account-import-row-1')
        const skipped = byTestId(container, 'account-import-row-2')
        const error = byTestId(container, 'account-import-row-3')
        expect(ready?.textContent).toContain('Tools Co')
        expect(ready?.textContent).toContain('Ready')
        expect(skipped?.textContent).toContain('Reserve savings')
        expect(skipped?.textContent).toContain('Skipped: already exists')
        expect(error?.textContent).toContain('Bogus')
        expect(error?.textContent).toContain('Error: unknown type')
        expect(container.textContent).not.toMatch(/\bLine\b/)
    })

    it('disables Import when there are zero Ready rows', () => {
        const none = ROWS.filter(r => r.status !== 'ready')
        const { container } = renderView({ step: 3, preview: none, readyCount: 0 })
        expect(isDisabled(byTestId(container, 'account-import-run'))).toBe(true)
    })

    it('enables Import with a Ready row and pressing it runs the import', () => {
        const { container, flow } = renderView({ step: 3, preview: ROWS, readyCount: 1 })
        const run = byTestId(container, 'account-import-run')
        expect(isDisabled(run)).toBe(false)
        fireEvent.click(run as HTMLElement)
        expect(flow.runImport).toHaveBeenCalledTimes(1)
    })

    it('shows N of M imported while the import runs', () => {
        const { container } = renderView({
            step: 3,
            preview: ROWS,
            readyCount: 3,
            progress: { done: 1, total: 3 },
        })
        expect(container.textContent).toContain('1 of 3 imported')
    })

    it('on failure shows N of M imported, the refused row as Row N, its name and the server message', () => {
        const message = 'Account number 8899 is already used.'
        const { container } = renderView({
            step: 3,
            preview: ROWS,
            readyCount: 3,
            progress: { done: 1, total: 3 },
            failure: { line: 3, name: 'Petty drawer', message },
        })
        const text = container.textContent ?? ''
        expect(text).toContain('1 of 3 imported')
        expect(text).toContain('Row 3')
        expect(text).toContain('Petty drawer')
        expect(text).toContain(message)
        expect(text).not.toMatch(/\bLine\b/)
    })

    it('shows the failure text even when no progress was recorded', () => {
        const { container } = renderView({
            step: 3,
            preview: ROWS,
            readyCount: 1,
            progress: null,
            failure: { line: 0, name: '', message: 'kaboom' },
        })
        const text = container.textContent ?? ''
        expect(text).toContain('The import stopped')
        expect(text).toContain('kaboom')
    })

    it('shows no failure text before anything is refused', () => {
        const { container } = renderView({ step: 3, preview: ROWS, readyCount: 1 })
        expect(container.textContent).not.toMatch(/\d+ of \d+ imported/)
    })
})

describe('PreviewStep Import button label', () => {
    function runLabel(readyCount: number) {
        const { container } = renderView({ step: 3, preview: ROWS, readyCount })
        return byTestId(container, 'account-import-run')
    }

    it('says Import 1 account for one Ready row', () => {
        expect(runLabel(1)?.textContent).toBe('Import 1 account')
    })

    it('says Import N accounts for several', () => {
        expect(runLabel(3)?.textContent).toBe('Import 3 accounts')
    })

    it('says Import and is disabled at zero', () => {
        const run = runLabel(0)
        expect(run?.textContent).toBe('Import')
        expect(isDisabled(run)).toBe(true)
    })

    it('is disabled while the import runs', () => {
        const { container } = renderView({
            step: 3,
            preview: ROWS,
            readyCount: 3,
            progress: { done: 1, total: 3 },
            isRunning: true,
        })
        expect(isDisabled(byTestId(container, 'account-import-run'))).toBe(true)
        expect(container.textContent).toContain('1 of 3 imported')
    })
})

describe('PreviewStep list window', () => {
    it('renders only a window of 2000 rows while the summary counts them all', () => {
        const many: ImportRow[] = Array.from({ length: 2000 }, (_, i) => {
            const status = i < 1500 ? 'ready' : i < 1900 ? 'skipped' : 'error'
            return previewRow({
                line: i + 1,
                name: `Account ${i + 1}`,
                status,
                reason: status === 'ready' ? null : 'because',
            })
        })
        const { container } = renderView({ step: 3, preview: many, readyCount: 1500 })
        const rendered = container.querySelectorAll('[testid^="account-import-row-"]')
        expect(rendered.length).toBeLessThan(300)
        const text = container.textContent ?? ''
        expect(text).toContain('1500 to import')
        expect(text).toContain('400 skipped')
        expect(text).toContain('100 with errors')
    })
})

// The stub renders host elements, so the props the component passed are read off the fiber.
function propsOf(el: Element | null) {
    const key = Object.keys(el ?? {}).find(k => k.startsWith('__reactProps$'))
    return (el as unknown as Record<string, Record<string, unknown>>)[key ?? ''] ?? {}
}

describe('PreviewStep list scrolling and semantics', () => {
    const many: ImportRow[] = Array.from({ length: 2000 }, (_, i) =>
        previewRow({ line: i + 1, name: `Account ${i + 1}` })
    )

    function renderMany() {
        return renderView({ step: 3, preview: many, readyCount: 2000 })
    }

    function listOf(container: HTMLElement) {
        // The window list is the innermost scroll view; the page itself is the outer one.
        return [...container.querySelectorAll('rn-scrollview')].at(-1) as HTMLElement
    }

    function scrollTo(list: HTMLElement, y: number) {
        const onScroll = propsOf(list).onScroll as (e: unknown) => void
        act(() => onScroll({ nativeEvent: { contentOffset: { y } } }))
    }

    it('scrolling far down renders the rows there and drops the first rows', () => {
        const { container } = renderMany()
        expect(byTestId(container, 'account-import-row-1')).not.toBeNull()
        scrollTo(listOf(container), 64 * 500)
        expect(byTestId(container, 'account-import-row-501')).not.toBeNull()
        expect(byTestId(container, 'account-import-row-1')).toBeNull()
        expect(container.querySelectorAll('[testid^="account-import-row-"]').length).toBeLessThan(
            300
        )
    })

    it('the spacers and the rendered rows always sum to the full list height', () => {
        const { container } = renderMany()
        const list = listOf(container)
        for (const y of [0, 64 * 500, 64 * 1990]) {
            scrollTo(list, y)
            const spacers = [list.firstElementChild, list.lastElementChild] as HTMLElement[]
            const [top, bottom] = spacers.map(el => Number.parseFloat(el.style.height))
            const rendered = container.querySelectorAll('[testid^="account-import-row-"]').length
            expect(top + bottom + rendered * 64, `y=${y}`).toBe(2000 * 64)
        }
    })

    it('the list container is a list labelled with the row count and visible range', () => {
        const { container } = renderMany()
        const props = propsOf(listOf(container))
        expect(props.accessibilityRole).toBe('list')
        expect(props.accessibilityLabel).toBe('2000 rows')
    })

    it('the list label stays the row count while scrolling', () => {
        const { container } = renderMany()
        const list = listOf(container)
        scrollTo(list, 64 * 500)
        expect(propsOf(listOf(container)).accessibilityLabel).toBe('2000 rows')
    })

    it('every rendered row is a list item', () => {
        const { container } = renderMany()
        const rows = [...container.querySelectorAll('[testid^="account-import-row-"]')]
        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) expect(propsOf(row).accessibilityRole).toBe('listitem')
    })

    it('the inner list scrolls inside the outer page scroll view', () => {
        const { container } = renderMany()
        expect(propsOf(listOf(container)).nestedScrollEnabled).toBe(true)
    })

    it('the status text wraps to two lines', () => {
        const { container } = renderView({ step: 3, preview: ROWS, readyCount: 1 })
        const status = [...container.querySelectorAll('rn-text')].find(
            el => el.textContent === 'Skipped: already exists'
        )
        expect(status).toBeDefined()
        expect(propsOf(status ?? null).numberOfLines).toBe(2)
    })
})

describe('ImportSteps', () => {
    function current(container: HTMLElement) {
        return [...container.querySelectorAll('[aria-current="step"]')]
    }

    it('marks the Import step current on the preview', () => {
        const { container } = renderView({ step: 3, preview: ROWS, readyCount: 1 })
        const marked = current(container)
        expect(marked).toHaveLength(1)
        expect(marked[0].textContent).toContain('Import')
    })

    it('marks Upload current on step 1', () => {
        const { container } = renderView({ step: 1 })
        const marked = current(container)
        expect(marked).toHaveLength(1)
        expect(marked[0].textContent).toContain('Upload')
    })

    it('shows no step as current on the summary: every step is complete', () => {
        const { container } = renderView({ step: 4, result: { created: 2, skipped: 1 } })
        expect(current(container)).toHaveLength(0)
    })
})

describe('ImportSummary', () => {
    it('shows the created and skipped counts', () => {
        const { container } = renderView({ step: 4, result: { created: 2, skipped: 1 } })
        const text = container.textContent ?? ''
        expect(text).toMatch(/2\s*created/i)
        expect(text).toMatch(/1\s*skipped/i)
    })

    it('has a button back to the Chart of Accounts', () => {
        const { container } = renderView({ step: 4, result: { created: 2, skipped: 1 } })
        const done = byTestId(container, 'account-import-done')
        expect(done?.textContent).toContain('Chart of Accounts')
        fireEvent.click(done as HTMLElement)
        const targets = [
            ...vi.mocked(router.push).mock.calls,
            ...vi.mocked(router.replace).mock.calls,
        ].map(call => call[0])
        expect(targets).toContain('/a/books/accounts')
    })

    it('Done pops back and replaces, never pushing a second Chart of Accounts', () => {
        const { container } = renderView({ step: 4, result: { created: 2, skipped: 1 } })
        fireEvent.click(byTestId(container, 'account-import-done') as HTMLElement)
        expect(pushedTargets()).not.toContain('/a/books/accounts')
        expect(router.back).toHaveBeenCalledTimes(1)
        expect(router.replace).toHaveBeenCalledWith('/a/books/accounts')
    })
})

describe('ImportView access gate', () => {
    const stepIds = [
        'account-import-file',
        'account-import-drop',
        'account-import-copy-example',
        'account-import-next',
        'account-import-run',
        'account-import-done',
    ]

    it.each([
        1, 2, 3, 4,
    ] as const)('canWrite false shows the access message and no step (step %i)', step => {
        const { container } = renderView(
            { step, preview: ROWS, readyCount: 1, result: { created: 1, skipped: 0 } },
            { canWrite: false }
        )
        expect(container.textContent).toContain('You need bookkeeper access')
        for (const id of stepIds) expect(byTestId(container, id), id).toBeNull()
        expect(container.textContent).not.toContain('Imported balances are not supported')
        expect(container.textContent).not.toContain('Tools Co')
    })

    it('shows the loading state, not the access message, until access is ready', () => {
        const { container } = renderView({ step: 1 }, { canWrite: false, isReady: false })
        expect(container.querySelector('rn-activityindicator')).not.toBeNull()
        expect(container.textContent).not.toContain('You need bookkeeper access')
        for (const id of stepIds) expect(byTestId(container, id), id).toBeNull()
    })

    it('a writer who is ready sees step 1 and no loading state', () => {
        const { container } = renderView({ step: 1 })
        expect(container.querySelector('rn-activityindicator')).toBeNull()
        expect(container.textContent).not.toContain('You need bookkeeper access')
    })
})
