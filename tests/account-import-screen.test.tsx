// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportView } from '../tinycld/books/components/accounts/import/ImportView'
import { useAccountsImportScreen } from '../tinycld/books/hooks/useAccountsImportScreen'
import { accountsStore, requestedStores, seedBooks } from './accounts-form-harness'
import { byTestId } from './accounts-test-rows'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const HEADER = 'Number,Name,Type,Detail type,Parent,Description,Inactive'
const CSV = [
    HEADER,
    '8800,Tools Co,Expense,Office and general,,,',
    // Already in the seed, so it must come out Skipped.
    '1020,Reserve savings,Bank,Savings,Cash and bank,,',
].join('\n')

let latest: ReturnType<typeof useAccountsImportScreen>

function Screen() {
    latest = useAccountsImportScreen()
    return <ImportView {...latest} />
}

function renderScreen() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <OverlayProvider>
                <Screen />
            </OverlayProvider>
        </QueryClientProvider>
    )
}

async function chooseCsv(text: string) {
    await act(async () => {
        await latest.flow.chooseFile(new File([text], 'accounts.csv', { type: 'text/csv' }))
    })
}

const logs = silenceLog()
const consoleWarn = vi.spyOn(console, 'warn')

beforeEach(() => {
    consoleWarn.mockClear()
    seedBooks()
})

afterAll(() => consoleWarn.mockRestore())

describe('import screen: useLiveQuery usage', () => {
    it('does not use the deprecated dependency-array form', async () => {
        const { container } = renderScreen()
        await waitFor(() => expect(container.textContent).toContain('Imported balances'))
        const messages = consoleWarn.mock.calls.map(args => args.join(' '))
        expect(messages.filter(m => m.includes('dependency-array'))).toEqual([])
    })
})

describe('import screen: accounts query errors', () => {
    it('shows an error state with Retry instead of loading forever', async () => {
        seedBooks({ accountsErrored: true })
        expectLiveQueryError(accountsStore().id)
        const { container } = renderScreen()
        await waitFor(() => expect(byTestId(container, 'account-import-error')).not.toBeNull())
        const retry = byTestId(container, 'account-import-retry')
        expect(retry?.textContent).toContain('Retry')
        expect(container.querySelector('rn-activityindicator')).toBeNull()
        expect(byTestId(container, 'account-import-file')).toBeNull()
        expect(() => fireEvent.click(retry as HTMLElement)).not.toThrow()
        await waitFor(() =>
            expect(logs.error).toHaveBeenCalledWith('books.import', expect.any(TypeError))
        )
    })

    it('Retry reloads the accounts collection once', async () => {
        seedBooks({ accountsErrored: true })
        expectLiveQueryError(accountsStore().id)
        const reload = vi.fn(async () => {})
        Object.assign(accountsStore(), { reload })
        const { container } = renderScreen()
        await waitFor(() => expect(byTestId(container, 'account-import-retry')).not.toBeNull())
        fireEvent.click(byTestId(container, 'account-import-retry') as HTMLElement)
        await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    })

    it('shows no error state when the accounts load', async () => {
        const { container } = renderScreen()
        await waitFor(() => expect(container.textContent).toContain('Imported balances'))
        expect(byTestId(container, 'account-import-error')).toBeNull()
    })
})

describe('import screen: access does not wait for accounts', () => {
    it('a read-only user sees the access message while accounts never load', async () => {
        seedBooks({ level: 'read_only', accountsNeverReady: true })
        const { container } = renderScreen()
        await waitFor(() => expect(container.textContent).toContain('You need bookkeeper access'))
        expect(container.querySelector('rn-activityindicator')).toBeNull()
    })

    it('a read-only user never starts the accounts query', async () => {
        seedBooks({ level: 'read_only', accountsNeverReady: true })
        const { container } = renderScreen()
        await waitFor(() => expect(container.textContent).toContain('You need bookkeeper access'))
        // A collection stays idle until a live query subscribes to it.
        expect(accountsStore().status).toBe('idle')
    })

    it('a writer starts the accounts query (control for the idle check above)', async () => {
        seedBooks({ level: 'bookkeeper', accountsNeverReady: true })
        renderScreen()
        await waitFor(() => expect(accountsStore().status).not.toBe('idle'))
    })
})

describe('import screen: existing accounts come from books_accounts alone', () => {
    it('becomes ready and never touches books_account_balances', async () => {
        seedBooks({ balancesNeverReady: true })
        const { container } = renderScreen()
        await waitFor(() => expect(container.textContent).toContain('Imported balances'))
        expect(container.querySelector('rn-activityindicator')).toBeNull()
        expect(requestedStores()).not.toContain('books_account_balances')
    })

    it('uses the stored accounts to mark a row that already exists as Skipped', async () => {
        seedBooks({ balancesNeverReady: true })
        const { container } = renderScreen()
        await waitFor(() => expect(container.textContent).toContain('Imported balances'))
        await chooseCsv(CSV)
        act(() => latest.flow.goToMap())
        await act(async () => {
            await latest.flow.goToPreview()
        })
        expect(latest.flow.preview.map(row => [row.line, row.status])).toEqual([
            [1, 'ready'],
            [2, 'skipped'],
        ])
    })
})

describe('import screen: map errors', () => {
    async function toMapStep() {
        const view = renderScreen()
        await waitFor(() => expect(view.container.textContent).toContain('Imported balances'))
        await chooseCsv(CSV)
        await waitFor(() =>
            expect(byTestId(view.container, 'account-import-map-name')).not.toBeNull()
        )
        return view
    }

    function pressContinue(container: HTMLElement) {
        fireEvent.click(byTestId(container, 'account-import-next') as HTMLElement)
    }

    it('shows no error summary before Continue is pressed', async () => {
        const { container } = await toMapStep()
        act(() => latest.flow.setColumn('type', null))
        expect(byTestId(container, 'account-import-map-errors')).toBeNull()
    })

    it('Type unmapped: Continue shows Choose the column for Type and stays on the map', async () => {
        const { container } = await toMapStep()
        act(() => latest.flow.setColumn('type', null))
        pressContinue(container)
        await waitFor(() =>
            expect(byTestId(container, 'account-import-map-errors')?.textContent).toContain(
                'Choose the column for Type'
            )
        )
        expect(byTestId(container, 'account-import-map-name')).not.toBeNull()
        expect(byTestId(container, 'account-import-run')).toBeNull()
    })

    it('unmapping Type again after a failed Continue brings the error back at once', async () => {
        const { container } = await toMapStep()
        act(() => latest.flow.setColumn('type', null))
        pressContinue(container)
        await waitFor(() => expect(byTestId(container, 'account-import-map-errors')).not.toBeNull())
        act(() => latest.flow.setColumn('type', 2))
        await waitFor(() => expect(byTestId(container, 'account-import-map-errors')).toBeNull())
        act(() => latest.flow.setColumn('type', null))
        await waitFor(() =>
            expect(byTestId(container, 'account-import-map-errors')?.textContent).toContain(
                'Choose the column for Type'
            )
        )
    })

    it('Name unmapped: Continue shows Choose the column for Name', async () => {
        const { container } = await toMapStep()
        act(() => latest.flow.setColumn('name', null))
        pressContinue(container)
        await waitFor(() =>
            expect(byTestId(container, 'account-import-map-errors')?.textContent).toContain(
                'Choose the column for Name'
            )
        )
    })

    it('with Name and Type mapped Continue shows the preview', async () => {
        const { container } = await toMapStep()
        pressContinue(container)
        await waitFor(() => expect(byTestId(container, 'account-import-run')).not.toBeNull())
        expect(byTestId(container, 'account-import-map-errors')).toBeNull()
    })
})
