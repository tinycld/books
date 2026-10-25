import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { settledBox } from './account-register-helpers'
import {
    ACCOUNT_LABELS,
    DESKTOP,
    fillLine,
    isPhone,
    openNewEntry,
    PHONE,
} from './journal-entries-helpers'

// The new-entry form (`entries/new`): header fields, the editable line grid
// (table on wide screens, cards on phones), one-sided amount cells, the line
// menu, the account picker and the live totals. Every test only opens the form
// and types into it; nothing is saved, so the spec writes nothing. The accounts
// it reads are seeded (the seeded-fixture exception).
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

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
    const box = await settledBox(locator)
    if (!box) throw new Error('element has no layout box')
    return box
}

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

function hasScrollableAncestor(locator: Locator): Promise<boolean> {
    return locator.evaluate(el => {
        for (let node = el.parentElement; node; node = node.parentElement) {
            const style = getComputedStyle(node)
            const scrollsY = style.overflowY === 'auto' || style.overflowY === 'scroll'
            const scrollsX = style.overflowX === 'auto' || style.overflowX === 'scroll'
            if (scrollsY || scrollsX) return true
        }
        return false
    })
}

// The cell is the input's parent element.
function cellBoxOf(input: Locator): Promise<Box> {
    return input.evaluate(el => {
        const box = (el.parentElement as HTMLElement).getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width, height: box.height }
    })
}

for (const [sizeName, size] of SIZES) {
    test.describe(`journal-entries: new entry form (${sizeName})`, () => {
        test('open: header fields, helper text and two blank lines', async ({ page }) => {
            await start(page, size)

            await expect(page.getByTestId('entry-title')).toHaveText('New journal entry')
            await expect(page.getByTestId('entry-back')).toHaveText('Journal entries')
            await expect(page.getByTestId('entry-date')).toHaveValue(todayIso())
            await expect(page.getByTestId('entry-number')).toHaveText('Assigned when posted')
            await expect(page.getByTestId('entry-memo')).toBeVisible()
            await expect(page.getByTestId('entry-auto-reverse')).toBeVisible()
            await expect(page.getByText('Posts a reversing entry on this date')).toBeVisible()
            await expect(lineRows(page)).toHaveCount(2)
        })

        test('add line appends a line', async ({ page }) => {
            await start(page, size)

            await page.getByTestId('entry-add-line').click()
            await expect(lineRows(page)).toHaveCount(3)

            if (!isPhone(page)) {
                await page.getByTestId('entry-line-memo-2').press('Enter')
                await expect(lineRows(page)).toHaveCount(4)
            }
        })

        test('an amount cell holds one side', async ({ page }) => {
            await start(page, size)
            const debit = page.getByTestId('entry-line-debit-0')
            const credit = page.getByTestId('entry-line-credit-0')

            await debit.fill('100')
            await credit.fill('50')
            await expect(debit).toHaveValue('')
            await expect(credit).toHaveValue('50')

            await debit.fill('25')
            await expect(credit).toHaveValue('')
            await expect(debit).toHaveValue('25')
        })

        test('amounts show the formatted money on blur', async ({ page }) => {
            await start(page, size)
            const debit = page.getByTestId('entry-line-debit-0')

            await debit.fill('1234.5')
            await debit.blur()
            await expect(debit).toHaveValue('$1,234.50')

            await debit.fill('$1,234.5')
            await debit.blur()
            await expect(debit).toHaveValue('$1,234.50')
        })

        test('totals: out of balance, in balance and too large', async ({ page }) => {
            await start(page, size)
            await fillLine(page, 0, { account: ACCOUNT_LABELS.checking, debit: '$400.00' })
            await fillLine(page, 1, { account: ACCOUNT_LABELS.equity, credit: '$350.00' })

            await expect(page.getByTestId('entry-total-debits')).toHaveText('$400.00')
            await expect(page.getByTestId('entry-total-credits')).toHaveText('$350.00')
            await expect(page.getByTestId('entry-balance-status')).toHaveText(
                'Out of balance by $50.00'
            )

            await fillLine(page, 1, { credit: '$400.00' })
            await expect(page.getByTestId('entry-balance-status')).toHaveText('In balance')
            await expect(page.getByTestId('entry-big-total')).toHaveText('$400.00')

            await fillLine(page, 0, { debit: '$50,000,000,000,000.00' })
            await fillLine(page, 1, { debit: '$50,000,000,000,000.00' })
            await expect(page.getByTestId('entry-balance-status')).toContainText('Too large')
        })

        test('line menu moves and deletes lines', async ({ page }) => {
            await start(page, size)
            await fillLine(page, 0, { account: ACCOUNT_LABELS.checking })
            await fillLine(page, 1, { account: ACCOUNT_LABELS.equity })
            const account0 = page.getByTestId('entry-line-account-0')
            const account1 = page.getByTestId('entry-line-account-1')

            await page.getByTestId('entry-line-menu-0').click()
            await expect(page.getByRole('menuitem', { name: 'Move up', exact: true })).toBeVisible()
            await expect(
                page.getByRole('menuitem', { name: 'Move down', exact: true })
            ).toBeVisible()
            await expect(
                page.getByRole('menuitem', { name: 'Delete line', exact: true })
            ).toBeVisible()
            await page.getByRole('menuitem', { name: 'Move down', exact: true }).click()
            await expect(account0).toHaveText(ACCOUNT_LABELS.equity)
            await expect(account1).toHaveText(ACCOUNT_LABELS.checking)

            await page.getByTestId('entry-line-menu-1').click()
            await page.getByRole('menuitem', { name: 'Move up', exact: true }).click()
            await expect(account0).toHaveText(ACCOUNT_LABELS.checking)
            await expect(account1).toHaveText(ACCOUNT_LABELS.equity)

            await page.getByTestId('entry-line-menu-1').click()
            await page.getByRole('menuitem', { name: 'Delete line', exact: true }).click()
            await expect(lineRows(page)).toHaveCount(1)
        })

        test('move down swaps rows without remounting and carries every field', async ({
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
            await page.getByTestId('entry-line-0').evaluate(el => {
                el.dataset.k = '1'
            })

            await page.getByTestId('entry-line-menu-0').click()
            await page.getByRole('menuitem', { name: 'Move down', exact: true }).click()

            await expect(page.getByTestId('entry-line-1')).toHaveAttribute('data-k', '1')
            await expect(page.getByTestId('entry-line-0')).not.toHaveAttribute('data-k', '1')
            await expect(page.getByTestId('entry-line-0')).toBeVisible()
            await expect(page.getByTestId('entry-line-account-0')).toHaveText(ACCOUNT_LABELS.equity)
            await expect(page.getByTestId('entry-line-credit-0')).toHaveValue('$10.00')
            await expect(page.getByTestId('entry-line-debit-0')).toHaveValue('')
            await expect(page.getByTestId('entry-line-memo-0')).toHaveValue('second')
            await expect(page.getByTestId('entry-line-account-1')).toHaveText(
                ACCOUNT_LABELS.checking
            )
            await expect(page.getByTestId('entry-line-debit-1')).toHaveValue('$10.00')
            await expect(page.getByTestId('entry-line-credit-1')).toHaveValue('')
            await expect(page.getByTestId('entry-line-memo-1')).toHaveValue('first')
        })

        test('a negative amount is flagged and not in balance', async ({ page }) => {
            await start(page, size)
            await page.getByTestId('entry-line-debit-0').fill('-5')
            await page.getByTestId('entry-line-debit-0').blur()

            const status = page.getByTestId('entry-balance-status')
            await expect(status).toHaveText('Check the amounts')
            await expect(status).not.toHaveText('In balance')
        })

        test('too large totals do not show $0.00', async ({ page }) => {
            await start(page, size)
            await fillLine(page, 0, { debit: '$50,000,000,000,000.00' })
            await fillLine(page, 1, { debit: '$50,000,000,000,000.00' })

            await expect(page.getByTestId('entry-balance-status')).toContainText('Too large')
            await expect(page.getByTestId('entry-big-total')).not.toHaveText('$0.00')
            await expect(page.getByTestId('entry-total-debits')).not.toHaveText('$0.00')
        })

        test('the New button is hidden on the form', async ({ page }) => {
            // The New FAB exists only on phones; a desktop assertion is vacuous.
            test.skip(sizeName !== 'phone', 'the New FAB is phone only')
            await start(page, size)
            await expect(page.getByTestId('entry-title')).toBeVisible()
            await expect(page.getByLabel('New', { exact: true })).toHaveCount(0)
        })

        test('account picker lists active accounts as "number name"', async ({ page }) => {
            await start(page, size)
            const picker = page.getByTestId('entry-line-account-0')
            const option = (name: string) => page.getByRole('menuitem', { name })

            await expect(picker).toBeVisible()
            await expect(picker).toHaveText('Choose account')
            await picker.click()
            await expect(option(ACCOUNT_LABELS.checking)).toHaveCount(1)
            await expect(option('Old Petty Cash')).toHaveCount(0)
            await expect(option('Design Tools')).toHaveCount(1)
            await option(ACCOUNT_LABELS.checking).click()
            await expect(picker).toHaveText(ACCOUNT_LABELS.checking)
        })

        test('the memo field is multi-line', async ({ page }) => {
            await start(page, size)
            const memo = page.getByTestId('entry-memo')

            await memo.click()
            await page.keyboard.type('first')
            await page.keyboard.press('Enter')
            await page.keyboard.type('second')
            await expect(memo).toBeFocused()
            await expect(memo).toHaveValue('first\nsecond')
        })

        test('header and totals have no scrollable ancestor', async ({ page }) => {
            await start(page, size)

            expect(await hasScrollableAncestor(page.getByTestId('entry-totals'))).toBe(false)
            expect(await hasScrollableAncestor(page.getByTestId('entry-title'))).toBe(false)
        })
    })
}

test.describe('journal-entries: new entry form (keyboard)', () => {
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

test.describe('journal-entries: new entry form (desktop line table)', () => {
    test('columns align, inputs are 44pt and stay inside their cells', async ({ page }) => {
        await start(page, DESKTOP)
        await page.getByTestId('entry-add-line').click()
        await expect(lineRows(page)).toHaveCount(3)

        const boxes: Box[] = []
        for (const heading of ['#', 'Account', 'Debit', 'Credit', 'Memo']) {
            const label = page
                .getByTestId('entry-screen')
                .getByText(heading, { exact: true })
                .last()
            await expect(label).toBeVisible()
            boxes.push(await boxOf(label))
        }
        for (let i = 1; i < boxes.length; i++) {
            expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x)
        }

        for (const side of ['debit', 'credit']) {
            const group = [
                await boxOf(page.getByTestId(`entry-line-${side}-0`)),
                await boxOf(page.getByTestId(`entry-line-${side}-1`)),
                await boxOf(page.getByTestId(`entry-line-${side}-2`)),
            ]
            for (const box of group.slice(1)) {
                expect(box.width).toBeCloseTo(group[0].width, 0)
                expect(box.x + box.width).toBeCloseTo(group[0].x + group[0].width, 0)
            }
        }

        for (let i = 0; i < 3; i++) {
            for (const column of ['account', 'debit', 'credit', 'memo']) {
                const input = page.getByTestId(`entry-line-${column}-${i}`)
                const box = await boxOf(input)
                const cell = await cellBoxOf(input)
                expect(box.height).toBeGreaterThanOrEqual(44)
                expect(box.x + box.width).toBeLessThanOrEqual(cell.x + cell.width + 0.5)
                expect(box.x).toBeGreaterThanOrEqual(cell.x - 0.5)
            }
        }
    })
})

test.describe('journal-entries: new entry form (phone line cards)', () => {
    test('each line is a card: account above, debit and credit side by side', async ({ page }) => {
        await start(page, PHONE)

        for (let i = 0; i < 2; i++) {
            const card = await boxOf(page.getByTestId(`entry-line-${i}`))
            const account = await boxOf(page.getByTestId(`entry-line-account-${i}`))
            const debit = await boxOf(page.getByTestId(`entry-line-debit-${i}`))
            const credit = await boxOf(page.getByTestId(`entry-line-credit-${i}`))

            expect(account.y + account.height).toBeLessThanOrEqual(debit.y + 1)
            expect(credit.y).toBeCloseTo(debit.y, 0)
            expect(credit.x).toBeGreaterThan(debit.x + debit.width - 1)
            expect(debit.height).toBeGreaterThanOrEqual(44)
            expect(credit.height).toBeGreaterThanOrEqual(44)
            expect(credit.x + credit.width).toBeLessThanOrEqual(card.x + card.width + 0.5)
        }
    })
})
