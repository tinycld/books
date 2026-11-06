// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ClientResponseError } from 'pocketbase'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaxActions } from '../tinycld/books/hooks/useTaxActions'
import { SERVER_UNREACHED } from '../tinycld/books/lib/refusal'
import { DEFAULT_INACTIVE, TAX_IS_DEFAULT } from '../tinycld/books/lib/tax-messages'
import {
    TAX_AGENCIES,
    TAX_IDS,
    TAX_RATE_ROWS,
    type TaxAgencyFixtureRecord,
    type TaxRateFixtureRecord,
} from '../tinycld/books/lib/tax-rates-fixture'
import type { BooksTaxAgencies, BooksTaxRates } from '../tinycld/books/types'
import {
    enteredWrites,
    holdWrites,
    messageRefusal,
    seedBooks,
    taxAgenciesStore,
    taxRatesStore,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

// The row actions of the Sales tax page over the harness's real local-only collections,
// seeded from the sales tax fixture. Every tax write goes through the harness's shared
// handler, so holdWrites, refuseAfter and enteredWrites reach them. The server's swap of
// the default (clearing the previous one) is Go's; the client sends one write.

const ONLY_ACTIVE = DEFAULT_INACTIVE
const ACTIVE_RATES_FIRST = 'Make its 2 active rates inactive first.'

function agencyRow(agency: TaxAgencyFixtureRecord): BooksTaxAgencies {
    return {
        id: agency.id,
        name: agency.name,
        account: 'acc-2200',
        inactive: agency.inactive,
        name_key: agency.name.toLowerCase(),
        sort_key: agency.name.toLowerCase(),
        created: agency.created,
        updated: agency.updated,
    }
}

function rateRow(row: TaxRateFixtureRecord): BooksTaxRates {
    return { ...row, name_key: row.name.toLowerCase(), sort_key: row.name.toLowerCase() }
}

function seed(options: Parameters<typeof seedBooks>[0] = {}) {
    seedBooks({
        ...options,
        taxAgencies: TAX_AGENCIES.map(agencyRow),
        taxRates: TAX_RATE_ROWS.map(rateRow),
    })
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderActions() {
    return renderHook(() => useTaxActions(), { wrapper })
}

const storedRate = (id: string) => taxRatesStore().get(id)
const storedAgency = (id: string) => taxAgenciesStore().get(id)
const defaultIds = () =>
    taxRatesStore()
        .toArray.filter(row => row.is_default)
        .map(row => row.id)
        .sort()

// Lets a held write reach the handler and the hook re-render.
async function settle() {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
    })
}

// A request that got no answer from the server, as the PocketBase SDK rejects it.
function lostWrite() {
    return new ClientResponseError({
        url: 'http://127.0.0.1:8090/api/collections/books_tax_rates/records',
        status: 0,
        originalError: new TypeError('Failed to fetch'),
    })
}

beforeEach(() => seed())

describe('useTaxActions setDefault', () => {
    it('sets is_default on the chosen row only and shows it as pending while the write runs', async () => {
        const release = holdWrites()
        const { result } = renderActions()
        expect(result.current.pendingDefaultId).toBeNull()

        let done: Promise<boolean> = Promise.resolve(false)
        act(() => {
            done = result.current.setDefault(TAX_IDS.state, TAX_IDS.denverCombined)
        })
        await settle()
        expect(result.current.pendingDefaultId).toBe(TAX_IDS.state)
        expect(result.current.isWorking).toBe(true)
        expect(enteredWrites()).toEqual([TAX_IDS.state])

        release()
        let outcome = false
        await act(async () => {
            outcome = await done
        })
        expect(outcome).toBe(true)
        await waitFor(() => expect(result.current.pendingDefaultId).toBeNull())
        expect(result.current.isWorking).toBe(false)
        expect(result.current.refusal).toBeNull()
        expect(enteredWrites()).toEqual([TAX_IDS.state])
        expect(storedRate(TAX_IDS.state)?.is_default).toBe(true)
        // The client never clears the previous default itself: the server does, in the
        // same serialized write.
        expect(defaultIds()).toEqual([TAX_IDS.denverCombined, TAX_IDS.state].sort())
    })

    it("Remove default sets is_default false on the current default and pends ''", async () => {
        const release = holdWrites()
        const { result } = renderActions()

        let done: Promise<boolean> = Promise.resolve(false)
        act(() => {
            done = result.current.setDefault('', TAX_IDS.denverCombined)
        })
        await settle()
        expect(result.current.pendingDefaultId).toBe('')
        expect(enteredWrites()).toEqual([TAX_IDS.denverCombined])

        release()
        await act(async () => {
            await done
        })
        await waitFor(() => expect(result.current.pendingDefaultId).toBeNull())
        expect(storedRate(TAX_IDS.denverCombined)?.is_default).toBe(false)
        expect(defaultIds()).toEqual([])
    })
})

describe('useTaxActions one write at a time', () => {
    it('refuses a second default, a rate and an agency write while a default write runs', async () => {
        const release = holdWrites()
        const { result } = renderActions()

        let first: Promise<boolean> = Promise.resolve(false)
        act(() => {
            first = result.current.setDefault(TAX_IDS.state, TAX_IDS.denverCombined)
        })
        await settle()

        let others: boolean[] = []
        await act(async () => {
            others = await Promise.all([
                result.current.setDefault(TAX_IDS.rtd, TAX_IDS.denverCombined),
                result.current.rates.setInactive(TAX_IDS.rtd, true),
                result.current.agencies.setInactive(TAX_IDS.denver, true),
            ])
        })
        expect(others).toEqual([false, false, false])
        expect(enteredWrites()).toEqual([TAX_IDS.state])

        release()
        let outcome = false
        await act(async () => {
            outcome = await first
        })
        expect(outcome).toBe(true)
        expect(enteredWrites()).toEqual([TAX_IDS.state])
        expect(storedRate(TAX_IDS.rtd)?.is_default).toBe(false)
        expect(storedRate(TAX_IDS.rtd)?.inactive).toBe(false)
        expect(storedAgency(TAX_IDS.denver)?.inactive).toBe(false)
    })

    it('refuses an agency write and a default while a rate write runs', async () => {
        const release = holdWrites()
        const { result } = renderActions()

        let first: Promise<boolean> = Promise.resolve(false)
        act(() => {
            first = result.current.rates.setInactive(TAX_IDS.lodging, true)
        })
        await settle()
        expect(result.current.isWorking).toBe(true)

        let others: boolean[] = []
        await act(async () => {
            others = await Promise.all([
                result.current.agencies.setInactive(TAX_IDS.oldCounty, false),
                result.current.setDefault(TAX_IDS.state, TAX_IDS.denverCombined),
            ])
        })
        expect(others).toEqual([false, false])
        expect(enteredWrites()).toEqual([TAX_IDS.lodging])

        release()
        await act(async () => {
            await first
        })
        expect(storedRate(TAX_IDS.lodging)?.inactive).toBe(true)
        expect(storedAgency(TAX_IDS.oldCounty)?.inactive).toBe(true)
        expect(storedRate(TAX_IDS.state)?.is_default).toBe(false)
    })

    it('accepts the next write once the first is done', async () => {
        const { result } = renderActions()
        await act(async () => {
            await result.current.setDefault(TAX_IDS.state, TAX_IDS.denverCombined)
        })
        let outcome = false
        await act(async () => {
            outcome = await result.current.rates.setInactive(TAX_IDS.lodging, true)
        })
        expect(outcome).toBe(true)
        expect(enteredWrites()).toEqual([TAX_IDS.state, TAX_IDS.lodging])
    })
})

describe('useTaxActions refusals', () => {
    it('keys a refused default to its target row, ends the pending default and rolls the row back', async () => {
        seed({ refuseAfter: { after: 0, error: messageRefusal(ONLY_ACTIVE) } })
        const { result } = renderActions()

        let outcome = true
        await act(async () => {
            outcome = await result.current.setDefault(TAX_IDS.state, TAX_IDS.denverCombined)
        })
        expect(outcome).toBe(false)
        await waitFor(() =>
            expect(result.current.refusal).toEqual({ id: TAX_IDS.state, message: ONLY_ACTIVE })
        )
        expect(result.current.pendingDefaultId).toBeNull()
        expect(storedRate(TAX_IDS.state)?.is_default).toBe(false)
        expect(defaultIds()).toEqual([TAX_IDS.denverCombined])

        // The banner's dismiss clears it with no id.
        act(() => result.current.clearRefusal())
        await waitFor(() => expect(result.current.refusal).toBeNull())
    })

    it('keys a refused Make inactive of an agency to the agency', async () => {
        seed({ refuseAfter: { after: 0, error: messageRefusal(ACTIVE_RATES_FIRST) } })
        const { result } = renderActions()

        await act(async () => {
            await result.current.agencies.setInactive(TAX_IDS.denver, true)
        })
        await waitFor(() =>
            expect(result.current.refusal).toEqual({
                id: TAX_IDS.denver,
                message: ACTIVE_RATES_FIRST,
            })
        )
        expect(storedAgency(TAX_IDS.denver)?.inactive).toBe(false)
    })

    it('keys a refused delete to its row, keeps the row, and clearRefusal(id) drops it', async () => {
        seed({ refuseAfter: { after: 0, error: messageRefusal(TAX_IS_DEFAULT) } })
        const { result } = renderActions()

        let outcome = true
        await act(async () => {
            outcome = await result.current.rates.deleteRecord(TAX_IDS.denverCombined)
        })
        expect(outcome).toBe(false)
        await waitFor(() =>
            expect(result.current.refusal).toEqual({
                id: TAX_IDS.denverCombined,
                message: TAX_IS_DEFAULT,
            })
        )
        expect(taxRatesStore().has(TAX_IDS.denverCombined)).toBe(true)

        act(() => result.current.clearRefusal(TAX_IDS.state))
        expect(result.current.refusal).toEqual({
            id: TAX_IDS.denverCombined,
            message: TAX_IS_DEFAULT,
        })

        act(() => result.current.clearRefusal(TAX_IDS.denverCombined))
        await waitFor(() => expect(result.current.refusal).toBeNull())
    })

    it('shows the fixed unreached message for a default write lost offline', async () => {
        seed({ refuseAfter: { after: 0, error: lostWrite() } })
        const { result } = renderActions()

        await act(async () => {
            await result.current.setDefault(TAX_IDS.state, TAX_IDS.denverCombined)
        })
        await waitFor(() =>
            expect(result.current.refusal).toEqual({
                id: TAX_IDS.state,
                message: SERVER_UNREACHED,
            })
        )
        expect(storedRate(TAX_IDS.state)?.is_default).toBe(false)
    })

    it('shows the fixed unreached message for a rate write lost offline', async () => {
        seed({ refuseAfter: { after: 0, error: lostWrite() } })
        const { result } = renderActions()

        await act(async () => {
            await result.current.rates.setInactive(TAX_IDS.lodging, true)
        })
        await waitFor(() =>
            expect(result.current.refusal).toEqual({
                id: TAX_IDS.lodging,
                message: SERVER_UNREACHED,
            })
        )
    })
})
