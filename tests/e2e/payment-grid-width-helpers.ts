import { expect, type Locator, type Page } from '@playwright/test'

// Shared steps of the grid-width specs (human, eval revise 1 of pay-bills): the outstanding
// grid's columns flex with a least width of 95 px, and the list shows the grid while its own
// width is at least the grid's least width, cards below it. The grid never scrolls sideways.

// How far from the grid's least width the list is sized: wider than CI's classic scrollbar
// gutter (lesson 8), so a viewport chosen on one browser stays on the same side on another.
export const LIST_MARGIN = 24

// The visible list's own width (the screen below keeps a hidden copy mounted).
export function listWidth(page: Page, listTestId: string): Promise<number> {
    return page
        .getByTestId(listTestId)
        .filter({ visible: true })
        .evaluate(el => Math.round(el.getBoundingClientRect().width))
}

// Waits until the list's width is the same on two reads, and returns it.
async function settledListWidth(page: Page, listTestId: string): Promise<number> {
    let last = -1
    await expect
        .poll(async () => {
            const width = await listWidth(page, listTestId)
            const settled = width > 0 && width === last
            last = width
            return settled
        })
        .toBe(true)
    return last
}

/**
 * The screen with the list must be open. Changes the viewport width until the list's own
 * width is `target` (± 2 px) and returns that viewport. The layout decides how much of the
 * viewport the list gets, so the width is measured, never assumed.
 */
export async function viewportForListWidth(
    page: Page,
    listTestId: string,
    target: number
): Promise<{ width: number; height: number }> {
    const height = page.viewportSize()?.height ?? 800
    let width = page.viewportSize()?.width ?? 1280
    for (let step = 0; step < 6; step++) {
        const list = await settledListWidth(page, listTestId)
        if (Math.abs(list - target) <= 2) return { width, height }
        width += target - list
        await page.setViewportSize({ width, height })
    }
    throw new Error(`no viewport gives ${listTestId} a width of ${target}`)
}

/**
 * Every element from the grid up to the page's vertical scroller (inclusive) whose content
 * is wider than its box: a sideways scroller or clipped columns. Empty when nothing around
 * the grid scrolls sideways.
 */
export function sidewaysOverflow(grid: Locator) {
    return grid.evaluate(start => {
        const found: { id: string; scrollWidth: number; clientWidth: number }[] = []
        let el: HTMLElement | null = start as HTMLElement
        while (el && el !== document.body) {
            if (el.scrollWidth > el.clientWidth + 1) {
                found.push({
                    id: el.getAttribute('data-testid') ?? el.tagName,
                    scrollWidth: el.scrollWidth,
                    clientWidth: el.clientWidth,
                })
            }
            const overflowY = getComputedStyle(el).overflowY
            if (overflowY === 'auto' || overflowY === 'scroll') break
            el = el.parentElement
        }
        return found
    })
}

// The right edge of an element, in viewport pixels.
export async function rightEdge(target: Locator): Promise<number> {
    const box = await target.boundingBox()
    if (!box) throw new Error('the element has no box')
    return box.x + box.width
}
