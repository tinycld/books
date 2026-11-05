import type { Page } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'

export { DESKTOP, isPhone, PHONE } from './account-register-helpers'

// The seeded accounts the seeded transfer moves money between, as the screens name them.
export const TRANSFER_LABELS = {
    checking: '1000 Business Checking',
    savings: '1010 Business Savings',
}

// Navigate at the default viewport (the desktop rail), then size the page.
export async function startTransfers(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}
