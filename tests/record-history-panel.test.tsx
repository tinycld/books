// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RecordHistoryPanel from '../tinycld/books/components/history/RecordHistoryPanel'
import { byTestId } from './accounts-test-rows'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// Core passes the path after `books/history/`; only `[collection, id]` names a record.
describe('RecordHistoryPanel: a malformed path', () => {
    it.each([
        ['one segment', ['books_products']],
        ['three segments', ['books_products', 'bkproduct000001', 'extra']],
    ])('with %s renders the empty state', (_name, segments) => {
        const { container } = render(<RecordHistoryPanel segments={segments} />)
        expect(byTestId(container, 'history-empty')?.textContent).toBe(
            'No changes recorded for this record.'
        )
        expect(byTestId(container, 'history-events')).toBeNull()
    })
})
