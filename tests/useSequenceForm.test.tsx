// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDocSequences } from '../tinycld/books/hooks/useDocSequences'
import { useSequenceForm } from '../tinycld/books/hooks/useSequenceForm'
import { SEQUENCES } from '../tinycld/books/lib/books-settings-fixture'
import type { SequenceValues } from '../tinycld/books/lib/settings-schema'
import {
    holdWrites,
    liftRefusal,
    messageRefusal,
    seedBooks,
    sequencesStore,
    serverRefusal,
    writeLog,
} from './accounts-form-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

const SEQ = SEQUENCES[0]
const REFUSAL = 'Numbers up to 1000 are already used. The next number must be 1001 or higher.'

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function sequenceWrites() {
    return writeLog().filter(entry => entry.startsWith('sequence:'))
}

function renderSequence() {
    return renderHook(() => useSequenceForm(SEQ), { wrapper })
}

type Rendered = ReturnType<typeof renderSequence>

function type(rendered: Rendered, field: keyof SequenceValues, value: string) {
    act(() => {
        rendered.result.current.form.setValue(field, value, { shouldDirty: true })
    })
}

beforeEach(() => {
    seedBooks({ level: 'admin', sequences: [SEQ] })
    useToastStore.setState({ toasts: [] })
})

describe('useSequenceForm', () => {
    it('writes one update with the prefix and the number as an integer', async () => {
        const rendered = renderSequence()
        type(rendered, 'prefix', 'AB-')
        type(rendered, 'next_number', '2001')

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(sequencesStore().get(SEQ.id)?.next_number).toBe(2001))
        expect(sequencesStore().get(SEQ.id)?.prefix).toBe('AB-')
        expect(sequenceWrites()).toEqual([`sequence:${SEQ.id}`])
    })

    it('previews the live form values', () => {
        const rendered = renderSequence()
        expect(rendered.result.current.preview).toBe('Next entry: JE-1001')

        type(rendered, 'prefix', 'AB-')
        type(rendered, 'next_number', '7')

        expect(rendered.result.current.preview).toBe('Next entry: AB-7')
    })

    it('shows a server refusal under next_number', async () => {
        seedBooks({
            level: 'admin',
            sequences: [SEQ],
            refuseSequences: messageRefusal(REFUSAL),
        })
        const rendered = renderSequence()
        type(rendered, 'next_number', '500')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.next_number?.message).toBe(REFUSAL)
        )
        expect(rendered.result.current.form.getValues().next_number).toBe('500')
    })

    it('blocks an invalid prefix with the schema message and writes nothing', async () => {
        const rendered = renderSequence()
        type(rendered, 'prefix', 'A_1')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.prefix?.message).toBe(
                'Use letters, digits, and hyphens only'
            )
        )
        expect(sequenceWrites()).toEqual([])
        expect(sequencesStore().get(SEQ.id)?.prefix).toBe('JE-')
    })
})

function renderLiveSequence() {
    return renderHook(
        () => {
            const { sequences } = useDocSequences()
            const live = sequences?.find(s => s.id === SEQ.id) ?? SEQ
            return useSequenceForm(live)
        },
        { wrapper }
    )
}

describe('useSequenceForm with the sequence from the live query', () => {
    it('keeps the typed number and the next_number error when the server refuses', async () => {
        seedBooks({ level: 'admin', sequences: [SEQ], refuseSequences: messageRefusal(REFUSAL) })
        const rendered = renderLiveSequence()
        await waitFor(() => expect(sequencesStore().get(SEQ.id)).toBeDefined())
        type(rendered, 'next_number', '500')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.next_number?.message).toBe(REFUSAL)
        )
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(sequencesStore().get(SEQ.id)?.next_number).toBe(SEQ.next_number)
        expect(rendered.result.current.form.getValues().next_number).toBe('500')
        expect(rendered.result.current.form.formState.errors.next_number?.message).toBe(REFUSAL)
    })

    it('shows a field-map refusal under next_number and keeps the typed number', async () => {
        seedBooks({
            level: 'admin',
            sequences: [SEQ],
            refuseSequences: serverRefusal('next_number', REFUSAL),
        })
        const rendered = renderLiveSequence()
        await waitFor(() => expect(sequencesStore().get(SEQ.id)).toBeDefined())
        type(rendered, 'next_number', '500')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.next_number?.message).toBe(REFUSAL)
        )
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(rendered.result.current.form.getValues().next_number).toBe('500')
        expect(rendered.result.current.form.formState.errors.next_number?.message).toBe(REFUSAL)
    })

    it.each([
        ['message', () => messageRefusal(REFUSAL)],
        ['field-map', () => serverRefusal('next_number', REFUSAL)],
    ])('stays dirty with the typed values after a %s refusal', async (_name, refusal) => {
        seedBooks({ level: 'admin', sequences: [SEQ], refuseSequences: refusal() })
        const rendered = renderLiveSequence()
        await waitFor(() => expect(sequencesStore().get(SEQ.id)).toBeDefined())
        type(rendered, 'prefix', 'AB-')
        type(rendered, 'next_number', '500')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.next_number?.message).toBe(REFUSAL)
        )
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(rendered.result.current.isDirty).toBe(true)
        expect(rendered.result.current.form.getValues().next_number).toBe('500')
        expect(rendered.result.current.form.getValues().prefix).toBe('AB-')
    })

    it.each([
        ['message', () => messageRefusal(REFUSAL)],
        ['field-map', () => serverRefusal('next_number', REFUSAL)],
    ])('submits and writes again on a retry after a %s refusal', async (_name, refusal) => {
        seedBooks({ level: 'admin', sequences: [SEQ], refuseSequences: refusal() })
        const rendered = renderLiveSequence()
        await waitFor(() => expect(sequencesStore().get(SEQ.id)).toBeDefined())
        type(rendered, 'next_number', '500')
        act(() => rendered.result.current.submit())
        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.next_number?.message).toBe(REFUSAL)
        )
        await waitFor(() => expect(rendered.result.current.isPending).toBe(false))
        expect(sequenceWrites()).toHaveLength(1)

        liftRefusal()
        act(() => rendered.result.current.submit())

        await waitFor(() => expect(sequenceWrites()).toHaveLength(2))
        await waitFor(() => expect(sequencesStore().get(SEQ.id)?.next_number).toBe(500))
    })

    it('writes once when submit runs twice in the same tick', async () => {
        const release = holdWrites()
        const rendered = renderLiveSequence()
        await waitFor(() => expect(sequencesStore().get(SEQ.id)).toBeDefined())
        type(rendered, 'next_number', '2001')

        await act(async () => {
            rendered.result.current.submit()
            rendered.result.current.submit()
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(sequenceWrites()).toHaveLength(1)

        release()
        await waitFor(() => expect(rendered.result.current.isPending).toBe(false))
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
        expect(sequenceWrites()).toHaveLength(1)
        // A second mutation of identical values reaches no handler, but it still
        // succeeds and toasts, so the toast count shows how many ran.
        expect(useToastStore.getState().toasts.map(t => t.title)).toEqual(['Saved.'])
    })
})

describe('useSequenceForm submitted state with the sequence from the live query', () => {
    async function renderRefused(refusal: unknown) {
        seedBooks({ level: 'admin', sequences: [SEQ], refuseSequences: refusal })
        const rendered = renderLiveSequence()
        await waitFor(() => expect(sequencesStore().get(SEQ.id)).toBeDefined())
        return rendered
    }

    async function settle() {
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 30))
        })
    }

    it('keeps isSubmitted and the next_number error after a field-map refusal', async () => {
        const rendered = await renderRefused(serverRefusal('next_number', REFUSAL))
        type(rendered, 'next_number', '500')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.next_number?.message).toBe(REFUSAL)
        )
        await settle()
        expect(rendered.result.current.form.formState.isSubmitted).toBe(true)
        expect(rendered.result.current.form.formState.errors.next_number?.message).toBe(REFUSAL)
    })

    it('keeps isSubmitted after a zod failure', async () => {
        const rendered = await renderRefused(null)
        type(rendered, 'prefix', 'A_1')

        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.prefix?.message).toBeDefined()
        )
        await settle()
        expect(rendered.result.current.form.formState.isSubmitted).toBe(true)
    })

    it('clears isSubmitted and the errors after a successful save', async () => {
        const rendered = await renderRefused(null)
        type(rendered, 'next_number', '2001')

        act(() => rendered.result.current.submit())

        await waitFor(() => expect(sequencesStore().get(SEQ.id)?.next_number).toBe(2001))
        await waitFor(() => expect(rendered.result.current.isPending).toBe(false))
        await settle()
        expect(rendered.result.current.form.formState.isSubmitted).toBe(false)
        expect(rendered.result.current.form.formState.errors).toEqual({})
    })

    it('shows the new error again when a retry is refused', async () => {
        const rendered = await renderRefused(messageRefusal(REFUSAL))
        type(rendered, 'next_number', '500')
        act(() => rendered.result.current.submit())
        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.next_number?.message).toBe(REFUSAL)
        )
        await waitFor(() => expect(rendered.result.current.isPending).toBe(false))

        liftRefusal()
        seedBooks({
            level: 'admin',
            sequences: [SEQ],
            refuseSequences: serverRefusal('next_number', 'Second refusal'),
        })
        act(() => rendered.result.current.submit())

        await waitFor(() =>
            expect(rendered.result.current.form.formState.errors.next_number?.message).toBe(
                'Second refusal'
            )
        )
        expect(rendered.result.current.form.formState.isSubmitted).toBe(true)
    })
})

// The doc_type ordering test returns with the first unit that adds a second doc_type to
// books_doc_sequences (today the select allows only 'journal').
describe('useDocSequences', () => {
    it('is not ready while the rows have not loaded', async () => {
        seedBooks({ level: 'admin', sequencesNeverReady: true })
        const rendered = renderHook(() => useDocSequences(), { wrapper })
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 20))
        })

        expect(rendered.result.current.isReady).toBe(false)
    })

    it('sets hasLoadError when the load fails, and retryLoad recovers', async () => {
        seedBooks({ level: 'admin', sequences: [SEQ], sequencesFailsOnce: true })
        expectLiveQueryError(sequencesStore().id)
        const rendered = renderHook(() => useDocSequences(), { wrapper })
        await waitFor(() => expect(rendered.result.current.hasLoadError).toBe(true))

        act(() => rendered.result.current.retryLoad())

        await waitFor(() => expect(rendered.result.current.hasLoadError).toBe(false))
        await waitFor(() => expect(rendered.result.current.sequences?.[0]?.id).toBe(SEQ.id))
    })
})
