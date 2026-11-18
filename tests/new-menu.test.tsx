// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { describe, expect, it, vi } from 'vitest'
import { NewMenu } from '../tinycld/books/components/NewMenu'
import { accessFromRow } from '../tinycld/books/lib/access'
import { NEW_ACTIONS_FIXTURE } from '../tinycld/books/lib/books-shell-fixture'
import { NEW_ACTIONS, newMenuForAccess } from '../tinycld/books/lib/shell-nav'
import { byTestId } from './accounts-test-rows'

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

    // The real registry: Bill follows Vendor in the Vendors column (spec §3.2).
    it('draws Bill right after Vendor and opens books/bills/new from it', () => {
        const { onSelect } = renderOpenMenu(newMenuForAccess(access, NEW_ACTIONS))
        const vendor = byTestId(document.body, 'books-new-vendor')
        const bill = byTestId(document.body, 'books-new-bill')
        expect(vendor).not.toBeNull()
        expect(bill).not.toBeNull()
        if (!vendor || !bill) return
        expect(bill.textContent).toContain('Bill')
        expect(vendor.compareDocumentPosition(bill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        fireEvent.click(bill)
        expect(onSelect).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'bill', href: 'books/bills/new' })
        )
    })

    // The real registry: Expense follows Bill in the Vendors column (expense spec §2).
    it('draws Expense right after Bill and opens books/expenses/new from it', () => {
        const { onSelect } = renderOpenMenu(newMenuForAccess(access, NEW_ACTIONS))
        const bill = byTestId(document.body, 'books-new-bill')
        const expense = byTestId(document.body, 'books-new-expense')
        expect(bill).not.toBeNull()
        expect(expense).not.toBeNull()
        if (!bill || !expense) return
        expect(expense.textContent).toContain('Expense')
        expect(
            bill.compareDocumentPosition(expense) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        fireEvent.click(expense)
        expect(onSelect).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'expense', href: 'books/expenses/new' })
        )
    })

    // The real registry: Vendor credit follows Expense in the Vendors column (vendor
    // credit spec §2).
    it('draws Vendor credit right after Expense and opens books/vendor-credits/new from it', () => {
        const { onSelect } = renderOpenMenu(newMenuForAccess(access, NEW_ACTIONS))
        const expense = byTestId(document.body, 'books-new-expense')
        const credit = byTestId(document.body, 'books-new-vendor-credit')
        expect(expense).not.toBeNull()
        expect(credit).not.toBeNull()
        if (!expense || !credit) return
        expect(credit.textContent).toContain('Vendor credit')
        expect(
            expense.compareDocumentPosition(credit) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        fireEvent.click(credit)
        expect(onSelect).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'vendor_credit', href: 'books/vendor-credits/new' })
        )
    })

    // The real registry: Vendor refund follows Vendor credit in the Vendors column (vendor
    // refund spec §2).
    it('draws Vendor refund right after Vendor credit and opens books/vendor-refunds/new from it', () => {
        const { onSelect } = renderOpenMenu(newMenuForAccess(access, NEW_ACTIONS))
        const credit = byTestId(document.body, 'books-new-vendor-credit')
        const refund = byTestId(document.body, 'books-new-vendor-refund')
        expect(credit).not.toBeNull()
        expect(refund).not.toBeNull()
        if (!credit || !refund) return
        expect(refund.textContent).toContain('Vendor refund')
        expect(
            credit.compareDocumentPosition(refund) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        fireEvent.click(refund)
        expect(onSelect).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'vendor_refund', href: 'books/vendor-refunds/new' })
        )
    })

    // The real registry: Receive payment follows Sales receipt in the Customers column
    // (receive payment spec §2).
    it('draws Receive payment right after Sales receipt and opens books/payments/new from it', () => {
        const { onSelect } = renderOpenMenu(newMenuForAccess(access, NEW_ACTIONS))
        const receipt = byTestId(document.body, 'books-new-sales-receipt')
        const payment = byTestId(document.body, 'books-new-receive-payment')
        expect(receipt).not.toBeNull()
        expect(payment).not.toBeNull()
        if (!receipt || !payment) return
        expect(payment.textContent).toContain('Receive payment')
        expect(
            receipt.compareDocumentPosition(payment) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        fireEvent.click(payment)
        expect(onSelect).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'receive_payment', href: 'books/payments/new' })
        )
    })

    // The real registry: Credit memo follows Receive payment in the Customers column
    // (credit memo spec §2).
    it('draws Credit memo right after Receive payment and opens books/credit-memos/new from it', () => {
        const { onSelect } = renderOpenMenu(newMenuForAccess(access, NEW_ACTIONS))
        const payment = byTestId(document.body, 'books-new-receive-payment')
        const creditMemo = byTestId(document.body, 'books-new-credit-memo')
        expect(payment).not.toBeNull()
        expect(creditMemo).not.toBeNull()
        if (!payment || !creditMemo) return
        expect(creditMemo.textContent).toContain('Credit memo')
        expect(
            payment.compareDocumentPosition(creditMemo) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        fireEvent.click(creditMemo)
        expect(onSelect).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'credit_memo', href: 'books/credit-memos/new' })
        )
    })

    it('draws only the heading of a single non-empty column', () => {
        renderOpenMenu(columns.filter(column => column.heading === 'Vendors'))
        expect(screen.getByText('Vendors')).toBeTruthy()
        expect(screen.queryByText('Customers')).toBeNull()
        expect(screen.queryByText('Other')).toBeNull()
    })
})
