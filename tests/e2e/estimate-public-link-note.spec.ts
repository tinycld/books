import { expect, type Page, type Route, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import {
    authToken,
    chooseSelect,
    createLinkedEstimate,
    declineOnPage,
    openPublicPage,
} from './estimate-public-link-helpers'

// The customer's decline in Books (estimate-public-link spec §3.5): the note under the
// estimate form's status row, its load error with Retry, that it follows the saved status
// (not the unsaved form), that it arrives live by realtime, and the revision conflict when
// a writer saves a stale form after the customer answered. The read view shows the same
// EstimateDeclineNote; it is not driven here (it shows only to a Books reader, and a spec
// would have to change a shared user's Books access).

const RESPONSES = '**/api/collections/books_estimate_responses/records*'
const LOAD_ERROR = "Books could not load the customer's answer."
const FIRST_LINE = 'We went with another bid this year.'
const SECOND_LINE = 'Please send a new estimate next spring.'

// The newest response of an estimate, read-only with the signed-in user's token.
async function newestResponseCreated(page: Page, estimateId: string): Promise<string> {
    const read = async () => {
        const response = await page.request.get(
            '/api/collections/books_estimate_responses/records',
            {
                params: { filter: `estimate="${estimateId}"`, sort: '-created', fields: 'created' },
                headers: { Authorization: await authToken(page) },
            }
        )
        if (!response.ok()) return ''
        const body = (await response.json()) as { items: { created: string }[] }
        return body.items[0]?.created ?? ''
    }
    await expect.poll(read).not.toBe('')
    return read()
}

// The local day (in the browser's time zone) of a PocketBase datetime, as formatDay
// writes it.
async function localDayOf(page: Page, created: string): Promise<string> {
    const day = await page.evaluate(value => {
        const at = new Date(value.replace(' ', 'T'))
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
    }, created)
    return formatDay(day)
}

// ⌘S from the memo field, then the badge (it follows the saved row) shows `label`.
async function saveWithKeys(page: Page, label: string) {
    await page.getByTestId('form-input-memo').focus()
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByTestId('estimate-badge')).toHaveText(label)
}

test.describe('estimate-public-link: decline note in Books', () => {
    test("the customer's decline shows in Books", async ({ page, browser }) => {
        const refuseRead = (route: Route) => route.fulfill({ status: 400 })
        await page.route(RESPONSES, refuseRead)
        await login(page)
        await navigateToPackage(page, 'books')
        const estimate = await createLinkedEstimate(page)

        const note = page.getByTestId('estimate-decline-note')
        const error = page.getByTestId('estimate-decline-note-error')

        // The note's own query fails: its error with Retry, in place of the note.
        await expect(error).toContainText(LOAD_ERROR)
        await expect(note).toHaveCount(0)
        await page.unroute(RESPONSES, refuseRead)
        await page.getByTestId('estimate-decline-note-retry').click()
        await expect(error).toHaveCount(0)
        await expect(note).toHaveCount(0)

        // Rejected picked in the unsaved form: no note (it follows the saved status).
        await chooseSelect(page, 'status', 'Rejected')
        await expect(note).toHaveCount(0)
        await chooseSelect(page, 'status', 'Pending')

        // An unsaved memo edit: the form no longer follows the stored row, so a save
        // after the customer answers would overwrite the answer.
        const memo = page.getByTestId('form-input-memo')
        await memo.fill(`${estimate.memo} edited`)

        const customer = await openPublicPage(browser, estimate.link)
        try {
            await declineOnPage(customer.page, `${FIRST_LINE}\n${SECOND_LINE}`)
            await expect(customer.page.getByTestId('estimate-public-declined')).toBeVisible()
        } finally {
            await customer.close()
        }

        // In Books, with no reload: the response and the estimate arrive by realtime.
        const date = await localDayOf(page, await newestResponseCreated(page, estimate.id))
        await expect(note).toContainText(`Declined by the customer on ${date}.`)
        await expect(note).toContainText(`Reason: ${FIRST_LINE}`)
        await expect(note).toContainText(SECOND_LINE)
        await expect(page.getByTestId('estimate-badge')).toHaveText('Rejected')

        // The form keeps the unsaved memo edit and the revision it was opened at (core
        // useFormEdit resets clean fields with keepDirtyValues; useDocumentSave holds the
        // baseline while dirty), so a save is the revision conflict; loading the current
        // estimate shows Rejected and the note.
        await expect(memo).toHaveValue(`${estimate.memo} edited`)
        await memo.focus()
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page.getByTestId('estimate-conflict')).toBeVisible()
        await page.getByTestId('estimate-conflict-reload').click()
        await expect(page.getByTestId('estimate-conflict')).toHaveCount(0)
        await expect(page.getByTestId('form-input-status')).toContainText('Rejected')
        await expect(note).toContainText(`Declined by the customer on ${date}.`)

        // Pending picked but not saved: the note stays; saved: it is gone.
        await chooseSelect(page, 'status', 'Pending')
        await expect(note).toContainText(`Declined by the customer on ${date}.`)
        await saveWithKeys(page, 'Pending')
        await expect(note).toHaveCount(0)

        // Rejected picked but not saved, with a decline response stored: still no note
        // (it follows the saved status); the badge still reads the saved Pending.
        await chooseSelect(page, 'status', 'Rejected')
        await expect(page.getByTestId('form-input-status')).toContainText('Rejected')
        await expect(page.getByTestId('estimate-badge')).toHaveText('Pending')
        await expect(note).toHaveCount(0)

        // Rejected saved: the newest response is the decline, with its date.
        await saveWithKeys(page, 'Rejected')
        await expect(note).toContainText(`Declined by the customer on ${date}.`)
        await expect(note).toContainText(`Reason: ${FIRST_LINE}`)
        await expect(note).toContainText(SECOND_LINE)

        // Accepted: gone.
        await chooseSelect(page, 'status', 'Accepted')
        await page.getByTestId('form-input-accepted_by').fill('Dana Whitfield')
        await saveWithKeys(page, 'Accepted')
        await expect(note).toHaveCount(0)

        await page.unrouteAll({ behavior: 'wait' })
    })
})
