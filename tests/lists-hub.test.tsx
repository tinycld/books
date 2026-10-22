// @vitest-environment happy-dom
import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { router } from 'expo-router'
import { describe, expect, it } from 'vitest'
import { ListsHub } from '../tinycld/books/components/ListsHub'
import { useListsHub } from '../tinycld/books/hooks/useListsHub'
import { LIST_ENTRIES_FIXTURE } from '../tinycld/books/lib/books-shell-fixture'
import type { ListEntry } from '../tinycld/books/lib/shell-nav'

const hidden: ListEntry = {
    id: 'hidden',
    label: 'Hidden list',
    description: 'Not built yet',
    href: 'books/hidden',
    available: false,
}

describe('useListsHub', () => {
    it('returns only the available entries as cards', () => {
        const { result } = renderHook(() => useListsHub([...LIST_ENTRIES_FIXTURE, hidden]))
        expect(result.current.cards.map(card => card.id)).toEqual(['accounts', 'customers'])
        expect(result.current.isEmpty).toBe(false)
    })

    it('is empty when no entry is available', () => {
        const { result } = renderHook(() => useListsHub([hidden]))
        expect(result.current.cards).toEqual([])
        expect(result.current.isEmpty).toBe(true)
    })
})

describe('ListsHub', () => {
    it('shows each entry label and description', () => {
        render(<ListsHub entries={LIST_ENTRIES_FIXTURE} />)
        for (const entry of LIST_ENTRIES_FIXTURE) {
            expect(screen.getByText(entry.label)).toBeTruthy()
            expect(screen.getByText(entry.description)).toBeTruthy()
        }
        expect(screen.queryByText('No lists yet')).toBeNull()
    })

    it('shows the empty state when no entry is available', () => {
        render(<ListsHub entries={[hidden]} />)
        expect(screen.getByText('No lists yet')).toBeTruthy()
        expect(screen.queryByText('Hidden list')).toBeNull()
    })

    it('navigates to the entry href when a card is pressed', () => {
        render(<ListsHub entries={LIST_ENTRIES_FIXTURE} />)
        fireEvent.click(screen.getByText('Accounts'))
        expect(router.push).toHaveBeenCalledWith('/a/books/accounts')
    })
})
