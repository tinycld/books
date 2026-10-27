import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { ACCOUNT_LABELS, DESKTOP, fillLine, openNewEntry, PHONE } from './journal-entries-helpers'

// The new-entry form (`entries/new`): the date pickers, the editable line grid
// (table on wide screens, cards on phones), one-sided amount cells, the line
// menu, the account picker and the live totals. Every test only opens the form
// and types into it; nothing is saved, so the spec writes nothing. The accounts
// it reads are seeded (the seeded-fixture exception). The phone card grid shares
// its cells, line menu and picker with the desktop table, so only the line menu
// flow runs at both sizes.
//
// It does not cover: the action bar (Save draft, Post, Cancel), which
// checkpoint 6 asserts; a read-only user, because the seed has no read-only
// Books member, so `entry-no-access` on `entries/new`, the missing `entries-new`
// button and the missing row-menu actions cannot be driven. That gate is one
// `canWrite` check from `useBooksAccess` in `new.tsx`, `EntryToolbar` and
// `EntryRowMenu`; the decision rules are covered by the pure `entryActions` and
// `newEntryVisible` tests, and Level none belongs to the shell. The line
// limit (200) is covered by `tests/entry-schema.test.ts`.

const SIZES = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
] as const

function todayIso() {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${now.getFullYear()}-${month}-${day}`
}

function lineRows(page: Page): Locator {
    return page.getByTestId(/^entry-line-\d+$/)
}

async function start(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
    await openNewEntry(page)
}

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: new entry form (${sizeName})`, () => {
        test('line menu: move down carries every field without remount, move up restores, delete removes', async ({
            page,
        }) => {
            await start(page, size)
            await fillLine(page, 0, {
                account: ACCOUNT_LABELS.checking,
                debit: '$10.00',
                memo: 'first',
            })
            await fillLine(page, 1, {
                account: ACCOUNT_LABELS.equity,
                credit: '$10.00',
                memo: 'second',
            })
            const account0 = page.getByTestId('entry-line-account-0')
            const account1 = page.getByTestId('entry-line-account-1')
            await page.getByTestId('entry-line-0').evaluate(el => {
                el.dataset.k = '1'
            })

            await page.getByTestId('entry-line-menu-0').click()
            await page.getByRole('menuitem', { name: 'Move down', exact: true }).click()

            await expect(page.getByTestId('entry-line-1')).toHaveAttribute('data-k', '1')
            await expect(page.getByTestId('entry-line-0')).not.toHaveAttribute('data-k', '1')
            await expect(page.getByTestId('entry-line-0')).toBeVisible()
            await expect(account0).toHaveText(ACCOUNT_LABELS.equity)
            await expect(page.getByTestId('entry-line-credit-0')).toHaveValue('$10.00')
            await expect(page.getByTestId('entry-line-debit-0')).toHaveValue('')
            await expect(page.getByTestId('entry-line-memo-0')).toHaveValue('second')
            await expect(account1).toHaveText(ACCOUNT_LABELS.checking)
            await expect(page.getByTestId('entry-line-debit-1')).toHaveValue('$10.00')
            await expect(page.getByTestId('entry-line-credit-1')).toHaveValue('')
            await expect(page.getByTestId('entry-line-memo-1')).toHaveValue('first')

            await page.getByTestId('entry-line-menu-1').click()
            await page.getByRole('menuitem', { name: 'Move up', exact: true }).click()
            await expect(account0).toHaveText(ACCOUNT_LABELS.checking)
            await expect(account1).toHaveText(ACCOUNT_LABELS.equity)

            await page.getByTestId('entry-line-menu-1').click()
            await page.getByRole('menuitem', { name: 'Delete line', exact: true }).click()
            await expect(lineRows(page)).toHaveCount(1)
        })
    })
}

test.describe('journal-entries: new entry form (desktop)', () => {
    test("the date fields open core's calendar and a picked day fills the field", async ({
        page,
    }) => {
        await start(page, DESKTOP)
        const firstOfMonth = `${todayIso().slice(0, 8)}01`

        for (const field of ['entry-date', 'entry-auto-reverse']) {
            await page.getByTestId(`${field}-open`).click()
            await page.getByLabel(firstOfMonth, { exact: true }).first().click()
            await expect(page.getByTestId(field)).toHaveValue(firstOfMonth)
        }
    })

    test('amount cells: one side only, formatted on blur', async ({ page }) => {
        await start(page, DESKTOP)
        const debit = page.getByTestId('entry-line-debit-0')
        const credit = page.getByTestId('entry-line-credit-0')

        await debit.fill('100')
        await credit.fill('50')
        await expect(debit).toHaveValue('')
        await expect(credit).toHaveValue('50')

        await debit.fill('25')
        await expect(credit).toHaveValue('')
        await expect(debit).toHaveValue('25')

        await debit.fill('1234.5')
        await debit.blur()
        await expect(debit).toHaveValue('$1,234.50')

        await debit.fill('$1,234.5')
        await debit.blur()
        await expect(debit).toHaveValue('$1,234.50')
    })

    test('totals: negative, out of balance, in balance, too large', async ({ page }) => {
        await start(page, DESKTOP)
        const status = page.getByTestId('entry-balance-status')

        await page.getByTestId('entry-line-debit-0').fill('-5')
        await page.getByTestId('entry-line-debit-0').blur()
        await expect(status).toHaveText('Check the amounts')

        await fillLine(page, 0, { account: ACCOUNT_LABELS.checking, debit: '$400.00' })
        await fillLine(page, 1, { account: ACCOUNT_LABELS.equity, credit: '$350.00' })
        await expect(page.getByTestId('entry-total-debits')).toHaveText('$400.00')
        await expect(page.getByTestId('entry-total-credits')).toHaveText('$350.00')
        await expect(status).toHaveText('Out of balance by $50.00')

        await fillLine(page, 1, { credit: '$400.00' })
        await expect(status).toHaveText('In balance')
        await expect(page.getByTestId('entry-big-total')).toHaveText('$400.00')

        await fillLine(page, 0, { debit: '$50,000,000,000,000.00' })
        await fillLine(page, 1, { debit: '$50,000,000,000,000.00' })
        await expect(status).toContainText('Too large')
        await expect(page.getByTestId('entry-big-total')).not.toHaveText('$0.00')
        await expect(page.getByTestId('entry-total-debits')).not.toHaveText('$0.00')
    })

    test('account picker lists active accounts as "number name"', async ({ page }) => {
        await start(page, DESKTOP)
        const picker = page.getByTestId('entry-line-account-0')
        const option = (name: string) => page.getByRole('menuitem', { name })

        await picker.click()
        await expect(option(ACCOUNT_LABELS.checking)).toHaveCount(1)
        await expect(option('Old Petty Cash')).toHaveCount(0)
        await expect(option('Design Tools')).toHaveCount(1)
        await option(ACCOUNT_LABELS.checking).click()
        await expect(picker).toHaveText(ACCOUNT_LABELS.checking)
    })

    test('the memo field is multi-line', async ({ page }) => {
        await start(page, DESKTOP)
        const memo = page.getByTestId('entry-memo')

        await memo.click()
        await page.keyboard.type('first')
        await page.keyboard.press('Enter')
        await page.keyboard.type('second')
        await expect(memo).toBeFocused()
        await expect(memo).toHaveValue('first\nsecond')
    })

    test('Enter in the last memo adds a line and focuses its account', async ({ page }) => {
        await start(page, DESKTOP)

        await page.getByTestId('entry-line-memo-1').press('Enter')

        await expect(lineRows(page)).toHaveCount(3)
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const active = document.activeElement
                    const target = document.querySelector('[data-testid="entry-line-account-2"]')
                    return !!active && !!target && target.contains(active)
                })
            )
            .toBe(true)
    })
})
