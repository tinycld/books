// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { describe, expect, it, vi } from 'vitest'
import { NewMenu } from '../tinycld/books/components/NewMenu'
import { accessFromRow } from '../tinycld/books/lib/access'
import { NEW_ACTIONS_FIXTURE } from '../tinycld/books/lib/books-shell-fixture'
import { newMenuForAccess } from '../tinycld/books/lib/shell-nav'

function renderOpenMenu(
    columns: ReturnType<typeof newMenuForAccess>,
    onSelect = vi.fn(),
    onOpenChange = vi.fn()
) {
    render(
        <OverlayProvider>
            <NewMenu columns={columns} onSelect={onSelect} isOpen onOpenChange={onOpenChange} />
        </OverlayProvider>
    )
    return { onSelect, onOpenChange }
}

describe('newMenuForAccess', () => {
    it('returns no columns below bookkeeper level', () => {
        const access = accessFromRow({ level: 'read_only' }, true)
        expect(newMenuForAccess(access, NEW_ACTIONS_FIXTURE)).toEqual([])
    })

    it('returns the three columns for a bookkeeper', () => {
        const access = accessFromRow({ level: 'bookkeeper' }, true)
        const columns = newMenuForAccess(access, NEW_ACTIONS_FIXTURE)
        expect(columns.map(column => column.heading)).toEqual(['Customers', 'Vendors', 'Other'])
    })
})

describe('NewMenu', () => {
    const access = accessFromRow({ level: 'bookkeeper' }, true)
    const columns = newMenuForAccess(access, NEW_ACTIONS_FIXTURE)

    it('shows every heading and action label when open', () => {
        renderOpenMenu(columns)
        for (const heading of ['Customers', 'Vendors', 'Other']) {
            expect(screen.getByText(heading)).toBeTruthy()
        }
        for (const action of NEW_ACTIONS_FIXTURE) {
            expect(screen.getByText(action.label)).toBeTruthy()
        }
    })

    it('calls onSelect with the pressed action and closes the popover', () => {
        const { onSelect, onOpenChange } = renderOpenMenu(columns)
        fireEvent.click(screen.getByText('Receive payment'))
        expect(onOpenChange).toHaveBeenCalledWith(false)
        expect(onSelect).toHaveBeenCalledWith(
            NEW_ACTIONS_FIXTURE.find(action => action.id === 'receive-payment')
        )
    })

    it('draws only the heading of a single non-empty column', () => {
        renderOpenMenu(columns.filter(column => column.heading === 'Vendors'))
        expect(screen.getByText('Vendors')).toBeTruthy()
        expect(screen.queryByText('Customers')).toBeNull()
        expect(screen.queryByText('Other')).toBeNull()
    })
})
