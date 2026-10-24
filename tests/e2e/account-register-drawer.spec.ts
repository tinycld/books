import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    chooseViewRegister,
    DESKTOP,
    openRegister,
    PHONE,
    REGISTER_SEED,
} from './account-register-helpers'

// Journal entry creation has no UI until `p1-journal-entries`, so the register
// has nothing it can create through the UI. The entries it reads are posted by
// `seed.ts` through the server's posting hook (dated relative to today, so the
// spec never depends on the calendar). That is the seeded-fixture exception:
// the interaction under test (reading the register, opening the entry drawer)
// is driven through the UI; only the pre-existing ledger state is seeded. The
// spec writes nothing. It does not cover a draft entry in the drawer (a
// register only lists posted lines), a negative running balance, or the
// Escape key (not a closing path in this unit). All data is read through the UI.

const MONEY = /^-?\$[\d,]+\.\d{2}$/
const CARDS = '[data-testid^="register-card-"]'
const ROWS = '[data-testid^="register-row-"]'
const LINES = '[data-testid^="register-drawer-line-"]'
const ACCENT = /(^|\s)bg-accent(\s|$)/
const TABLET = { width: 900, height: 1000 }
const DESKTOP_TALL = { width: 1280, height: 900 }

const SIZES: [string, { width: number; height: number }][] = [
    ['desktop', DESKTOP],
    ['phone', PHONE],
]

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
    const box = await locator.boundingBox()
    if (!box) throw new Error('element has no layout box')
    return box
}

async function openChecking(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
    await openRegister(page, 'Business Checking')
    await page.getByTestId('register-range').click()
    await page.getByRole('menuitem', { name: 'This fiscal year', exact: true }).click()
    await expect(page.getByTestId('register-range')).toContainText('This fiscal year')
}

function cardByMemo(page: Page, memo: string) {
    return page.locator(CARDS).filter({ hasText: memo })
}

function rowByMemo(page: Page, memo: string) {
    return page.locator(ROWS).filter({ hasText: memo })
}

function drawer(page: Page) {
    return page.getByTestId('register-entry-drawer')
}

async function noSideScroll(page: Page) {
    return page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
}

test.describe('account-register: cards and drawer', () => {
    test('phone: the register is a list of cards that fit the screen', async ({ page }) => {
        await openChecking(page, PHONE)

        await expect(page.locator(CARDS).first()).toBeVisible()
        await expect(page.locator(ROWS)).toHaveCount(0)

        const cards = page.locator(CARDS)
        const count = await cards.count()
        expect(count).toBeGreaterThan(3)
        for (let i = 0; i < count; i++) {
            const box = await boxOf(cards.nth(i))
            expect(box.height).toBeGreaterThanOrEqual(44)
            expect(box.x).toBeGreaterThanOrEqual(0)
            expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width)
        }

        const sale = cardByMemo(page, REGISTER_SEED.sale)
        await expect(sale).toHaveCount(1)
        await expect(sale).toContainText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/)
        await expect(sale).toContainText(REGISTER_SEED.sale)
        const saleId = ((await sale.getAttribute('data-testid')) ?? '').replace(
            'register-card-',
            ''
        )
        await expect(page.getByTestId(`register-ref-${saleId}`)).toHaveText(/\S/)
        await expect(sale).toContainText('Accounts receivable')
        await expect(sale).toContainText('Debit')
        await expect(sale).toContainText('Journal entry')
        const saleText = await sale.innerText()
        expect(saleText.replace(/\s+/g, ' ')).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4}\s+\S+\s+\S/)

        const money = sale.getByText(MONEY)
        await expect(money).toHaveCount(2)
        await expect(money.first()).toHaveText('$1,250.00')
        const amount = await boxOf(money.first())
        const balance = await boxOf(money.nth(1))
        expect(balance.y).toBeGreaterThanOrEqual(amount.y + amount.height - 1)
        expect(Math.round(balance.x + balance.width)).toBe(Math.round(amount.x + amount.width))

        await expect(cardByMemo(page, REGISTER_SEED.split)).toContainText('-Split-')
        await expect(cardByMemo(page, REGISTER_SEED.voidOriginal)).toContainText('Void')
        await expect(page.locator(CARDS).filter({ hasText: 'Void reversal of' })).not.toHaveCount(0)

        const tops: number[] = []
        const heights = new Set<number>()
        for (let i = 0; i < count; i++) {
            const box = await boxOf(cards.nth(i))
            tops.push(box.y)
            heights.add(Math.round(box.height))
        }
        expect(tops).toEqual([...tops].sort((a, b) => a - b))
        expect(new Set(tops).size).toBe(tops.length)
        expect(heights.size).toBe(1)

        const opening = page.getByTestId('register-opening-card')
        await expect(opening).toBeVisible()
        await expect(opening.getByText(MONEY)).toHaveCount(1)
        await expect(opening).not.toContainText('Debit')
        await expect(opening).not.toContainText('Credit')
        const lastCard = await boxOf(cards.last())
        expect((await boxOf(opening)).y).toBeGreaterThan(lastCard.y)
    })

    test('phone: the second line of a card reads with spaces around the dot', async ({ page }) => {
        await openChecking(page, PHONE)
        const sale = cardByMemo(page, REGISTER_SEED.sale)
        await expect(sale).toBeVisible()
        const text = await sale.evaluate(el => (el instanceof HTMLElement ? el.innerText : ''))
        expect(text).toContain('Accounts receivable \u00b7 Journal entry')
    })

    test('phone: a long memo is cut short and its figures stay visible', async ({ page }) => {
        await openChecking(page, PHONE)
        const card = cardByMemo(page, 'Register long memo')
        await expect(card).toHaveCount(1)
        const memo = card.getByText(/^Register long memo/)
        const clamp = await memo.evaluate(el => {
            if (!(el instanceof HTMLElement)) return null
            const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight)
            return {
                lines: Math.round(el.clientHeight / lineHeight),
                cut: el.scrollHeight > el.clientHeight + 1,
            }
        })
        expect(clamp).toEqual({ lines: expect.any(Number), cut: true })
        expect(clamp?.lines).toBeLessThanOrEqual(2)

        const sale = cardByMemo(page, REGISTER_SEED.sale)
        expect(Math.round((await boxOf(card)).height)).toBe(Math.round((await boxOf(sale)).height))

        const money = card.getByText(MONEY)
        await expect(money).toHaveCount(2)
        const cardBox = await boxOf(card)
        for (let i = 0; i < 2; i++) {
            const figure = money.nth(i)
            const box = await boxOf(figure)
            expect(box.x).toBeGreaterThanOrEqual(cardBox.x)
            expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
            expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width)
            const clipped = await figure.evaluate(
                el => el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1
            )
            expect(clipped).toBe(false)
        }
    })

    test('phone: amounts and balances are right-aligned and not clipped', async ({ page }) => {
        await openChecking(page, PHONE)
        await expect(page.locator(CARDS).first()).toBeVisible()

        const figures = await page.locator(CARDS).evaluateAll(els =>
            els.map(card => {
                const texts = Array.from(card.querySelectorAll('*')).filter(
                    el =>
                        el.children.length === 0 && /^-?\$[\d,]+\.\d{2}$/.test(el.textContent ?? '')
                )
                return texts.map(el => {
                    const r = el.getBoundingClientRect()
                    return {
                        right: Math.round(r.right),
                        left: r.left,
                        clipped: el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1,
                    }
                })
            })
        )
        expect(figures.length).toBeGreaterThan(3)
        const rights = new Set<number>()
        for (const card of figures) {
            expect(card).toHaveLength(2)
            for (const figure of card) {
                expect(figure.clipped).toBe(false)
                expect(figure.left).toBeGreaterThanOrEqual(0)
                expect(figure.right).toBeLessThanOrEqual(PHONE.width)
                rights.add(figure.right)
            }
        }
        expect(rights.size).toBe(1)
        expect(await noSideScroll(page)).toBe(true)
    })

    test('phone: a card opens a bottom drawer with the entry', async ({ page }) => {
        await openChecking(page, PHONE)
        const split = cardByMemo(page, REGISTER_SEED.split)
        await split.click()

        const panel = drawer(page)
        await expect(panel).toBeVisible()
        await expect(split).toHaveClass(ACCENT)
        await expect(panel).toHaveCount(1)
        await expect(page.getByRole('dialog', { name: /Entry/ })).toBeVisible()
        // The drawer slides in, so measure only once its box stops moving.
        await expect
            .poll(async () => {
                const box = await boxOf(panel)
                const header = await boxOf(page.getByTestId('register-range'))
                return {
                    bottomGap: Math.round(PHONE.height - (box.y + box.height)),
                    belowHeader: box.y >= header.y + header.height,
                    left: box.x >= 0,
                    right: box.x + box.width <= PHONE.width,
                }
            })
            .toEqual({ bottomGap: 0, belowHeader: true, left: true, right: true })
        expect(await noSideScroll(page)).toBe(true)

        await expect(page.getByTestId('register-drawer-field-date')).toContainText(
            /[A-Z][a-z]{2} \d{1,2}, \d{4}/
        )
        const number = (await page.getByTestId('register-drawer-field-number').innerText())
            .replace(/^\s*(Number|Ref no\.)\s*/i, '')
            .trim()
        expect(number).not.toBe('')
        expect(number).not.toBe('Draft')
        await expect(page.getByTestId('register-drawer-field-type')).toContainText('Journal entry')
        await expect(page.getByTestId('register-drawer-field-status')).toContainText('Posted')
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.split
        )

        const lines = page.locator(LINES)
        await expect(lines).toHaveCount(3)
        const checking = lines.filter({ hasText: 'Business Checking' })
        const rent = lines.filter({ hasText: 'Rent' })
        const software = lines.filter({ hasText: 'Software Subscriptions' })
        await expect(checking.getByText('$300.00', { exact: true })).toHaveCount(1)
        await expect(rent.getByText('$200.00', { exact: true })).toHaveCount(1)
        await expect(software.getByText('$100.00', { exact: true })).toHaveCount(1)
        const creditX = (await boxOf(checking.getByText('$300.00', { exact: true }))).x
        const debitX = (await boxOf(rent.getByText('$200.00', { exact: true }))).x
        expect(creditX).toBeGreaterThan(debitX)
        await expect(checking).toHaveClass(ACCENT)
        await expect(rent).not.toHaveClass(ACCENT)
        await expect(software).not.toHaveClass(ACCENT)

        const closeBox = await boxOf(page.getByTestId('register-drawer-close'))
        expect(closeBox.width).toBeGreaterThanOrEqual(44)
        expect(closeBox.height).toBeGreaterThanOrEqual(44)
        await page.getByTestId('register-drawer-close').click()
        await expect(panel).not.toBeVisible()
        await expect.poll(() => panel.count()).toBe(0)
        await expect(split).not.toHaveClass(ACCENT)
    })

    test('phone: a void entry says Void and the next card shows its own entry', async ({
        page,
    }) => {
        await openChecking(page, PHONE)
        await cardByMemo(page, REGISTER_SEED.voidOriginal).click()
        await expect(page.getByTestId('register-drawer-field-status')).toContainText('Void')
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.voidOriginal
        )

        // The phone drawer is modal: its backdrop and focus trap keep a card behind it from
        // being pressed, so the next card is opened after closing, and must show its own entry.
        await page.getByTestId('register-drawer-close').click()
        await expect(drawer(page)).not.toBeVisible()
        await cardByMemo(page, REGISTER_SEED.sale).click()
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.sale
        )
        await expect(page.getByTestId('register-drawer-field-status')).toContainText('Posted')
        await expect(drawer(page)).toHaveCount(1)
    })

    test('phone: Enter and Space on a card open the drawer', async ({ page }) => {
        await openChecking(page, PHONE)
        await cardByMemo(page, REGISTER_SEED.sale).focus()
        await page.keyboard.press('Enter')
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.sale
        )
        await page.getByTestId('register-drawer-close').click()
        await expect(drawer(page)).not.toBeVisible()

        await cardByMemo(page, REGISTER_SEED.split).focus()
        await page.keyboard.press('Space')
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.split
        )
    })

    test('desktop: the drawer opens beside the table and closes', async ({ page }) => {
        await openChecking(page, DESKTOP_TALL)
        const table = page.getByTestId('register-table')
        const before = await boxOf(table)
        const sale = rowByMemo(page, REGISTER_SEED.sale)
        await sale.click()

        const panel = drawer(page)
        await expect(panel).toBeVisible()
        await expect(sale).toHaveClass(ACCENT)
        await expect(panel).toHaveCount(1)
        await expect(page.getByRole('complementary', { name: /Entry/ })).toBeVisible()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(page.getByTestId('register-drawer-backdrop')).toHaveCount(0)
        await expect
            .poll(async () => {
                const opened = await boxOf(table)
                const side = await boxOf(panel)
                return {
                    narrower: opened.width < before.width,
                    beside: opened.x + opened.width <= side.x + 1,
                }
            })
            .toEqual({ narrower: true, beside: true })
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.sale
        )
        await expect(page.locator(LINES)).toHaveCount(2)

        // Inline, nothing covers the table, so another row replaces the open entry.
        await rowByMemo(page, REGISTER_SEED.split).click()
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.split
        )
        await expect(page.locator(LINES)).toHaveCount(3)
        await sale.click()
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.sale
        )

        await page.getByTestId('register-drawer-close').click()
        await expect(panel).not.toBeVisible()
        await expect.poll(() => panel.count()).toBe(0)
        await expect
            .poll(async () => Math.round((await boxOf(table)).width))
            .toBe(Math.round(before.width))
        await expect(sale).not.toHaveClass(ACCENT)
    })

    test('desktop: Enter and Space on a row open the drawer', async ({ page }) => {
        await openChecking(page, DESKTOP_TALL)
        await rowByMemo(page, REGISTER_SEED.sale).focus()
        await page.keyboard.press('Enter')
        await expect(drawer(page)).toBeVisible()
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.sale
        )

        await page.getByTestId('register-drawer-close').click()
        await expect(drawer(page)).not.toBeVisible()

        await rowByMemo(page, REGISTER_SEED.split).focus()
        await page.keyboard.press('Space')
        await expect(drawer(page)).toBeVisible()
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.split
        )
    })

    test('tablet: the drawer is an overlay with a backdrop', async ({ page }) => {
        await openChecking(page, TABLET)
        const table = page.getByTestId('register-table')
        await expect(table).toBeVisible()
        const before = await boxOf(table)
        await rowByMemo(page, REGISTER_SEED.sale).click()

        const panel = drawer(page)
        await expect(panel).toBeVisible()
        await expect(page.getByRole('dialog', { name: /Entry/ })).toBeVisible()
        await expect(page.getByTestId('register-drawer-backdrop')).toBeVisible()
        await expect
            .poll(async () => {
                const side = await boxOf(panel)
                const after = await boxOf(table)
                return {
                    width: Math.round(after.width) === Math.round(before.width),
                    overlapX:
                        Math.min(after.x + after.width, side.x + side.width) >
                        Math.max(after.x, side.x),
                    overlapY:
                        Math.min(after.y + after.height, side.y + side.height) >
                        Math.max(after.y, side.y),
                }
            })
            .toEqual({ width: true, overlapX: true, overlapY: true })
    })

    for (const [name, size] of SIZES) {
        test(`${name}: returning to a register does not restore a stale selection`, async ({
            page,
        }) => {
            await openChecking(page, size)
            const item =
                name === 'phone'
                    ? cardByMemo(page, REGISTER_SEED.sale)
                    : rowByMemo(page, REGISTER_SEED.sale)
            await item.click()
            await expect(drawer(page)).toBeVisible()

            if (name === 'phone') {
                await page.goBack()
                await expect(page.getByTestId('account-search')).toBeVisible()
                await chooseViewRegister(page, 'Accounts receivable')
                await expect(page.getByTestId('register-title')).toContainText(
                    'Accounts receivable'
                )
                await page.goBack()
                await expect(page.getByTestId('account-search')).toBeVisible()
                // The first menu's exit animation leaves a clone behind for a moment.
                await expect(page.getByRole('menuitem', { name: 'View register' })).toHaveCount(0)
                await chooseViewRegister(page, 'Business Checking')
            } else {
                await openRegister(page, 'Accounts receivable')
                await expect(page.getByTestId('register-title')).toContainText(
                    'Accounts receivable'
                )
                await openRegister(page, 'Business Checking')
            }
            await expect(page.getByTestId('register-title')).toContainText('Business Checking')
            await expect(page.locator(name === 'phone' ? CARDS : ROWS).first()).toBeVisible()
            await expect.poll(() => drawer(page).count()).toBe(0)
            await expect(page.locator(`${name === 'phone' ? CARDS : ROWS}.bg-accent`)).toHaveCount(
                0
            )
        })
    }

    test('desktop: changing the range does not reopen a closed drawer', async ({ page }) => {
        await openChecking(page, DESKTOP_TALL)
        await rowByMemo(page, REGISTER_SEED.sale).click()
        await expect(drawer(page)).toBeVisible()

        await page.getByTestId('register-range').click()
        await page.getByRole('menuitem', { name: 'Last fiscal year', exact: true }).click()
        await expect(page.getByTestId('register-range')).toContainText('Last fiscal year')
        await expect(page.getByTestId('register-empty-range')).toBeVisible()

        await page.getByTestId('register-range').click()
        await page.getByRole('menuitem', { name: 'This fiscal year', exact: true }).click()
        await expect(rowByMemo(page, REGISTER_SEED.sale)).toBeVisible()
        await expect.poll(() => drawer(page).count()).toBe(0)
        await expect(page.locator(`${ROWS}.bg-accent`)).toHaveCount(0)
    })

    for (const [name, size] of SIZES) {
        test(`${name}: rows, cards and the drawer are not links`, async ({ page }) => {
            await openChecking(page, size)
            const url = page.url()
            const item =
                name === 'phone'
                    ? cardByMemo(page, REGISTER_SEED.sale)
                    : rowByMemo(page, REGISTER_SEED.sale)
            await expect(item).toHaveCount(1)
            await expect(page.locator(`${name === 'phone' ? CARDS : ROWS} a`)).toHaveCount(0)
            await expect(
                page
                    .getByTestId('register-opening-card')
                    .or(page.getByTestId('register-opening-row'))
                    .locator('a')
            ).toHaveCount(0)

            await item.click()
            await expect(drawer(page)).toBeVisible()
            await expect(drawer(page).locator('a')).toHaveCount(0)
            await expect(page.locator(`${name === 'phone' ? CARDS : ROWS} a`)).toHaveCount(0)
            expect(page.url()).toBe(url)
        })

        test(`${name}: another account's register opens without the drawer`, async ({ page }) => {
            await openChecking(page, size)
            const item =
                name === 'phone'
                    ? cardByMemo(page, REGISTER_SEED.sale)
                    : rowByMemo(page, REGISTER_SEED.sale)
            await item.click()
            await expect(drawer(page)).toBeVisible()
            await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
                REGISTER_SEED.sale
            )

            // On a phone the backdrop covers the back link, so history goes back to the chart.
            if (name === 'phone') {
                await page.goBack()
                await expect(page.getByTestId('account-search')).toBeVisible()
                await chooseViewRegister(page, 'Accounts receivable')
            } else {
                await openRegister(page, 'Accounts receivable')
            }
            await expect(page.getByTestId('register-title')).toContainText('Accounts receivable')
            await expect(drawer(page)).toHaveCount(0)
        })
    }
})
