// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountImport } from '../tinycld/books/hooks/useAccountImport'
import {
    buildImportPreview,
    type ExistingAccount,
    orderForInsert,
} from '../tinycld/books/lib/account-import'
import { ACCOUNTS } from '../tinycld/books/lib/chart-of-accounts-fixture'
import { parseCsv } from '../tinycld/books/lib/csv'
import {
    accountsStore,
    enteredWrites,
    holdWrites,
    liftRefusal,
    messageRefusal,
    seedBooks,
    storedAccounts,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

// Spies that call through, so a test can count calls and, for orderForInsert, swap one result.
vi.mock('../tinycld/books/lib/account-import', async importOriginal => {
    const actual = await importOriginal<typeof import('../tinycld/books/lib/account-import')>()
    return {
        ...actual,
        buildImportPreview: vi.fn(actual.buildImportPreview),
        orderForInsert: vi.fn(actual.orderForInsert),
    }
})
vi.mock('../tinycld/books/lib/csv', async importOriginal => {
    const actual = await importOriginal<typeof import('../tinycld/books/lib/csv')>()
    return { ...actual, parseCsv: vi.fn(actual.parseCsv) }
})

const real = await vi.importActual<typeof import('../tinycld/books/lib/account-import')>(
    '../tinycld/books/lib/account-import'
)
const realCsv = await vi.importActual<typeof import('../tinycld/books/lib/csv')>(
    '../tinycld/books/lib/csv'
)

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function existingFrom(rows: readonly ExistingAccount[]): ExistingAccount[] {
    return rows.map(({ id, name, number, type, parent }) => ({ id, name, number, type, parent }))
}

const HEADER = 'Number,Name,Type,Detail type,Parent,Description,Inactive'
const CASH = 'acct_bank_0001'

// Data row 1: new parent. Row 2: child of row 1. Row 3: child of an existing account.
// Row 4: unknown type (Error). Row 5: already exists (Skipped), and its number 1020
// also belongs to that existing account, so Skipped must win over duplicate-number.
const MIXED_CSV = [
    HEADER,
    '8800,Tools Co,Expense,Office and general,,Software and tools,',
    '8810,Design Tools,Expense,Dues and subscriptions,Tools Co,Seats,yes',
    '8899,Petty drawer,Bank,Cash on hand,Cash and bank,,',
    ',Bogus,Nonsense,,,,',
    '1020,Reserve savings,Bank,Savings,Cash and bank,,',
].join('\n')

function csvFile(text: string, name = 'accounts.csv') {
    return new File([text], name, { type: 'text/csv' })
}

function setup(existing: ExistingAccount[] = existingFrom(ACCOUNTS)) {
    return renderHook(({ rows }) => useAccountImport(rows), {
        wrapper,
        initialProps: { rows: existing },
    })
}

async function choose(hook: ReturnType<typeof setup>, text: string) {
    await act(async () => {
        await hook.result.current.chooseFile(csvFile(text))
    })
}

// goToPreview submits the column-map form, so it settles asynchronously.
async function goToPreview(hook: ReturnType<typeof setup>) {
    await act(async () => {
        await hook.result.current.goToPreview()
    })
}

async function toPreview(hook: ReturnType<typeof setup>, text = MIXED_CSV) {
    await choose(hook, text)
    act(() => hook.result.current.goToMap())
    await goToPreview(hook)
}

// A file whose text() takes `delayMs`, to make an earlier read finish after a later one.
function slowFile(text: string, delayMs: number, name = 'slow.csv') {
    const file = csvFile(text, name)
    Object.defineProperty(file, 'text', {
        value: () => new Promise<string>(resolve => setTimeout(() => resolve(text), delayMs)),
    })
    return file
}

function storedNamed(name: string) {
    return storedAccounts().find(a => a.name === name)
}

const logs = silenceLog()

beforeEach(() => {
    seedBooks()
    vi.mocked(buildImportPreview).mockReset()
    vi.mocked(buildImportPreview).mockImplementation(real.buildImportPreview)
    vi.mocked(orderForInsert).mockReset()
    vi.mocked(orderForInsert).mockImplementation(real.orderForInsert)
    vi.mocked(parseCsv).mockReset()
    vi.mocked(parseCsv).mockImplementation(realCsv.parseCsv)
})

describe('useAccountImport chooseFile', () => {
    it('a valid CSV moves to step 2 with the columns auto-matched', async () => {
        const hook = setup()
        expect(hook.result.current.step).toBe(1)
        await choose(hook, MIXED_CSV)
        expect(hook.result.current.fileError).toBeNull()
        expect(hook.result.current.step).toBe(2)
        expect(hook.result.current.header).toEqual(HEADER.split(','))
        expect(hook.result.current.columnMap).toEqual({
            number: 0,
            name: 1,
            type: 2,
            detail_type: 3,
            parent: 4,
            description: 5,
            inactive: 6,
        })
    })

    it('a file over 1 MB sets fileError and stays on step 1', async () => {
        const hook = setup()
        await choose(hook, `${HEADER}\n${'a'.repeat(1048577)}`)
        expect(hook.result.current.fileError).toContain('1 MB')
        expect(hook.result.current.step).toBe(1)
    })

    it('a header-only file sets fileError and stays on step 1', async () => {
        const hook = setup()
        await choose(hook, `${HEADER}\n`)
        expect(hook.result.current.fileError).toMatch(/at least one data row/i)
        expect(hook.result.current.step).toBe(1)
    })

    it.each([
        ['semicolon', 'Number;Name;Type\n1000;Cash;Bank'],
        ['tab', 'Number\tName\tType\n1000\tCash\tBank'],
    ])('a %s-separated file says only comma-separated files are supported', async (_n, text) => {
        const hook = setup()
        await choose(hook, text)
        expect(hook.result.current.fileError).toContain(
            'Only comma-separated (CSV) files are supported'
        )
        expect(hook.result.current.step).toBe(1)
    })

    it('an unterminated quote shows the parser error and stays on step 1', async () => {
        const hook = setup()
        await choose(hook, `${HEADER}\n1000,"Cash,Bank,Checking,,,`)
        expect(hook.result.current.fileError).toBe('A quoted value is missing its closing quote.')
        expect(hook.result.current.step).toBe(1)
    })

    it('a later good file clears the earlier file error', async () => {
        const hook = setup()
        await choose(hook, `${HEADER}\n`)
        expect(hook.result.current.fileError).not.toBeNull()
        await choose(hook, MIXED_CSV)
        expect(hook.result.current.fileError).toBeNull()
        expect(hook.result.current.step).toBe(2)
    })
})

describe('useAccountImport mapping', () => {
    // The form errors are read during render, as a component would, so they are tracked.
    function setupWithErrors() {
        return renderHook(
            ({ rows }) => {
                const flow = useAccountImport(rows)
                return { flow, errors: flow.mapForm.formState.errors }
            },
            { wrapper, initialProps: { rows: existingFrom(ACCOUNTS) } }
        )
    }

    async function chooseWith(hook: ReturnType<typeof setupWithErrors>, text: string) {
        await act(async () => {
            await hook.result.current.flow.chooseFile(csvFile(text))
        })
    }

    async function submit(hook: ReturnType<typeof setupWithErrors>) {
        await act(async () => {
            await hook.result.current.flow.goToPreview()
        })
    }

    it('has no canContinueFromMap flag any more', async () => {
        const hook = setup()
        await choose(hook, MIXED_CSV)
        expect('canContinueFromMap' in hook.result.current).toBe(false)
    })

    it.each([
        ['type', 'Choose the column for Type'],
        ['name', 'Choose the column for Name'],
    ] as const)('with %s unmapped goToPreview stays on step 2 and the form reports it', async (field, message) => {
        const hook = setupWithErrors()
        await chooseWith(hook, MIXED_CSV)
        act(() => hook.result.current.flow.setColumn(field, null))
        await submit(hook)
        expect(hook.result.current.flow.step).toBe(2)
        expect(hook.result.current.errors[field]?.message).toBe(message)
    })

    it('reports both messages when Name and Type are both unmapped', async () => {
        const hook = setupWithErrors()
        await chooseWith(hook, MIXED_CSV)
        act(() => hook.result.current.flow.setColumn('name', null))
        act(() => hook.result.current.flow.setColumn('type', null))
        await submit(hook)
        expect(hook.result.current.flow.step).toBe(2)
        expect(hook.result.current.errors.name?.message).toBe('Choose the column for Name')
        expect(hook.result.current.errors.type?.message).toBe('Choose the column for Type')
    })

    it('mapping the column again lets Continue through to step 3', async () => {
        const hook = setupWithErrors()
        await chooseWith(hook, MIXED_CSV)
        act(() => hook.result.current.flow.setColumn('type', null))
        await submit(hook)
        expect(hook.result.current.flow.step).toBe(2)
        act(() => hook.result.current.flow.setColumn('type', 2))
        // The error clears at once, before any new submit.
        expect(hook.result.current.errors.type).toBeUndefined()
        await submit(hook)
        expect(hook.result.current.flow.step).toBe(3)
        expect(hook.result.current.errors.type).toBeUndefined()
    })

    it('with Name and Type auto-matched, goToPreview goes straight to step 3', async () => {
        const hook = setup()
        await choose(hook, MIXED_CSV)
        await goToPreview(hook)
        expect(hook.result.current.step).toBe(3)
    })

    it('readyCount counts only Ready rows and the preview carries every status', async () => {
        const hook = setup()
        await toPreview(hook)
        const { preview, readyCount } = hook.result.current
        expect(preview.map(r => [r.line, r.status])).toEqual([
            [1, 'ready'],
            [2, 'ready'],
            [3, 'ready'],
            [4, 'error'],
            [5, 'skipped'],
        ])
        expect(preview[4].reason).toBe('already exists')
        expect(readyCount).toBe(3)
    })
})

describe('useAccountImport runImport', () => {
    it('inserts parents before children, one insert per Ready row, and ends on step 4', async () => {
        const hook = setup()
        await toPreview(hook)
        const before = storedAccounts().length
        await act(async () => {
            await hook.result.current.runImport()
        })
        const created = enteredWrites()
        expect(created).toHaveLength(3)
        const toolsCo = storedNamed('Tools Co')
        const design = storedNamed('Design Tools')
        const petty = storedNamed('Petty drawer')
        expect(created.indexOf(toolsCo?.id ?? 'missing')).toBeGreaterThanOrEqual(0)
        expect(created.indexOf(toolsCo?.id ?? 'missing')).toBeLessThan(
            created.indexOf(design?.id ?? 'missing')
        )
        expect(storedAccounts()).toHaveLength(before + 3)
        expect(hook.result.current.result).toEqual({ created: 3, skipped: 1 })
        expect(hook.result.current.step).toBe(4)
        expect(petty).toBeDefined()
    })

    it('never inserts an Error or a Skipped row', async () => {
        const hook = setup()
        await toPreview(hook)
        await act(async () => {
            await hook.result.current.runImport()
        })
        expect(storedNamed('Bogus')).toBeUndefined()
        expect(storedAccounts().filter(a => a.name === 'Reserve savings')).toHaveLength(1)
        expect(storedNamed('Reserve savings')?.id).toBe('acct_bank_0003')
    })

    it('gives a child of an imported parent the parent new id, and a child of an existing parent its id', async () => {
        const hook = setup()
        await toPreview(hook)
        await act(async () => {
            await hook.result.current.runImport()
        })
        const toolsCo = storedNamed('Tools Co')
        expect(toolsCo?.parent).toBe('')
        expect(toolsCo?.id).toBeTruthy()
        expect(storedNamed('Design Tools')?.parent).toBe(toolsCo?.id)
        expect(storedNamed('Petty drawer')?.parent).toBe(CASH)
    })

    it('stores every mapped field on the new row', async () => {
        const hook = setup()
        await toPreview(hook)
        await act(async () => {
            await hook.result.current.runImport()
        })
        expect(storedNamed('Design Tools')).toMatchObject({
            number: '8810',
            type: 'expense',
            detail_type: 'dues_subscriptions',
            description: 'Seats',
            inactive: true,
        })
        expect(storedNamed('Tools Co')).toMatchObject({
            number: '8800',
            type: 'expense',
            detail_type: 'office_general',
            description: 'Software and tools',
            inactive: false,
        })
    })

    it('yields the inserts one at a time', async () => {
        const hook = setup()
        await toPreview(hook)
        const release = holdWrites()
        let run: Promise<void> = Promise.resolve()
        act(() => {
            run = hook.result.current.runImport()
        })
        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        // The first write is still open, so the second insert has not started.
        await new Promise(resolve => setTimeout(resolve, 30))
        expect(enteredWrites()).toHaveLength(1)
        expect(hook.result.current.progress).toMatchObject({ done: 0, total: 3 })
        expect(hook.result.current.isRunning).toBe(true)
        release()
        await act(async () => {
            await run
        })
        expect(enteredWrites()).toHaveLength(3)
        expect(hook.result.current.isRunning).toBe(false)
    })

    it('is not running before the import starts', async () => {
        const hook = setup()
        expect(hook.result.current.isRunning).toBe(false)
        await toPreview(hook)
        expect(hook.result.current.isRunning).toBe(false)
    })
})

describe('useAccountImport server refusal', () => {
    const REFUSAL = 'Account number 8899 is already used.'

    async function runUntilRefused() {
        seedBooks({ refuseAfter: { after: 1, error: messageRefusal(REFUSAL) } })
        const hook = setup()
        await toPreview(hook)
        await act(async () => {
            await hook.result.current.runImport()
        })
        return hook
    }

    it('stops at the first refusal and reports done, total and the refused row', async () => {
        const hook = await runUntilRefused()
        expect(hook.result.current.progress).toEqual({ done: 1, total: 3 })
        expect(logs.error).toHaveBeenCalledWith(
            'books.import',
            expect.objectContaining({ message: REFUSAL }),
            { line: 3 }
        )
        // Order is Tools Co, Petty drawer, Design Tools; the second insert is refused.
        expect(hook.result.current.failure).toEqual({
            line: 3,
            name: 'Petty drawer',
            message: REFUSAL,
        })
        expect(hook.result.current.result).toBeNull()
        expect(hook.result.current.step).toBe(3)
        expect(hook.result.current.isRunning).toBe(false)
        expect(enteredWrites()).toHaveLength(2)
        expect(storedNamed('Tools Co')).toBeDefined()
        expect(storedNamed('Petty drawer')).toBeUndefined()
        expect(storedNamed('Design Tools')).toBeUndefined()
    })

    it('running again imports only the rest and reports the true totals across attempts', async () => {
        const hook = await runUntilRefused()
        liftRefusal()
        hook.rerender({ rows: existingFrom(storedAccounts()) })
        const { preview } = hook.result.current
        // The second preview may show the first attempt's row as Skipped.
        expect(preview.map(r => [r.line, r.status])).toEqual([
            [1, 'skipped'],
            [2, 'ready'],
            [3, 'ready'],
            [4, 'error'],
            [5, 'skipped'],
        ])
        expect(preview[0].reason).toBe('already exists')
        expect(hook.result.current.readyCount).toBe(2)
        await act(async () => {
            await hook.result.current.runImport()
        })
        expect(hook.result.current.failure).toBeNull()
        // 1 row from the first attempt + 2 now; only row 5 was Skipped in the original preview.
        expect(hook.result.current.result).toEqual({ created: 3, skipped: 1 })
        expect(hook.result.current.step).toBe(4)
        expect(storedAccounts().filter(a => a.name === 'Tools Co')).toHaveLength(1)
        expect(storedNamed('Design Tools')?.parent).toBe(storedNamed('Tools Co')?.id)
    })

    it('Back to the map drops the carried count: the next run reports only its own totals', async () => {
        const hook = await runUntilRefused()
        liftRefusal()
        act(() => hook.result.current.goToMap())
        hook.rerender({ rows: existingFrom(storedAccounts()) })
        await goToPreview(hook)
        await act(async () => {
            await hook.result.current.runImport()
        })
        expect(hook.result.current.result).toEqual({ created: 2, skipped: 2 })
    })

    it('reset drops the carried count: a fresh file reports only its own totals', async () => {
        const hook = await runUntilRefused()
        liftRefusal()
        act(() => hook.result.current.reset())
        hook.rerender({ rows: existingFrom(storedAccounts()) })
        await toPreview(hook)
        await act(async () => {
            await hook.result.current.runImport()
        })
        expect(hook.result.current.result).toEqual({ created: 2, skipped: 2 })
    })
})

describe('useAccountImport preview memo and frozen run', () => {
    it('returns the identical preview array when nothing it depends on changed', async () => {
        const rows = existingFrom(ACCOUNTS)
        const hook = setup(rows)
        await toPreview(hook)
        const first = hook.result.current.preview
        hook.rerender({ rows })
        hook.rerender({ rows })
        expect(hook.result.current.preview).toBe(first)
    })

    it('does not rebuild the preview when only unrelated state changes', async () => {
        const rows = existingFrom(ACCOUNTS)
        const hook = setup(rows)
        await toPreview(hook)
        vi.mocked(buildImportPreview).mockClear()
        hook.rerender({ rows })
        hook.rerender({ rows })
        expect(buildImportPreview).not.toHaveBeenCalled()
    })

    it('does not rebuild the preview when existing is a new array with equal content', async () => {
        const hook = setup(existingFrom(ACCOUNTS))
        await toPreview(hook)
        const first = hook.result.current.preview
        vi.mocked(buildImportPreview).mockClear()
        hook.rerender({ rows: existingFrom(ACCOUNTS) })
        hook.rerender({ rows: existingFrom(ACCOUNTS) })
        expect(buildImportPreview).not.toHaveBeenCalled()
        expect(hook.result.current.preview).toBe(first)
    })

    it('rebuilds the preview when the content of existing changes', async () => {
        const hook = setup(existingFrom(ACCOUNTS))
        await toPreview(hook)
        vi.mocked(buildImportPreview).mockClear()
        hook.rerender({ rows: existingFrom(ACCOUNTS).slice(1) })
        expect(buildImportPreview).toHaveBeenCalled()
    })

    it('freezes preview and readyCount while a run is open, even when existing changes', async () => {
        const hook = setup()
        await toPreview(hook)
        const frozen = hook.result.current.preview
        const release = holdWrites()
        let run: Promise<void> = Promise.resolve()
        act(() => {
            run = hook.result.current.runImport()
        })
        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        vi.mocked(buildImportPreview).mockClear()
        // The first account now exists in the store, which would flip row 1 to Skipped.
        hook.rerender({ rows: existingFrom(storedAccounts()) })
        expect(hook.result.current.preview).toBe(frozen)
        expect(hook.result.current.readyCount).toBe(3)
        expect(buildImportPreview).not.toHaveBeenCalled()
        release()
        await act(async () => {
            await run
        })
        expect(hook.result.current.step).toBe(4)
        expect(hook.result.current.result).toEqual({ created: 3, skipped: 1 })
    })
})

describe('useAccountImport builds the preview only at step 3', () => {
    it('does not build it at step 1 or step 2, even when existing changes', async () => {
        const hook = setup()
        hook.rerender({ rows: existingFrom(ACCOUNTS).slice(1) })
        expect(buildImportPreview).not.toHaveBeenCalled()
        await choose(hook, MIXED_CSV)
        expect(hook.result.current.step).toBe(2)
        hook.rerender({ rows: existingFrom(ACCOUNTS) })
        expect(buildImportPreview).not.toHaveBeenCalled()
    })

    it('builds it at step 3, and not again after going back to step 2', async () => {
        const hook = setup()
        await toPreview(hook)
        expect(buildImportPreview).toHaveBeenCalled()
        act(() => hook.result.current.goToMap())
        vi.mocked(buildImportPreview).mockClear()
        hook.rerender({ rows: existingFrom(storedAccounts()) })
        expect(hook.result.current.step).toBe(2)
        expect(buildImportPreview).not.toHaveBeenCalled()
    })

    it('does not build it at step 4', async () => {
        const hook = setup()
        await toPreview(hook)
        await act(async () => {
            await hook.result.current.runImport()
        })
        expect(hook.result.current.step).toBe(4)
        vi.mocked(buildImportPreview).mockClear()
        hook.rerender({ rows: existingFrom(storedAccounts()) })
        expect(buildImportPreview).not.toHaveBeenCalled()
    })
})

describe('useAccountImport step changes clear the run state', () => {
    async function refused() {
        seedBooks({ refuseAfter: { after: 1, error: messageRefusal('Number taken.') } })
        const hook = setup()
        await toPreview(hook)
        await act(async () => {
            await hook.result.current.runImport()
        })
        expect(hook.result.current.failure).not.toBeNull()
        return hook
    }

    it('Back to the map clears progress and failure', async () => {
        const hook = await refused()
        act(() => hook.result.current.goToMap())
        expect(hook.result.current.step).toBe(2)
        expect(hook.result.current.progress).toBeNull()
        expect(hook.result.current.failure).toBeNull()
    })

    it('Back then Continue shows no progress and no failure on the preview', async () => {
        const hook = await refused()
        act(() => hook.result.current.goToMap())
        await goToPreview(hook)
        expect(hook.result.current.step).toBe(3)
        expect(hook.result.current.progress).toBeNull()
        expect(hook.result.current.failure).toBeNull()
    })
})

describe('useAccountImport unexpected errors', () => {
    it('a throw outside the server call records a failure and ends the run', async () => {
        const hook = setup()
        await toPreview(hook)
        vi.mocked(orderForInsert).mockImplementationOnce(rows => {
            const bad = { ...real.orderForInsert(rows)[0] }
            Object.defineProperty(bad, 'parentPath', {
                get() {
                    throw new Error('kaboom')
                },
            })
            return [bad, ...real.orderForInsert(rows).slice(1)]
        })
        await act(async () => {
            await hook.result.current.runImport().catch(() => {})
        })
        expect(hook.result.current.failure).not.toBeNull()
        expect(hook.result.current.failure?.message).toBeTruthy()
        expect(hook.result.current.isRunning).toBe(false)
        expect(hook.result.current.step).toBe(3)
        expect(hook.result.current.result).toBeNull()
    })

    it('after such a failure the run can be started again', async () => {
        const hook = setup()
        await toPreview(hook)
        vi.mocked(orderForInsert).mockImplementationOnce(() => {
            throw new Error('kaboom')
        })
        await act(async () => {
            await hook.result.current.runImport().catch(() => {})
        })
        expect(hook.result.current.isRunning).toBe(false)
        await act(async () => {
            await hook.result.current.runImport()
        })
        expect(hook.result.current.step).toBe(4)
        expect(hook.result.current.failure).toBeNull()
    })

    it('an insert that throws before reaching the server records a failure and ends the run', async () => {
        const hook = setup()
        await toPreview(hook)
        vi.spyOn(accountsStore(), 'insert').mockImplementation(() => {
            throw new Error('insert exploded')
        })
        await act(async () => {
            await hook.result.current.runImport().catch(() => {})
        })
        expect(hook.result.current.failure).toMatchObject({ line: 1, name: 'Tools Co' })
        expect(hook.result.current.failure?.message).toBeTruthy()
        expect(hook.result.current.isRunning).toBe(false)
        expect(hook.result.current.step).toBe(3)
    })

    it('a Ready row whose parent is not known at insert time fails and is never inserted', async () => {
        const hook = setup()
        await toPreview(hook)
        const before = storedAccounts().length
        // Children first: Design Tools comes before its parent Tools Co exists.
        vi.mocked(orderForInsert).mockImplementationOnce(rows =>
            [...real.orderForInsert(rows)].reverse()
        )
        await act(async () => {
            await hook.result.current.runImport()
        })
        expect(hook.result.current.failure).toMatchObject({ line: 2, name: 'Design Tools' })
        expect(hook.result.current.failure?.message).toBeTruthy()
        expect(enteredWrites()).toHaveLength(0)
        expect(storedAccounts()).toHaveLength(before)
        expect(storedNamed('Design Tools')).toBeUndefined()
        expect(hook.result.current.isRunning).toBe(false)
    })
})

describe('useAccountImport in-flight guard', () => {
    it('two runImport calls in one tick insert each row once', async () => {
        const hook = setup()
        await toPreview(hook)
        const { runImport } = hook.result.current
        let first: Promise<void> = Promise.resolve()
        let second: Promise<void> = Promise.resolve()
        act(() => {
            first = runImport()
            second = runImport()
        })
        await act(async () => {
            await Promise.all([first, second])
        })
        expect(enteredWrites()).toHaveLength(3)
        expect(storedAccounts().filter(a => a.name === 'Tools Co')).toHaveLength(1)
        expect(hook.result.current.result).toEqual({ created: 3, skipped: 1 })
    })
})

describe('useAccountImport chooseFile ordering', () => {
    const SECOND = 'Name,Type\nCash drawer,Bank'

    it('the later call wins when an earlier, slower read finishes afterwards', async () => {
        const hook = setup()
        await act(async () => {
            const slow = hook.result.current.chooseFile(slowFile(MIXED_CSV, 60))
            const fast = hook.result.current.chooseFile(csvFile(SECOND, 'fast.csv'))
            await Promise.all([slow, fast])
        })
        expect(hook.result.current.step).toBe(2)
        expect(hook.result.current.header).toEqual(['Name', 'Type'])
        expect(hook.result.current.columnMap).toMatchObject({ name: 0, type: 1 })
    })

    it('an earlier slow file with an error cannot overwrite a later good file', async () => {
        const hook = setup()
        await act(async () => {
            const slow = hook.result.current.chooseFile(slowFile(`${HEADER}\n`, 60))
            const fast = hook.result.current.chooseFile(csvFile(MIXED_CSV, 'fast.csv'))
            await Promise.all([slow, fast])
        })
        expect(hook.result.current.fileError).toBeNull()
        expect(hook.result.current.step).toBe(2)
        expect(hook.result.current.header).toEqual(HEADER.split(','))
    })
})

describe('useAccountImport size limit without a file size', () => {
    it('checks the decoded text before parsing, so nothing is parsed', async () => {
        const hook = setup()
        const file = csvFile(`${HEADER}\n${'a'.repeat(1048577)}`)
        Object.defineProperty(file, 'size', { value: undefined })
        await act(async () => {
            await hook.result.current.chooseFile(file)
        })
        expect(hook.result.current.fileError).toContain('1 MB')
        expect(hook.result.current.step).toBe(1)
        expect(parseCsv).not.toHaveBeenCalled()
    })

    it('still parses a small file that reports no size', async () => {
        const hook = setup()
        const file = csvFile(MIXED_CSV)
        Object.defineProperty(file, 'size', { value: undefined })
        await act(async () => {
            await hook.result.current.chooseFile(file)
        })
        expect(hook.result.current.fileError).toBeNull()
        expect(hook.result.current.step).toBe(2)
        expect(parseCsv).toHaveBeenCalledTimes(1)
    })
})

describe('useAccountImport unmount', () => {
    it('stops inserting after the current row', async () => {
        const hook = setup()
        await toPreview(hook)
        const release = holdWrites()
        act(() => {
            void hook.result.current.runImport()
        })
        await waitFor(() => expect(enteredWrites()).toHaveLength(1))
        hook.unmount()
        release()
        await new Promise(resolve => setTimeout(resolve, 80))
        expect(enteredWrites()).toHaveLength(1)
    })
})
