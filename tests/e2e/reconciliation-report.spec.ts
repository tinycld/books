import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { shortDay } from '@tinycld/core/reports/lib/dates'
import { DESKTOP } from './account-register-helpers'
import { reportSnapshot, snapshotWhen } from './books-report-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import {
    createReconcileAccount,
    daysAgo,
    finishOneStatement,
    openFinishedSummary,
    postDatedEntry,
} from './reconcile-helpers'
import { uniqueName } from './record-form-helpers'

// Reconciliation report spec §3 "The finished summary" (View report, key R) and "The
// Reconciliation Report": the report opens with the Statement filter set to the
// reconciliation, its section shows the beginning balance, the cleared rows with a running
// balance and the section total, and a row opens its transaction. Each test makes its own
// bank account in the Chart of Accounts, posts its own entries against 3000 Owner's Equity,
// dated today or a few days before, and finishes its own reconciliations.

async function signIn(page: Page): Promise<void> {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// A figure cell without the currency sign that total rows carry.
function figure(text: string | undefined): string {
    return (text ?? '').replace('$', '')
}

function reportUrlOf(reconciliationId: string): RegExp {
    return new RegExp(
        `/a/books/reports/[a-z0-9]{15}\\?(?:.*&)?p-statement=${reconciliationId}(?:&|$)`
    )
}

test.describe('reconciliation-report: report', () => {
    test("View report shows the statement's section", async ({ page }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'bank')
        const stamp = uniqueName('rr')
        const firstDeposit = `${stamp} first deposit`
        const deposit = `${stamp} deposit`
        const payment = `${stamp} payment`

        await postDatedEntry(page, {
            memo: firstDeposit,
            amount: '100.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(4),
        })
        // Every entry is posted before the first reconciliation: a second visit of the
        // entries list after a sidebar push would leave two entries screens (lesson 38). The
        // first statement lists only the entry dated on or before it.
        await postDatedEntry(page, {
            memo: deposit,
            amount: '50.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(2),
        })
        await postDatedEntry(page, {
            memo: payment,
            amount: '20.00',
            debitAccount: ACCOUNT_LABELS.equity,
            creditAccount: name,
            date: daysAgo(1),
        })
        await finishOneStatement(page, {
            accountName: name,
            date: daysAgo(3),
            balance: '100.00',
            clears: [firstDeposit],
        })
        const statementDate = daysAgo(0)
        const second = await finishOneStatement(page, {
            accountName: name,
            date: statementDate,
            balance: '130.00',
            clears: [deposit, payment],
        })

        const viewReport = page.getByTestId('reconcile-view-report').filter({ visible: true })
        await expect(viewReport).toBeVisible()
        await viewReport.click()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await expect(page).toHaveURL(reportUrlOf(second.id))

        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.rows.some(row => row.kind === 'subtotal'),
            "the statement's section and its total"
        )
        const sections = snapshot.rows.filter(row => row.kind === 'group')
        expect(sections.map(row => row.label)).toHaveLength(1)
        const section = sections[0]
        expect(section.label.startsWith(name), `section label "${section.label}"`).toBe(true)
        expect(section.label).toContain('reconciled by')
        expect(section.cells.statement).toBe(shortDay(statementDate))

        const opening = snapshot.rows.find(row => row.kind === 'opening')
        expect(opening?.label).toBe('Beginning balance')
        expect(figure(opening?.cells.balance)).toBe('100.00')

        // Only the second statement's cleared rows, in date order: the first statement's
        // deposit is not in the report when the link set the Statement filter.
        const lines = snapshot.rows.filter(row => row.kind === 'detail')
        expect(lines.map(row => row.cells.memo)).toEqual([deposit, payment])
        expect(lines.map(row => figure(row.cells.debit))).toEqual(['50.00', ''])
        expect(lines.map(row => figure(row.cells.credit))).toEqual(['', '20.00'])
        expect(lines.map(row => figure(row.cells.balance))).toEqual(['150.00', '130.00'])

        const total = snapshot.rows.find(row => row.kind === 'subtotal')
        expect(total?.label).toBe(`Total ${section.label}`)
        expect(figure(total?.cells.balance)).toBe('130.00')
    })

    test('a report row opens its transaction, and R opens the report', async ({ page }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'bank')
        const deposit = uniqueName('rr open deposit')
        await postDatedEntry(page, {
            memo: deposit,
            amount: '75.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(1),
        })
        const statement = await finishOneStatement(page, {
            accountName: name,
            date: daysAgo(0),
            balance: '75.00',
            clears: [deposit],
        })

        await openFinishedSummary(page, name)
        // The key registers with the button it belongs to (lesson 41).
        await expect(
            page.getByTestId('reconcile-view-report').filter({ visible: true })
        ).toBeVisible()
        await page.keyboard.press('r')
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await expect(page).toHaveURL(reportUrlOf(statement.id))

        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.rows.some(row => row.kind === 'detail' && row.cells.memo === deposit),
            `the cleared row ${deposit}`
        )
        const line = snapshot.rows.find(row => row.kind === 'detail' && row.cells.memo === deposit)
        if (!line) throw new Error(`no cleared row ${deposit}`)
        const label = page.getByTestId(`report-row-${line.id}`)
        await expect(label).toHaveRole('link')
        await label.click()
        await expect(page).toHaveURL(/\/books\/entries\/[a-z0-9]{15}$/)
        // postDatedEntry left the read view of this same entry mounted, hidden, in the
        // Journal Entries stack (lessons 5 and 38).
        await expect(page.getByTestId('entry-detail-memo').filter({ visible: true })).toContainText(
            deposit
        )
    })
})
