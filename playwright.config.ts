import path from 'node:path'
import { defineConfig } from '@playwright/test'
import appConfig from '@tinycld/core/playwright-config'

// Package-scoped Playwright: inherit the app shell's webServer + browser config,
// then point testDir at THIS package's tests/e2e through the app shell's
// node_modules symlink. Routing via node_modules (not this repo's real path)
// keeps node resolution walking up into the app shell's install, so
// @playwright/test and other deps resolve there — not from a (nonexistent)
// local node_modules.
// The @tinycld/books symlink lives in the workspace-root node_modules (deps
// hoist there in this layout). Routing testDir through it keeps node resolution
// walking up into the install where @playwright/test lives.
const WS_ROOT = path.resolve(import.meta.dirname, '..')
const TEST_DIR = path.join(WS_ROOT, 'node_modules', '@tinycld', 'books', 'tests', 'e2e')

// The Purchase lines setting is one value on the shared e2e database. The bill and the
// expense tests that change it run first, in their own project, so no form test that
// needs both line tables runs while another worker has the setting changed. The project
// runs on one worker: its tests are in two files (bill-form, expense-form), and two
// workers would run them side by side, each changing the setting under the other's form.
const PURCHASE_LINES_SETTING = /: (bill|purchase) lines setting/

export default defineConfig({
    ...appConfig,
    testDir: TEST_DIR,
    projects: [
        { name: 'purchase-lines-setting', grep: PURCHASE_LINES_SETTING, workers: 1 },
        {
            name: 'books',
            grepInvert: PURCHASE_LINES_SETTING,
            dependencies: ['purchase-lines-setting'],
        },
    ],
})
