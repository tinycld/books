# Sidebar Shortcuts and New Section Implementation Plan (part 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the user's shortcuts and the New actions in the Books sidebar, let the user change the shortcut list in a Customize shortcuts dialog, and make core's report view able to run on a package's own route.

**Architecture:** The sidebar gets two sections above the fixed navigation: **Shortcuts** (rows built by a plain-data function from the list of part 1, the Books reports and the accounts of the register shortcuts) and **New** (the New actions of part 1's catalog, folded, hidden for a reader). The popover leaves the shell; the round New button stays on phones and opens the drawer with the New section open. The Customize shortcuts dialog edits a draft kept in a Zustand store and writes one time on Save. Core's `ReportScreen` gets an optional `basePath`, carried by a context of core reports to the drill links, the Back links and Save as copy; Books draws it on `books/reports/[id]` in part 3. Core's main navigation loses its Reports entry (decision of the human, 2026-11-23): a package links to the hub.

**Tech Stack:** pbtsdb + TanStack DB (`useLiveQuery`, `like`, `inArray`), Zustand (`@tinycld/core/lib/store`), core `Dialog`, `SortableList` and sidebar primitives, Books `SearchPicker`, vitest + happy-dom, Playwright.

**Spec:** the unit `p1-sidebar-shortcuts` in `/Users/nas/code/tinycld/docs/superpowers/plans/2026-10-21-books-run-manifest.yaml`, the outline `/Users/nas/tmp/tinycld/auto-helix-books/staging/p1-sidebar-shortcuts/plan-outline.md` (target layout and decisions; read its first two sections before any task), the shell spec `/Users/nas/tmp/tinycld/books/books/docs/specs/books-shell-design.md`, and part 1, `/Users/nas/tmp/tinycld/books/books/docs/plans/2026-11-23-sidebar-shortcuts.md` (its last section lists what this part takes from it).

**This part holds tasks 8, 8b, 9, 9b, 10, 11, 12 and 12b of the outline.** Tasks 12 and 12b are CORE tasks: they change `/Users/nas/tmp/tinycld/books/tinycld` on the branch `books/p1-sidebar-shortcuts` of that repo, go in their own PR, and merge before the Books PR. A third core task of the same branch and the same PR, 12c (core's sidebar item closes the phone drawer at once, with no 500 ms timer), is the first task of part 3, because this part is at its eight-task limit; it touches no file of tasks 12 and 12b, and runs before task 12 starts or after task 12b is committed. Tasks 13 to 20 (the Books report route, Reports section, report links, settings in core Settings, the e2e specs, help and the spec record) are part 3.

## Global Constraints

- Tasks 8 to 11 work only in `/Users/nas/tmp/tinycld/books/books`. Tasks 12 and 12b work only in `/Users/nas/tmp/tinycld/books/tinycld`. Never edit anything under `node_modules`.
- Core names no package: no `books` in a core file, test or doc of tasks 12 and 12b. The fictional host in core tests is `zoo`.
- Books runs on web and native: no web-only API in `tinycld/books/**`.
- All PocketBase data goes through pbtsdb. No raw PocketBase call, no new endpoint, no SQL.
- Never `any`, never a `biome-ignore`, never `console.*`. Row types come from the query, never from a hand-written row interface.
- JSX holds no `.map()`, no ternary and no `{cond && <X />}`: compute above the return, and give a part an `isVisible` prop that returns `null`.
- No raw color: semantic Tailwind tokens, or `useThemeColor`.
- Shared UI state is a Zustand store, never a new React Context in Books. (Task 12 uses a context inside core reports, as `core/reports/hooks/usePanelTitle.ts` does, because the value belongs to one mounted report view, not to the app.)
- Test ids of this part never start with `books-nav-` (specs select `[data-testid^="books-nav-"]`), and a dialog row id never starts with `books-shortcut-` (the sidebar's own rows have that prefix).
- Tools: `PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH`, then `vitest`, `biome`, `tinycld-pkg typecheck`. Never `pnpm install` in a member.
- E2E: one command for all named files, from `/Users/nas/tmp/tinycld/books`, on ports 7230 and 7231, after the port check shown in the task. A run that would take longer than the runner allows is reported as `NEEDS-RUN` with the command; never raise a timeout, never run a spec alone to make it pass.
- The Commit step of each task is for the runner; an implementer does not commit or push.
- A step that says "Apply" shows a unified diff of the change. Apply it by its content with the Edit tool (line numbers can differ when an earlier task changed the file); the result must hold every `+` line and no `-` line. Then run `biome check --write` on the file only when the step's lint names a format difference.
- In the unit-test DOM (the React Native stub), `testID` is the attribute `testid`, `accessibilityLabel` is `accessibilitylabel`, a `Text` is `rn-text`, and `disabled` is not copied to the element.

## Review Focus

- **Task 8:** `tests/shortcut-rows.test.ts` (a shortcut with nothing to open gives no row; a shipped report is found by its shipped key and a saved one by its id), `tests/books-reports.test.tsx` (only `books.` sources; shipped first).
- **Task 8b:** `tests/shortcuts-section.test.tsx` (defaults for no row; an empty stored list shows "No shortcuts", not the defaults; a failed read shows Retry and recovers), `tests/books-sidebar-render.test.tsx`.
- **Task 9:** `tests/new-section.test.tsx` (a reader gets no New section; the fold state; the FAB opens the drawer and the section), `tests/books-ui-store.test.ts`.
- **Task 9b:** the e2e door `tests/e2e/new-menu-helpers.ts` (it opens the section when closed and never toggles) and the two reader checks.
- **Task 10:** `tests/customize-shortcuts.test.tsx`: nothing is written until Save; Save writes ONE time; a refused write leaves the dialog open with the draft; Cancel drops the draft; a draft equal to the defaults deletes the row.
- **Task 11:** `tests/shortcut-choices.test.ts` (nothing in the list is offered again; nothing when full; no form for a reader).
- **Task 12:** no behavior change without `basePath`: the existing `drill.test.ts` cases pass unchanged. No package name in core. Edit stays on the current route, so a host must keep `ReportScreen` mounted.
- **Task 12b:** the two entries go with no condition; `/a/reports` stays; every core report spec reaches the hub through `openReportsHub` of `tests/e2e/reports-helpers.ts`.

Known limits to keep, not to fix here: (1) the menu of `SearchPicker` does not open in the unit-test DOM, so the pick in the Add shortcut picker is covered by the e2e spec of part 3 (task 18); (2) one live query reads all Books reports the user can read, so a report that is unshared or unpublished can stay in the list until the next load; (3) on a phone with a long shortcut list, the New section can be under the fold after the round New button opens the drawer; (4) core `SidebarItem` closes the drawer 500 ms after a press (`core/components/sidebar-primitives/SidebarItem.tsx`), so a press on the round New button inside that time opens a drawer that the old timer then closes; this limit is removed at its source by core task 12c (the first task of part 3: `SidebarItem` closes the drawer in the press, with no timer), and part 3's e2e (task 18) does two New actions one after the other on a phone with no wait.

---

### Task 8: Shortcut rows and the Books reports read

**Files:**
- Create: `tinycld/books/lib/shortcut-rows.ts`
- Create: `tinycld/books/hooks/useBooksReports.ts`
- Create: `tests/sidebar-harness.tsx`
- Create: `tests/shortcut-rows.test.ts`
- Create: `tests/books-reports.test.tsx`

**Interfaces:**
- Consumes (part 1): `Shortcut`, `shortcutKey` (`lib/sidebar-shortcuts.ts`); `staticTarget`, `REPORT_SHORTCUT_ICON`, `REGISTER_SHORTCUT_ICON`, `REGISTER_SHORTCUT_ROUTE` (`lib/shortcut-catalog.ts`); the type `BooksSidebarShortcuts` (`types.ts`). Existing: `shippedReportHref(orgHref, id, params)` (`hooks/useShippedReportHref.ts`), `accountLabel` (`lib/account-options.ts`), `LiveRecovery` (`lib/live-recovery.ts`), `guardedStore`, `seedBooks`, `ME` (`tests/accounts-form-harness.ts`).
- Produces: `ShortcutRow { key; testID; label; icon; href }`, `ShortcutReport { id; title; shippedKey }`, `ShortcutAccount { id; number; name }`, `ShortcutRowsInput { canWrite; reports; accounts; orgHref }`, `shortcutTestId(shortcut): string`, `reportOfShortcut(ref, reports)`, `shortcutRows(shortcuts, input): ShortcutRow[]`; `useBooksReports(): { reports: BooksReport[]; isReady: boolean; isError: boolean; recovery: LiveRecovery }` with `BooksReport = { id; title; shippedKey; isShipped }`, and `sortBooksReports`; the test harness `seedSidebar`, `renderSidebar`, `SidebarProviders`, `idsWith`, `shortcutsRow`, `PROFIT_AND_LOSS`, `BALANCE_SHEET`, `MY_SALES`, `ZOO_REPORT`.

A Books report is a `reports` row whose `source` starts with `books.` (the filter core's hub uses for a package). In tests the `reports` store is a `guardedStore`: the on-demand test store does not take a `like` filter.

- [ ] **Step 1: Write the test harness**

`tests/sidebar-harness.tsx`:

````tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import type { ReactNode } from 'react'
import type { Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'
import BooksSidebar from '../tinycld/books/sidebar'
import type { BooksSidebarShortcuts } from '../tinycld/books/types'
import { guardedStore, ME, seedBooks } from './accounts-form-harness'

// What the sidebar tests share: the stores the Books sidebar reads, and its render inside
// the providers its hooks need. The test file mocks `@tinycld/core/lib/pocketbase`
// (useStoreStub), `@tinycld/core/lib/auth` (user u1) and `@tinycld/core/lib/use-url`.

const STAMP = '2026-11-01 00:00:00.000Z'

export interface SeedReport {
    id: string
    title: string
    source: string
    shipped_key: string
}

export const PROFIT_AND_LOSS: SeedReport = {
    id: 'rptprofitloss01',
    title: 'Profit and Loss',
    source: 'books.account_balances',
    shipped_key: 'books.profit_and_loss',
}
export const BALANCE_SHEET: SeedReport = {
    id: 'rptbalancesht01',
    title: 'Balance Sheet',
    source: 'books.account_balances',
    shipped_key: 'books.balance_sheet',
}
// A saved report: no shipped key.
export const MY_SALES: SeedReport = {
    id: 'rptmysales00001',
    title: 'My sales by month',
    source: 'books.journal_lines',
    shipped_key: '',
}
// A report of another package: never a Books report.
export const ZOO_REPORT: SeedReport = {
    id: 'rptzoo000000001',
    title: 'Animals fed',
    source: 'zoo.feedings',
    shipped_key: 'zoo.fed',
}

export function shortcutsRow(items: unknown, user = ME): BooksSidebarShortcuts {
    return { id: 'shortcutrow0001', user, items, created: STAMP, updated: STAMP }
}

interface SeedSidebar {
    level?: 'read_only' | 'bookkeeper' | 'admin'
    // The stored list; undefined is a user with no row (the defaults).
    shortcuts?: readonly Shortcut[]
    reports?: readonly SeedReport[]
}

// Seeds Books, the user's shortcut row and the reports. Returns the two stores.
export function seedSidebar({
    level = 'admin',
    shortcuts,
    reports = [PROFIT_AND_LOSS, BALANCE_SHEET],
}: SeedSidebar = {}) {
    seedBooks({ level })
    const rows = shortcuts === undefined ? [] : [shortcutsRow([...shortcuts])]
    return {
        shortcutsStore: guardedStore<BooksSidebarShortcuts>('books_sidebar_shortcuts', rows),
        reportsStore: guardedStore<SeedReport>('reports', [...reports]),
    }
}

export function SidebarProviders({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return (
        <QueryClientProvider client={client}>
            <OverlayProvider>{children}</OverlayProvider>
        </QueryClientProvider>
    )
}

export function renderSidebar() {
    return render(<BooksSidebar />, { wrapper: SidebarProviders })
}

// The test ids of the drawn elements whose id starts with `prefix`, in document order.
export function idsWith(container: ParentNode, prefix: string): string[] {
    return [...container.querySelectorAll(`[testid^="${prefix}"]`)].map(
        node => node.getAttribute('testid') ?? ''
    )
}
````

- [ ] **Step 2: Write the failing tests**

`tests/shortcut-rows.test.ts`:

````ts
import { appHref } from '@tinycld/core/lib/org-routes'
import { describe, expect, it } from 'vitest'
import {
    reportOfShortcut,
    type ShortcutRowsInput,
    shortcutRows,
    shortcutTestId,
} from '../tinycld/books/lib/shortcut-rows'
import type { Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'

// As core's builder writes an href: a string, or the route and its params.
const orgHref: ShortcutRowsInput['orgHref'] = (path, params) =>
    params ? { pathname: appHref(path), params } : appHref(path)

const REPORTS = [
    { id: 'rpt1', title: 'Profit and Loss', shippedKey: 'books.profit_and_loss' },
    { id: 'rpt2', title: 'My sales', shippedKey: '' },
]
const ACCOUNTS = [
    { id: 'acct1', number: '1000', name: 'Business Checking' },
    { id: 'acct2', number: '', name: 'Petty cash' },
]

function rows(shortcuts: Shortcut[], canWrite = true) {
    return shortcutRows(shortcuts, { canWrite, reports: REPORTS, accounts: ACCOUNTS, orgHref })
}

describe('shortcutTestId', () => {
    it('writes every character that is not a letter or a digit as a dash', () => {
        expect(shortcutTestId({ kind: 'screen', ref: 'customers' })).toBe(
            'books-shortcut-screen-customers'
        )
        expect(shortcutTestId({ kind: 'report', ref: 'books.profit_and_loss' })).toBe(
            'books-shortcut-report-books-profit-and-loss'
        )
        expect(shortcutTestId({ kind: 'new', ref: 'journal-entry' })).toBe(
            'books-shortcut-new-journal-entry'
        )
    })

    it('never starts with the fixed navigation prefix', () => {
        expect(shortcutTestId({ kind: 'screen', ref: 'nav-x' }).startsWith('books-nav-')).toBe(
            false
        )
    })
})

describe('shortcutRows', () => {
    it('draws each kind with its label and route, in the list order', () => {
        const drawn = rows([
            { kind: 'register', ref: 'acct1' },
            { kind: 'report', ref: 'books.profit_and_loss' },
            { kind: 'new', ref: 'invoice' },
            { kind: 'screen', ref: 'customers' },
            { kind: 'report', ref: 'rpt2' },
            { kind: 'register', ref: 'acct2' },
        ])
        expect(drawn.map(row => [row.label, row.href])).toEqual([
            [
                '1000 Business Checking',
                { pathname: '/a/books/accounts/[id]', params: { id: 'acct1' } },
            ],
            ['Profit and Loss', { pathname: '/a/reports/[id]', params: { id: 'rpt1' } }],
            ['New invoice', '/a/books/invoices/new'],
            ['Customers', '/a/books/customers'],
            ['My sales', { pathname: '/a/reports/[id]', params: { id: 'rpt2' } }],
            ['Petty cash', { pathname: '/a/books/accounts/[id]', params: { id: 'acct2' } }],
        ])
        expect(drawn.map(row => row.key)).toEqual([
            'register:acct1',
            'report:books.profit_and_loss',
            'new:invoice',
            'screen:customers',
            'report:rpt2',
            'register:acct2',
        ])
    })

    it('leaves out a shortcut that has nothing to open and keeps the rest', () => {
        const drawn = rows([
            { kind: 'report', ref: 'books.gone' },
            { kind: 'register', ref: 'deleted' },
            { kind: 'screen', ref: 'payroll' },
            { kind: 'screen', ref: 'vendors' },
        ])
        expect(drawn.map(row => row.label)).toEqual(['Vendors'])
    })

    it('gives a reader no transaction form', () => {
        const list: Shortcut[] = [
            { kind: 'new', ref: 'invoice' },
            { kind: 'screen', ref: 'customers' },
        ]
        expect(rows(list, false).map(row => row.label)).toEqual(['Customers'])
    })

    it('draws nothing for an empty list', () => {
        expect(rows([])).toEqual([])
    })
})

describe('reportOfShortcut', () => {
    it('finds a shipped report by its key and a saved report by its id', () => {
        expect(reportOfShortcut('books.profit_and_loss', REPORTS)?.id).toBe('rpt1')
        expect(reportOfShortcut('rpt2', REPORTS)?.id).toBe('rpt2')
        expect(reportOfShortcut('rpt9', REPORTS)).toBeUndefined()
    })

    it('does not take an empty ref for a saved report, whose shipped key is empty', () => {
        expect(reportOfShortcut('', REPORTS)).toBeUndefined()
    })
})
````

`tests/books-reports.test.tsx`:

````tsx
// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { sortBooksReports, useBooksReports } from '../tinycld/books/hooks/useBooksReports'
import {
    BALANCE_SHEET,
    MY_SALES,
    PROFIT_AND_LOSS,
    seedSidebar,
    ZOO_REPORT,
} from './sidebar-harness'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

describe('sortBooksReports', () => {
    it('puts the shipped reports first, each group by title', () => {
        const sorted = sortBooksReports([
            { id: '1', title: 'Zebra', shippedKey: '' },
            { id: '2', title: 'Profit and Loss', shippedKey: 'books.profit_and_loss' },
            { id: '3', title: 'Alpha', shippedKey: '' },
            { id: '4', title: 'Balance Sheet', shippedKey: 'books.balance_sheet' },
        ])
        expect(sorted.map(report => [report.title, report.isShipped])).toEqual([
            ['Balance Sheet', true],
            ['Profit and Loss', true],
            ['Alpha', false],
            ['Zebra', false],
        ])
    })

    it('keeps two reports of one title in a fixed order', () => {
        const rows = [
            { id: 'b', title: 'Same', shippedKey: '' },
            { id: 'a', title: 'Same', shippedKey: '' },
        ]
        expect(sortBooksReports(rows).map(report => report.id)).toEqual(['a', 'b'])
        expect(sortBooksReports([...rows].reverse()).map(report => report.id)).toEqual(['a', 'b'])
    })
})

describe('useBooksReports', () => {
    it('lists the Books reports only, shipped first', async () => {
        seedSidebar({ reports: [MY_SALES, ZOO_REPORT, PROFIT_AND_LOSS, BALANCE_SHEET] })
        const { result } = renderHook(() => useBooksReports())

        await waitFor(() => expect(result.current.isReady).toBe(true))
        expect(result.current.reports).toEqual([
            {
                id: BALANCE_SHEET.id,
                title: 'Balance Sheet',
                shippedKey: 'books.balance_sheet',
                isShipped: true,
            },
            {
                id: PROFIT_AND_LOSS.id,
                title: 'Profit and Loss',
                shippedKey: 'books.profit_and_loss',
                isShipped: true,
            },
            { id: MY_SALES.id, title: 'My sales by month', shippedKey: '', isShipped: false },
        ])
        expect(result.current.isError).toBe(false)
        expect(result.current.recovery).toEqual({ queries: [], sources: [] })
    })

    it('is an empty list for a reader with no Books report', async () => {
        seedSidebar({ reports: [ZOO_REPORT] })
        const { result } = renderHook(() => useBooksReports())

        await waitFor(() => expect(result.current.isReady).toBe(true))
        expect(result.current.reports).toEqual([])
    })
})
````

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/shortcut-rows.test.ts tests/books-reports.test.tsx`
Expected: FAIL, both files: the imports `../tinycld/books/lib/shortcut-rows` and `../tinycld/books/hooks/useBooksReports` do not resolve.

- [ ] **Step 4: Write the rows function**

`tinycld/books/lib/shortcut-rows.ts`:

````ts
// The rows the Shortcuts section draws: each shortcut of the user's list with the label,
// icon and route it opens. A shortcut that has nothing to open is left out, not drawn dead.
import type { useOrgHref } from '@tinycld/core/lib/org-routes'
import type { LucideIcon } from 'lucide-react-native'
import { shippedReportHref } from '../hooks/useShippedReportHref'
import { accountLabel } from './account-options'
import {
    REGISTER_SHORTCUT_ICON,
    REGISTER_SHORTCUT_ROUTE,
    REPORT_SHORTCUT_ICON,
    staticTarget,
} from './shortcut-catalog'
import { type Shortcut, shortcutKey } from './sidebar-shortcuts'

type OrgHref = ReturnType<typeof useOrgHref>

export interface ShortcutRow {
    key: string
    testID: string
    label: string
    icon: LucideIcon
    href: ReturnType<OrgHref>
}

export interface ShortcutReport {
    id: string
    title: string
    shippedKey: string
}

export interface ShortcutAccount {
    id: string
    number: string
    name: string
}

export interface ShortcutRowsInput {
    canWrite: boolean
    reports: readonly ShortcutReport[]
    accounts: readonly ShortcutAccount[]
    orgHref: OrgHref
}

const NO_PARAMS: Record<string, string> = {}

// A test id holds letters, digits and dashes only: `report` + `books.profit_and_loss` is
// `books-shortcut-report-books-profit-and-loss`.
export function shortcutTestId(shortcut: Shortcut): string {
    return `books-shortcut-${shortcut.kind}-${shortcut.ref.replace(/[^a-zA-Z0-9]/g, '-')}`
}

// A report shortcut holds the shipped key of a shipped report, or the row id of a saved one.
export function reportOfShortcut<R extends ShortcutReport>(
    ref: string,
    reports: readonly R[]
): R | undefined {
    return (
        reports.find(report => report.shippedKey !== '' && report.shippedKey === ref) ??
        reports.find(report => report.id === ref)
    )
}

function rowOf(shortcut: Shortcut, input: ShortcutRowsInput): ShortcutRow | null {
    const ids = { key: shortcutKey(shortcut), testID: shortcutTestId(shortcut) }
    if (shortcut.kind === 'report') {
        const report = reportOfShortcut(shortcut.ref, input.reports)
        if (!report) return null
        return {
            ...ids,
            label: report.title,
            icon: REPORT_SHORTCUT_ICON,
            href: shippedReportHref(input.orgHref, report.id, NO_PARAMS),
        }
    }
    if (shortcut.kind === 'register') {
        const account = input.accounts.find(candidate => candidate.id === shortcut.ref)
        if (!account) return null
        return {
            ...ids,
            label: accountLabel(account),
            icon: REGISTER_SHORTCUT_ICON,
            href: input.orgHref(REGISTER_SHORTCUT_ROUTE, { id: account.id }),
        }
    }
    const target = staticTarget(shortcut, input.canWrite)
    if (!target) return null
    return {
        ...ids,
        label: target.label,
        icon: target.icon,
        href: input.orgHref(target.href, target.params),
    }
}

// In the list's order. Left out: a report the reader cannot open (or that is not loaded
// yet), an account that is gone, a screen this build does not know, and a form for a reader.
export function shortcutRows(
    shortcuts: readonly Shortcut[],
    input: ShortcutRowsInput
): ShortcutRow[] {
    return shortcuts.flatMap(shortcut => rowOf(shortcut, input) ?? [])
}
````

- [ ] **Step 5: Write the reports read**

`tinycld/books/hooks/useBooksReports.ts`:

````ts
import { like } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useMemo } from 'react'
import type { LiveRecovery } from '../lib/live-recovery'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// A report's source key starts with its package's slug and a dot.
const BOOKS_SOURCES = 'books.%'

interface ReportRow {
    id: string
    title: string
    shippedKey: string
}

// The reports Books ships first, then the saved ones; each group by title.
export function sortBooksReports<R extends ReportRow>(rows: readonly R[]) {
    // Named fields, not a spread: a live query row also carries pbtsdb's own `$` keys.
    return rows
        .map(row => ({
            id: row.id,
            title: row.title,
            shippedKey: row.shippedKey,
            isShipped: row.shippedKey !== '',
        }))
        .sort(
            (a, b) =>
                Number(b.isShipped) - Number(a.isShipped) ||
                a.title.localeCompare(b.title) ||
                a.id.localeCompare(b.id)
        )
}

/**
 * Every Books report the reader can open: the shipped ones, the reader's own, and the ones
 * shared with the reader or published (core's rules on `reports` decide). `reports` is
 * empty until the read is ready and when it failed; a failed read returns `isError` and the
 * `recovery` for recoverLiveQueries.
 */
export function useBooksReports() {
    const [reportsCollection] = useStore('reports')
    const {
        data,
        isReady,
        isError,
        collection: query,
    } = useLiveQuery({
        query: q =>
            q
                .from({ report: reportsCollection })
                .where(({ report }) => like(report.source, BOOKS_SOURCES))
                .select(({ report }) => ({
                    id: report.id,
                    title: report.title,
                    shippedKey: report.shipped_key,
                })),
        queryKey: ['books', 'reports'],
    })
    const reports = useMemo(() => sortBooksReports(isError ? [] : (data ?? [])), [data, isError])
    const recovery: LiveRecovery =
        isError && query ? { queries: [query], sources: [reportsCollection] } : NO_RECOVERY
    return { reports, isReady, isError, recovery }
}

export type BooksReport = ReturnType<typeof useBooksReports>['reports'][number]
````

- [ ] **Step 6: Run the tests, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/shortcut-rows.test.ts tests/books-reports.test.tsx && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/lib/shortcut-rows.ts tinycld/books/hooks/useBooksReports.ts tests/sidebar-harness.tsx tests/shortcut-rows.test.ts tests/books-reports.test.tsx && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: PASS, 2 files, 12 tests; biome and the typecheck print no error.

- [ ] **Step 7: Commit**

```bash
git add tinycld/books/lib/shortcut-rows.ts tinycld/books/hooks/useBooksReports.ts tests/sidebar-harness.tsx tests/shortcut-rows.test.ts tests/books-reports.test.tsx
git commit -m "books: shortcut rows and the Books reports read"
```

---

### Task 8b: Shortcuts section in the sidebar

**Files:**
- Create: `tinycld/books/hooks/useShortcutLookup.ts`
- Create: `tinycld/books/hooks/useShortcutRows.ts`
- Create: `tinycld/books/components/sidebar/ShortcutsSection.tsx`
- Modify: `tinycld/books/sidebar.tsx`
- Create: `tests/shortcuts-section.test.tsx`
- Modify: `tests/books-sidebar-render.test.tsx`

**Interfaces:**
- Consumes: task 8 (all of it); part 1 `useSidebarShortcuts(): { shortcuts; isCustomized; isReady; isError; recovery; save; reset; isSaving }`; existing `useBooksAccess()`, `mergeRecoveries`, `recoverLiveQueries`, core `SidebarHeading`, `SidebarItem`.
- Produces: `useShortcutLookup(shortcuts: readonly Shortcut[]): { input: ShortcutRowsInput; isError: boolean; recovery: LiveRecovery }` (task 10 uses it for the draft), `useShortcutRows(): { rows: ShortcutRow[]; isReady; isEmpty; isError; retry() }`, `ShortcutsSection`, the test ids `books-shortcut-<kind>-<ref>`, `books-shortcuts-empty`, `books-shortcuts-error`, `books-shortcuts-retry`, and the heading "Go to" over the fixed navigation.

The section has no Customize button yet (task 10). The popover trigger stays in the sidebar until task 9.

- [ ] **Step 1: Write the failing test**

`tests/shortcuts-section.test.tsx`:

````tsx
// @vitest-environment happy-dom
import { fireEvent, waitFor } from '@testing-library/react'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shortcutTestId } from '../tinycld/books/lib/shortcut-rows'
import type { BooksSidebarShortcuts } from '../tinycld/books/types'
import { ME, onDemandStore, storedAccounts } from './accounts-form-harness'
import { byTestId } from './accounts-test-rows'
import {
    BALANCE_SHEET,
    idsWith,
    MY_SALES,
    PROFIT_AND_LOSS,
    renderSidebar,
    seedSidebar,
    shortcutsRow,
} from './sidebar-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: '/a/books/customers', params: {}, href: '/a/books/customers' }),
}))
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The refused read is logged by pbtsdb on purpose.
silenceLog()

const DEFAULT_IDS = [
    'books-shortcut-screen-customers',
    'books-shortcut-screen-vendors',
    'books-shortcut-screen-products',
    'books-shortcut-report-books-profit-and-loss',
    'books-shortcut-report-books-balance-sheet',
]

async function shortcutIds(container: HTMLElement, count: number) {
    await waitFor(() => expect(idsWith(container, 'books-shortcut-')).toHaveLength(count))
    return idsWith(container, 'books-shortcut-')
}

beforeEach(() => {
    vi.mocked(router.navigate).mockClear()
})

describe('Shortcuts section', () => {
    it('draws the default shortcuts for a user with no stored list', async () => {
        seedSidebar()
        const { container } = renderSidebar()

        expect(await shortcutIds(container, 5)).toEqual(DEFAULT_IDS)
        expect(
            byTestId(container, 'books-shortcut-report-books-profit-and-loss')?.textContent
        ).toBe('Profit and Loss')
    })

    it('draws the stored list in its order, one row for each kind', async () => {
        const [account] = storedAccountsAfterSeed()
        const registerId = shortcutTestId({ kind: 'register', ref: account.id })
        const { container } = renderSidebar()

        expect(await shortcutIds(container, 4)).toEqual([
            registerId,
            'books-shortcut-new-invoice',
            `books-shortcut-report-${MY_SALES.id}`,
            'books-shortcut-screen-vendors',
        ])
        expect(byTestId(container, registerId)?.textContent).toContain(account.name)
        expect(byTestId(container, 'books-shortcut-new-invoice')?.textContent).toBe('New invoice')
    })

    it('opens the route of a pressed shortcut', async () => {
        seedSidebar()
        const { container } = renderSidebar()
        await shortcutIds(container, 5)

        fireEvent.click(byTestId(container, 'books-shortcut-screen-vendors') as HTMLElement)
        fireEvent.click(
            byTestId(container, 'books-shortcut-report-books-balance-sheet') as HTMLElement
        )

        expect(vi.mocked(router.navigate).mock.calls.map(call => call[0])).toEqual([
            '/a/books/vendors',
            { pathname: '/a/reports/[id]', params: { id: BALANCE_SHEET.id } },
        ])
    })

    it('marks no shortcut active, also on the screen it opens', async () => {
        seedSidebar()
        const { container } = renderSidebar()
        await shortcutIds(container, 5)

        const label = byTestId(container, 'books-shortcut-screen-customers')?.querySelector(
            'rn-text'
        )
        expect(label?.getAttribute('class')).not.toContain('font-semibold')
    })

    it('says so when the user removed every shortcut, and draws no default', async () => {
        seedSidebar({ shortcuts: [] })
        const { container } = renderSidebar()

        await waitFor(() => expect(byTestId(container, 'books-shortcuts-empty')).not.toBeNull())
        expect(idsWith(container, 'books-shortcut-')).toEqual([])
    })

    it('leaves out a report the reader cannot open and a form for a reader', async () => {
        seedSidebar({
            level: 'read_only',
            reports: [PROFIT_AND_LOSS],
            shortcuts: [
                { kind: 'new', ref: 'invoice' },
                { kind: 'report', ref: 'books.balance_sheet' },
                { kind: 'report', ref: 'books.profit_and_loss' },
            ],
        })
        const { container } = renderSidebar()

        expect(await shortcutIds(container, 1)).toEqual([
            'books-shortcut-report-books-profit-and-loss',
        ])
        expect(byTestId(container, 'books-shortcuts-empty')).toBeNull()
    })

    it('draws the fixed navigation under a Go to heading, after the shortcuts', async () => {
        seedSidebar()
        const { container } = renderSidebar()
        await shortcutIds(container, 5)

        const headings = [...container.querySelectorAll('rn-text')]
            .map(node => node.textContent)
            .filter(text => text === 'Shortcuts' || text === 'Go to' || text === 'Accounting')
        expect(headings).toEqual(['Shortcuts', 'Go to', 'Accounting'])
        const lastShortcut = byTestId(container, DEFAULT_IDS[4]) as HTMLElement
        const dashboard = byTestId(container, 'books-nav-dashboard') as HTMLElement
        expect(
            lastShortcut.compareDocumentPosition(dashboard) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })

    it('shows an error with Retry, not the defaults, when the list cannot be read', async () => {
        seedSidebar()
        const store = onDemandStore<BooksSidebarShortcuts>(
            'books_sidebar_shortcuts',
            [shortcutsRow([{ kind: 'screen', ref: 'vendors' }])],
            { field: 'user', value: ME }
        )
        expectLiveQueryError(store.id)
        const { container } = renderSidebar()

        await waitFor(() => expect(byTestId(container, 'books-shortcuts-error')).not.toBeNull())
        expect(idsWith(container, 'books-shortcut-')).toEqual([])
        expect(byTestId(container, 'books-nav-dashboard')).not.toBeNull()

        fireEvent.click(byTestId(container, 'books-shortcuts-retry') as HTMLElement)

        expect(await shortcutIds(container, 1)).toEqual(['books-shortcut-screen-vendors'])
        expect(byTestId(container, 'books-shortcuts-error')).toBeNull()
    })
})

// Seeds a list with one shortcut of each kind; the register is the first seeded account.
function storedAccountsAfterSeed() {
    seedSidebar({ reports: [PROFIT_AND_LOSS, MY_SALES] })
    const accounts = storedAccounts()
    seedSidebar({
        reports: [PROFIT_AND_LOSS, MY_SALES],
        shortcuts: [
            { kind: 'register', ref: accounts[0].id },
            { kind: 'new', ref: 'invoice' },
            { kind: 'report', ref: MY_SALES.id },
            { kind: 'screen', ref: 'vendors' },
        ],
    })
    return accounts
}
````

- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/shortcuts-section.test.tsx`
Expected: FAIL: every test waits for `books-shortcut-` rows that the sidebar does not draw.

- [ ] **Step 3: Write the two hooks**

`tinycld/books/hooks/useShortcutLookup.ts`:

````ts
import { inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import type { ShortcutRowsInput } from '../lib/shortcut-rows'
import type { Shortcut } from '../lib/sidebar-shortcuts'
import { useBooksAccess } from './useBooksAccess'
import { useBooksReports } from './useBooksReports'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * What a list of shortcuts needs to become rows (`shortcutRows`): the Books reports the
 * user can open and the accounts of the list's register shortcuts. `isError` is true
 * while one of the two reads failed; `recovery` is for recoverLiveQueries. A failed read
 * gives an empty list for its kind, so the rows of the other kinds stay.
 */
export function useShortcutLookup(shortcuts: readonly Shortcut[]) {
    const [accountsCollection] = useStore('books_accounts')
    const orgHref = useOrgHref()
    const { canWrite } = useBooksAccess()
    const reports = useBooksReports()
    const accountIds = shortcuts
        .filter(shortcut => shortcut.kind === 'register')
        .map(shortcut => shortcut.ref)
    const accountsQuery = useLiveQuery({
        query: q => {
            if (accountIds.length === 0) return undefined
            return q
                .from({ account: accountsCollection })
                .where(({ account }) => inArray(account.id, accountIds))
                .select(({ account }) => ({
                    id: account.id,
                    number: account.number,
                    name: account.name,
                }))
        },
        queryKey: ['books', 'shortcut-accounts', accountIds.join(',')],
    })
    const accountsFailed = accountIds.length > 0 && accountsQuery.isError

    const input: ShortcutRowsInput = {
        canWrite,
        reports: reports.reports,
        accounts: accountsFailed ? [] : (accountsQuery.data ?? []),
        orgHref,
    }
    const recovery = mergeRecoveries([
        reports.recovery,
        accountsFailed
            ? { queries: [accountsQuery.collection], sources: [accountsCollection] }
            : NO_RECOVERY,
    ])

    return { input, isError: reports.isError || accountsFailed, recovery }
}
````

`tinycld/books/hooks/useShortcutRows.ts`:

````ts
import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { mergeRecoveries } from '../lib/live-recovery'
import { shortcutRows } from '../lib/shortcut-rows'
import { useShortcutLookup } from './useShortcutLookup'
import { useSidebarShortcuts } from './useSidebarShortcuts'

/**
 * The Shortcuts section of the sidebar: the user's shortcuts as rows. `isError` is true
 * while a read the rows need failed (the list itself, the reports, or the accounts of the
 * register shortcuts); `retry` recovers every failed read in one call. With the list's own
 * read failed there is no row; with only the reports or the accounts failed, the other
 * rows stay.
 */
export function useShortcutRows() {
    const list = useSidebarShortcuts()
    const lookup = useShortcutLookup(list.shortcuts)
    const rows = shortcutRows(list.shortcuts, lookup.input)
    const recovery = mergeRecoveries([list.recovery, lookup.recovery])
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.sidebar.shortcuts', err),
        })
    }

    return {
        rows,
        isReady: list.isReady,
        isEmpty: list.isReady && !list.isError && list.shortcuts.length === 0,
        isError: list.isError || lookup.isError,
        retry,
    }
}
````

- [ ] **Step 4: Write the section**

`tinycld/books/components/sidebar/ShortcutsSection.tsx`:

````tsx
import { SidebarHeading, SidebarItem } from '@tinycld/core/components/sidebar-primitives'
import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useShortcutRows } from '../../hooks/useShortcutRows'
import type { ShortcutRow } from '../../lib/shortcut-rows'

function ShortcutsNote({ isVisible, text }: { isVisible: boolean; text: string }) {
    if (!isVisible) return null
    return (
        <Text testID="books-shortcuts-empty" className="px-3 py-2 text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

function ShortcutsError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View testID="books-shortcuts-error" className="flex-row items-center gap-2 px-3">
            <Text accessibilityRole="alert" className="flex-1 text-sm text-danger">
                Could not load your shortcuts
            </Text>
            <Pressable
                testID="books-shortcuts-retry"
                accessibilityRole="button"
                onPress={onRetry}
                className="justify-center px-2"
                style={{ minHeight: 44 }}
            >
                <Text className="text-sm font-medium text-primary">Retry</Text>
            </Pressable>
        </View>
    )
}

// A shortcut never shows the active highlight: the fixed navigation under it marks where
// the user is, and a second mark for the same screen would be noise.
function renderRow(row: ShortcutRow) {
    return (
        <SidebarItem
            key={row.key}
            label={row.label}
            icon={row.icon}
            closesDrawer
            onPress={() => router.navigate(row.href)}
            testID={row.testID}
        />
    )
}

// The first section of the Books sidebar: the user's own shortcuts, in the user's order.
export function ShortcutsSection() {
    const { rows, isEmpty, isError, retry } = useShortcutRows()
    const items = rows.map(renderRow)
    return (
        <>
            <SidebarHeading>Shortcuts</SidebarHeading>
            {items}
            <ShortcutsNote isVisible={isEmpty} text="No shortcuts" />
            <ShortcutsError isVisible={isError} onRetry={retry} />
        </>
    )
}
````

- [ ] **Step 5: Draw it in the sidebar**

Apply to `tinycld/books/sidebar.tsx`:

````diff
--- a/tinycld/books/sidebar.tsx
+++ b/tinycld/books/sidebar.tsx
@@ -11,6 +11,7 @@
 import { ChevronDown, ChevronRight, Plus } from 'lucide-react-native'
 import { Pressable } from 'react-native'
 import { NewMenu } from './components/NewMenu'
+import { ShortcutsSection } from './components/sidebar/ShortcutsSection'
 import { useBooksSidebar } from './hooks/useBooksSidebar'
 import { useNewMenu } from './hooks/useNewMenu'
 import type { SidebarEntry } from './lib/shell-nav'
@@ -106,6 +107,8 @@
                 columns={columns}
                 onSelect={open}
             />
+            <ShortcutsSection />
+            <SidebarHeading>Go to</SidebarHeading>
             {top.map(renderItem)}
             <AccountingHeading
                 isVisible={hasAccounting}
````

- [ ] **Step 6: Give the sidebar render test the stores the section reads**

The sidebar now reads `books_sidebar_shortcuts`, `reports` and (for a register shortcut) `books_accounts`. Apply to `tests/books-sidebar-render.test.tsx`:

````diff
diff --git a/tests/books-sidebar-render.test.tsx b/tests/books-sidebar-render.test.tsx
index 00ceeec9..6901ce57 100644
--- a/tests/books-sidebar-render.test.tsx
+++ b/tests/books-sidebar-render.test.tsx
@@ -1,9 +1,7 @@
 // @vitest-environment happy-dom
-import { render } from '@testing-library/react'
 import { beforeEach, describe, expect, it, vi } from 'vitest'
-import BooksSidebar from '../tinycld/books/sidebar'
 import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'
-import { seedBooks } from './accounts-form-harness'
+import { renderSidebar, seedSidebar } from './sidebar-harness'
 
 const url = vi.hoisted(() => ({ pathname: '/' }))
 
@@ -31,13 +29,13 @@ function items(container: HTMLElement) {
 
 describe('BooksSidebar rendering', () => {
     beforeEach(() => {
-        seedBooks({ level: 'admin' })
+        seedSidebar()
         useBooksUIStore.setState({ isAccountingOpen: true })
         url.pathname = '/'
     })
 
     it('draws the Settings entry last', () => {
-        const { container } = render(<BooksSidebar />)
+        const { container } = renderSidebar()
         const ids = items(container).map(i => i.id)
         expect(ids).toContain('books-nav-settings')
         expect(ids[ids.length - 1]).toBe('books-nav-settings')
@@ -45,13 +43,13 @@ describe('BooksSidebar rendering', () => {
 
     it('draws Settings last even when Accounting is folded', () => {
         useBooksUIStore.setState({ isAccountingOpen: false })
-        const { container } = render(<BooksSidebar />)
+        const { container } = renderSidebar()
         const ids = items(container).map(i => i.id)
         expect(ids[ids.length - 1]).toBe('books-nav-settings')
     })
 
     it('draws Dashboard, Banking, Sales, Expenses, then Lists', () => {
-        const { container } = render(<BooksSidebar />)
+        const { container } = renderSidebar()
         const ids = items(container).map(i => i.id)
         expect(ids.slice(0, 5)).toEqual([
             'books-nav-dashboard',
@@ -64,7 +62,7 @@ describe('BooksSidebar rendering', () => {
 
     it('marks only Expenses active on a bill', () => {
         url.pathname = '/a/books/bills/x'
-        const { container } = render(<BooksSidebar />)
+        const { container } = renderSidebar()
         const active = items(container)
             .filter(i => i.isActive)
             .map(i => i.id)
@@ -79,7 +77,7 @@ describe('BooksSidebar rendering', () => {
         '/a/books/credit-memos/abc',
     ])('marks only Sales active on %s', pathname => {
         url.pathname = pathname
-        const { container } = render(<BooksSidebar />)
+        const { container } = renderSidebar()
         const active = items(container)
             .filter(i => i.isActive)
             .map(i => i.id)
@@ -91,7 +89,7 @@ describe('BooksSidebar rendering', () => {
         '/a/books/settings/company',
     ])('marks only Settings active on %s', pathname => {
         url.pathname = pathname
-        const { container } = render(<BooksSidebar />)
+        const { container } = renderSidebar()
         const active = items(container)
             .filter(i => i.isActive)
             .map(i => i.id)
````

- [ ] **Step 7: Run the tests, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/shortcuts-section.test.tsx tests/books-sidebar-render.test.tsx tests/books-sidebar.test.tsx tests/new-menu.test.tsx && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/sidebar.tsx tinycld/books/hooks/useShortcutLookup.ts tinycld/books/hooks/useShortcutRows.ts tinycld/books/components/sidebar tests/shortcuts-section.test.tsx tests/books-sidebar-render.test.tsx && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: PASS (`shortcuts-section` 8 tests); biome and the typecheck print no error.

- [ ] **Step 8: Commit**

```bash
git add tinycld/books/sidebar.tsx tinycld/books/hooks/useShortcutLookup.ts tinycld/books/hooks/useShortcutRows.ts tinycld/books/components/sidebar/ShortcutsSection.tsx tests/shortcuts-section.test.tsx tests/books-sidebar-render.test.tsx
git commit -m "books: Shortcuts section in the sidebar"
```

---

### Task 9: New section in the sidebar, popover out of the shell

**Files:**
- Create: `tinycld/books/components/sidebar/FoldHeading.tsx`
- Create: `tinycld/books/components/sidebar/NewSection.tsx`
- Modify: `tinycld/books/stores/books-ui-store.ts`
- Modify: `tinycld/books/sidebar.tsx`
- Modify: `tinycld/books/components/NewFab.tsx`
- Create: `tests/new-section.test.tsx`
- Modify: `tests/books-ui-store.test.ts`

**Interfaces:**
- Consumes: existing `useNewMenu(): { isVisible; columns; open(action) }` (`hooks/useNewMenu.ts`, unchanged), `hidesNewFab` (`lib/shell-nav.ts`), core `useWorkspaceStore` (`setDrawerOpen`), core `FAB`; task 8b's sidebar.
- Produces: `useBooksUIStore` gets `isNewOpen: boolean` (false at first, persisted), `toggleNew()`, `openNew()`; `FoldHeading({ title, isOpen, onToggle, testID })` (task 14 uses it for Reports); `NewSection`, `newSectionTestId(action)`; the test ids `books-sidebar-new-toggle`, `books-sidebar-new-group-<customers|vendors|other>`, `books-sidebar-new-<action id with _ as ->`.

`components/NewMenu.tsx` stays: the customer and vendor pages use it for "New transaction", with its `books-new-*` ids. Only the shell stops using it. After this task the e2e door still presses the popover, which is gone: task 9b follows at once and gives the door its new body. Do not run e2e between the two.

- [ ] **Step 1: Write the failing tests**

`tests/new-section.test.tsx`:

````tsx
// @vitest-environment happy-dom
import { fireEvent, render, waitFor } from '@testing-library/react'
import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewFab } from '../tinycld/books/components/NewFab'
import { NEW_ACTIONS } from '../tinycld/books/lib/new-actions'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'
import { byTestId } from './accounts-test-rows'
import { idsWith, renderSidebar, SidebarProviders, seedSidebar } from './sidebar-harness'

const url = vi.hoisted(() => ({ pathname: '/a/books/entries' }))

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: url.pathname, params: {}, href: url.pathname }),
}))
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }

function toggle(container: HTMLElement) {
    return byTestId(container, 'books-sidebar-new-toggle')
}

beforeEach(() => {
    useBooksUIStore.setState({ isNewOpen: false })
    useWorkspaceStore.setState({ isDrawerOpen: false })
    useWindowSizeStore.setState(DESKTOP)
    url.pathname = '/a/books/entries'
    vi.mocked(router.push).mockClear()
})

describe('New section', () => {
    it('is folded at first: the heading with its button, and no action', async () => {
        seedSidebar({ level: 'bookkeeper' })
        const { container } = renderSidebar()

        await waitFor(() => expect(toggle(container)).not.toBeNull())
        expect(toggle(container)?.getAttribute('accessibilitylabel')).toBe('Expand New')
        expect(idsWith(container, 'books-sidebar-new-group-')).toEqual([])
    })

    it('opens to the three groups with every action, in the order of the registry', async () => {
        seedSidebar({ level: 'bookkeeper' })
        const { container } = renderSidebar()
        await waitFor(() => expect(toggle(container)).not.toBeNull())

        fireEvent.click(toggle(container) as HTMLElement)

        expect(toggle(container)?.getAttribute('accessibilitylabel')).toBe('Collapse New')
        expect(idsWith(container, 'books-sidebar-new-group-')).toEqual([
            'books-sidebar-new-group-customers',
            'books-sidebar-new-group-vendors',
            'books-sidebar-new-group-other',
        ])
        const items = idsWith(container, 'books-sidebar-new-').filter(
            id => !id.startsWith('books-sidebar-new-group-') && id !== 'books-sidebar-new-toggle'
        )
        expect(items).toEqual(
            NEW_ACTIONS.map(action => `books-sidebar-new-${action.id.replace(/_/g, '-')}`)
        )
        expect(items.some(id => id.includes('_'))).toBe(false)
        // An action is a direct child of its group, and the group names itself.
        const invoice = byTestId(container, 'books-sidebar-new-invoice') as HTMLElement
        expect(invoice.parentElement?.getAttribute('testid')).toBe(
            'books-sidebar-new-group-customers'
        )
        expect(invoice.parentElement?.textContent).toContain('Customers')
        expect(invoice.textContent).toBe('Invoice')
    })

    it('opens the form of a pressed action', async () => {
        seedSidebar({ level: 'bookkeeper' })
        useBooksUIStore.setState({ isNewOpen: true })
        const { container } = renderSidebar()
        await waitFor(() =>
            expect(byTestId(container, 'books-sidebar-new-sales-receipt')).not.toBeNull()
        )

        fireEvent.click(byTestId(container, 'books-sidebar-new-sales-receipt') as HTMLElement)

        expect(vi.mocked(router.push).mock.calls.map(call => call[0])).toEqual([
            '/a/books/sales-receipts/new',
        ])
    })

    it('keeps the fold state the user left', async () => {
        seedSidebar({ level: 'bookkeeper' })
        const first = renderSidebar()
        await waitFor(() => expect(toggle(first.container)).not.toBeNull())
        fireEvent.click(toggle(first.container) as HTMLElement)
        first.unmount()

        const second = renderSidebar()

        await waitFor(() =>
            expect(byTestId(second.container, 'books-sidebar-new-invoice')).not.toBeNull()
        )
    })

    it('stands between the shortcuts and the fixed navigation', async () => {
        seedSidebar({ level: 'bookkeeper' })
        const { container } = renderSidebar()
        await waitFor(() =>
            expect(byTestId(container, 'books-shortcut-screen-customers')).not.toBeNull()
        )

        const shortcut = byTestId(container, 'books-shortcut-screen-customers') as HTMLElement
        const fold = toggle(container) as HTMLElement
        const dashboard = byTestId(container, 'books-nav-dashboard') as HTMLElement
        expect(
            shortcut.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        expect(
            fold.compareDocumentPosition(dashboard) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })

    it('is not drawn for a reader, open or not', async () => {
        seedSidebar({ level: 'read_only' })
        useBooksUIStore.setState({ isNewOpen: true })
        const { container } = renderSidebar()

        await waitFor(() =>
            expect(byTestId(container, 'books-shortcut-screen-customers')).not.toBeNull()
        )
        expect(idsWith(container, 'books-sidebar-new-')).toEqual([])
    })

    it('leaves no popover trigger and no popover item in the sidebar', async () => {
        seedSidebar({ level: 'bookkeeper' })
        useBooksUIStore.setState({ isNewOpen: true })
        const { container } = renderSidebar()
        await waitFor(() => expect(toggle(container)).not.toBeNull())

        expect(idsWith(document.body, 'books-new-')).toEqual([])
        // "New" is drawn one time: the section's heading.
        const news = [...container.querySelectorAll('rn-text')].filter(
            node => node.textContent === 'New'
        )
        expect(news).toHaveLength(1)
    })
})

describe('NewFab', () => {
    function renderFab() {
        return render(<NewFab />, { wrapper: SidebarProviders })
    }

    function fab() {
        return document.body.querySelector('[accessibilitylabel="New"]')
    }

    it('opens the drawer with the New section open, on a phone', async () => {
        seedSidebar({ level: 'bookkeeper' })
        useWindowSizeStore.setState(PHONE)
        renderFab()
        await waitFor(() => expect(fab()).not.toBeNull())

        fireEvent.click(fab() as HTMLElement)

        expect(useWorkspaceStore.getState().isDrawerOpen).toBe(true)
        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
    })

    it('opens the section and never closes one that is open', async () => {
        seedSidebar({ level: 'bookkeeper' })
        useWindowSizeStore.setState(PHONE)
        useBooksUIStore.setState({ isNewOpen: true })
        renderFab()
        await waitFor(() => expect(fab()).not.toBeNull())

        fireEvent.click(fab() as HTMLElement)

        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
    })

    it('is not drawn on a wide window, for a reader, or on a form', async () => {
        seedSidebar({ level: 'bookkeeper' })
        const wide = renderFab()
        await waitFor(() => expect(useBooksUIStore.getState()).toBeTruthy())
        expect(fab()).toBeNull()
        wide.unmount()

        useWindowSizeStore.setState(PHONE)
        url.pathname = '/a/books/invoices/new'
        const onForm = renderFab()
        expect(fab()).toBeNull()
        onForm.unmount()

        url.pathname = '/a/books/entries'
        seedSidebar({ level: 'read_only' })
        renderFab()
        expect(fab()).toBeNull()
    })
})
````

Apply to `tests/books-ui-store.test.ts`:

````diff
diff --git a/tests/books-ui-store.test.ts b/tests/books-ui-store.test.ts
index f727ea2d..03df2aae 100644
--- a/tests/books-ui-store.test.ts
+++ b/tests/books-ui-store.test.ts
@@ -3,7 +3,7 @@ import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'
 
 describe('useBooksUIStore', () => {
     beforeEach(() => {
-        useBooksUIStore.setState({ isAccountingOpen: true })
+        useBooksUIStore.setState({ isAccountingOpen: true, isNewOpen: false })
     })
 
     it('starts with the accounting group open', () => {
@@ -17,13 +17,23 @@ describe('useBooksUIStore', () => {
         expect(useBooksUIStore.getState().isAccountingOpen).toBe(true)
     })
 
-    it('persists only isAccountingOpen under tinycld_books_ui', () => {
+    it('starts with the New section closed; toggleNew flips it and openNew only opens', () => {
+        expect(useBooksUIStore.getState().isNewOpen).toBe(false)
+        useBooksUIStore.getState().toggleNew()
+        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
+        useBooksUIStore.getState().openNew()
+        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
+        useBooksUIStore.getState().toggleNew()
+        expect(useBooksUIStore.getState().isNewOpen).toBe(false)
+        useBooksUIStore.getState().openNew()
+        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
+    })
+
+    it('persists the two fold states under tinycld_books_ui', () => {
         const options = useBooksUIStore.persist.getOptions()
         expect(options.name).toBe('tinycld_books_ui')
         useBooksUIStore.getState().toggleAccounting()
         const partial = options.partialize?.(useBooksUIStore.getState())
-        expect(partial).toEqual({ isAccountingOpen: false })
-        expect(Object.keys(partial ?? {})).toEqual(['isAccountingOpen'])
-        useBooksUIStore.setState({ isAccountingOpen: true })
+        expect(partial).toEqual({ isAccountingOpen: false, isNewOpen: false })
     })
 })
````

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/new-section.test.tsx tests/books-ui-store.test.ts`
Expected: FAIL: `new-section` finds no `books-sidebar-new-toggle`; `books-ui-store` has no `isNewOpen`.

- [ ] **Step 3: Add the fold state**

Apply to `tinycld/books/stores/books-ui-store.ts`:

````diff
--- a/tinycld/books/stores/books-ui-store.ts
+++ b/tinycld/books/stores/books-ui-store.ts
@@ -3,6 +3,11 @@
 interface BooksUIState {
     isAccountingOpen: boolean
     toggleAccounting: () => void
+    // The New section of the sidebar. Closed until the user opens it.
+    isNewOpen: boolean
+    toggleNew: () => void
+    // Opens the New section and never closes it: the phone's New button calls this.
+    openNew: () => void
 }
 
 export const useBooksUIStore = create<BooksUIState>()(
@@ -12,11 +17,18 @@
             toggleAccounting: () => {
                 set(s => ({ isAccountingOpen: !s.isAccountingOpen }))
             },
+            isNewOpen: false,
+            toggleNew: () => {
+                set(s => ({ isNewOpen: !s.isNewOpen }))
+            },
+            openNew: () => {
+                set({ isNewOpen: true })
+            },
         }),
         {
             name: 'tinycld_books_ui',
             storage: asyncStorage,
-            partialize: s => ({ isAccountingOpen: s.isAccountingOpen }),
+            partialize: s => ({ isAccountingOpen: s.isAccountingOpen, isNewOpen: s.isNewOpen }),
         }
     )
 )
````

- [ ] **Step 4: Write the fold heading and the section**

`tinycld/books/components/sidebar/FoldHeading.tsx`:

````tsx
import { SidebarHeading } from '@tinycld/core/components/sidebar-primitives'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { Pressable } from 'react-native'

interface FoldHeadingProps {
    title: string
    isOpen: boolean
    onToggle: () => void
    // The test id of the fold button.
    testID: string
}

// A sidebar heading with a button that folds the rows under it. The button's name says
// what a press does ("Expand New", "Collapse New"), so a screen reader and a test both
// read the state from it.
export function FoldHeading({ title, isOpen, onToggle, testID }: FoldHeadingProps) {
    const mutedColor = useThemeColor('muted-foreground')
    const Chevron = isOpen ? ChevronDown : ChevronRight
    const label = isOpen ? `Collapse ${title}` : `Expand ${title}`

    return (
        <SidebarHeading
            action={
                <Pressable
                    testID={testID}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ expanded: isOpen }}
                    onPress={onToggle}
                    hitSlop={8}
                    className="items-center justify-center"
                    style={{ minWidth: 44, minHeight: 44 }}
                >
                    <Chevron size={16} color={mutedColor} />
                </Pressable>
            }
        >
            {title}
        </SidebarHeading>
    )
}
````

`tinycld/books/components/sidebar/NewSection.tsx`:

````tsx
import { SidebarItem } from '@tinycld/core/components/sidebar-primitives'
import { Text, View } from 'react-native'
import { useNewMenu } from '../../hooks/useNewMenu'
import type { NewAction } from '../../lib/new-actions'
import type { NewMenuColumn } from '../../lib/shell-nav'
import { useBooksUIStore } from '../../stores/books-ui-store'
import { FoldHeading } from './FoldHeading'

// A test id never holds an underscore: the action `sales_receipt` is
// `books-sidebar-new-sales-receipt`.
export function newSectionTestId(action: NewAction): string {
    return `books-sidebar-new-${action.id.replace(/_/g, '-')}`
}

interface NewGroupProps {
    column: NewMenuColumn
    onSelect: (action: NewAction) => void
}

// One group (Customers, Vendors, Other): its label, then its actions as the group's own
// children, in the order of lib/new-actions.ts.
function NewGroup({ column, onSelect }: NewGroupProps) {
    const items = column.actions.map(action => (
        <SidebarItem
            key={action.id}
            label={action.label}
            closesDrawer
            onPress={() => onSelect(action)}
            testID={newSectionTestId(action)}
        />
    ))
    return (
        <View testID={`books-sidebar-new-group-${column.heading.toLowerCase()}`}>
            <Text className="px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
                {column.heading}
            </Text>
            {items}
        </View>
    )
}

// The New section of the Books sidebar: every transaction form and record a writer can
// start, under Customers, Vendors and Other. Folded until the user opens it (the state is
// kept). A reader has no New action, so the section is not drawn at all.
export function NewSection() {
    const { isVisible, columns, open } = useNewMenu()
    const isOpen = useBooksUIStore(s => s.isNewOpen)
    const toggle = useBooksUIStore(s => s.toggleNew)
    if (!isVisible) return null

    const groups = isOpen
        ? columns.map(column => <NewGroup key={column.heading} column={column} onSelect={open} />)
        : null
    return (
        <>
            <FoldHeading
                title="New"
                isOpen={isOpen}
                onToggle={toggle}
                testID="books-sidebar-new-toggle"
            />
            {groups}
        </>
    )
}
````

- [ ] **Step 5: Take the popover out of the sidebar**

Replace `tinycld/books/sidebar.tsx` with:

````tsx
import {
    SidebarHeading,
    SidebarItem,
    SidebarNav,
} from '@tinycld/core/components/sidebar-primitives'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { FoldHeading } from './components/sidebar/FoldHeading'
import { NewSection } from './components/sidebar/NewSection'
import { ShortcutsSection } from './components/sidebar/ShortcutsSection'
import { useBooksSidebar } from './hooks/useBooksSidebar'
import type { SidebarEntry } from './lib/shell-nav'

interface AccountingHeadingProps {
    isVisible: boolean
    isOpen: boolean
    onToggle: () => void
}

function AccountingHeading({ isVisible, isOpen, onToggle }: AccountingHeadingProps) {
    if (!isVisible) return null
    return (
        <FoldHeading
            title="Accounting"
            isOpen={isOpen}
            onToggle={onToggle}
            testID="books-nav-accounting-toggle"
        />
    )
}

// The Books sidebar, top to bottom: the user's Shortcuts, the New actions, then the fixed
// navigation under "Go to". The same component is the desktop sidebar and the phone drawer.
export default function BooksSidebar() {
    const {
        top,
        end,
        visibleAccounting,
        hasAccounting,
        isAccountingOpen,
        toggleAccounting,
        isActive,
    } = useBooksSidebar()
    const orgHref = useOrgHref()

    const renderItem = (entry: SidebarEntry) => (
        <SidebarItem
            key={entry.id}
            label={entry.label}
            icon={entry.icon}
            isActive={isActive(entry)}
            closesDrawer
            onPress={() => router.navigate(orgHref(entry.href, entry.params))}
            testID={`books-nav-${entry.id}`}
        />
    )
    const topItems = top.map(renderItem)
    const accountingItems = visibleAccounting.map(renderItem)
    const endItems = end.map(renderItem)

    return (
        <SidebarNav>
            <ShortcutsSection />
            <NewSection />
            <SidebarHeading>Go to</SidebarHeading>
            {topItems}
            <AccountingHeading
                isVisible={hasAccounting}
                isOpen={isAccountingOpen}
                onToggle={toggleAccounting}
            />
            {accountingItems}
            {endItems}
        </SidebarNav>
    )
}
````

- [ ] **Step 6: Make the round New button open the drawer**

Replace `tinycld/books/components/NewFab.tsx` with:

````tsx
import { FAB } from '@tinycld/core/components/FAB'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { useUrl } from '@tinycld/core/lib/use-url'
import { Plus } from 'lucide-react-native'
import { useNewMenu } from '../hooks/useNewMenu'
import { hidesNewFab } from '../lib/shell-nav'
import { useBooksUIStore } from '../stores/books-ui-store'

// The round New button of the phone layout. The New actions are in the Books sidebar, which
// on a phone is the drawer, and core's drawer has no visible control that opens it (only a
// pan from the left edge). So the button opens the drawer with the New section open.
export function NewFab() {
    const isMobile = useBreakpoint() === 'mobile'
    const { isVisible } = useNewMenu()
    const isOnEntry = hidesNewFab(useUrl().pathname)
    const setDrawerOpen = useWorkspaceStore(s => s.setDrawerOpen)
    const openNew = useBooksUIStore(s => s.openNew)
    const showNewActions = () => {
        openNew()
        setDrawerOpen(true)
    }

    return (
        <FAB
            icon={Plus}
            accessibilityLabel="New"
            isVisible={isMobile && isVisible && !isOnEntry}
            onPress={showNewActions}
        />
    )
}
````

- [ ] **Step 7: Run the unit tests, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/new-section.test.tsx tests/books-ui-store.test.ts tests/shortcuts-section.test.tsx tests/books-sidebar-render.test.tsx tests/new-menu.test.tsx && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/sidebar.tsx tinycld/books/components/NewFab.tsx tinycld/books/components/sidebar tinycld/books/stores/books-ui-store.ts tests/new-section.test.tsx tests/books-ui-store.test.ts && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: PASS (`new-section` 10 tests, `books-ui-store` 4 tests); biome and the typecheck print no error. If the typecheck names an import of `NewMenu` that is now unused in a shell file, remove that import; do not delete `components/NewMenu.tsx`.

- [ ] **Step 8: Commit**

```bash
git add tinycld/books/sidebar.tsx tinycld/books/components/NewFab.tsx tinycld/books/components/sidebar/FoldHeading.tsx tinycld/books/components/sidebar/NewSection.tsx tinycld/books/stores/books-ui-store.ts tests/new-section.test.tsx tests/books-ui-store.test.ts
git commit -m "books: New section in the sidebar, popover out of the shell"
```

---

### Task 9b: The e2e door opens the New section

**Files:**
- Modify: `tests/e2e/new-menu-helpers.ts`
- Modify: `tests/e2e/statements-tab.spec.ts`
- Modify: `tests/e2e/bank-deposit-elsewhere.spec.ts`

**Interfaces:**
- Consumes: part 1's e2e door `tests/e2e/new-menu-helpers.ts` (`newActionTestId`, `openNewMenu`, `newActionItem`, `openNewAction`; the signatures stay, the bodies change here); task 9's test ids.
- Produces: the door for the New section at desktop and phone widths, and `newSectionToggle(page)`.

- [ ] **Step 1: Give the e2e door its new body**

Replace `tests/e2e/new-menu-helpers.ts` with:

````ts
import { expect, type Locator, type Page } from '@playwright/test'
import { isPhone } from './account-register-helpers'

// The one place that knows how a spec reaches Books' New actions. Every helper and spec
// that starts a transaction from New goes through these, so a change of where the actions
// live changes this file only.
//
// The actions are the New section of the Books sidebar: `books-sidebar-new-<id>` items
// under a heading that folds. On a wide screen the sidebar is on screen. On a phone the
// sidebar is the drawer, and the round New button (core's FAB, which has no button role)
// opens the drawer with the section open.

// The test id of the action with this NEW_ACTIONS id (lib/new-actions.ts). A test id
// never holds an underscore: `sales_receipt` is `books-sidebar-new-sales-receipt`.
export function newActionTestId(id: string): string {
    return `books-sidebar-new-${id.replace(/_/g, '-')}`
}

// The fold button of the New section. A reader has none.
export function newSectionToggle(page: Page): Locator {
    return page.getByTestId('books-sidebar-new-toggle').filter({ visible: true })
}

// Books must be open on a screen that shows New (a list, not a form). Shows the New
// actions and leaves them shown. The fold state is kept across screens and reloads, so
// this opens a folded section and never presses the fold button of an open one.
export async function openNewMenu(page: Page): Promise<void> {
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
        const panel = page.getByTestId('mobile-drawer-panel')
        await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)
    }
    const toggle = newSectionToggle(page)
    await toggle.waitFor()
    if ((await toggle.getAttribute('aria-label')) === 'Expand New') await toggle.click()
    await expect(toggle).toHaveAttribute('aria-label', 'Collapse New')
}

// The action's item in the open New section.
export function newActionItem(page: Page, id: string): Locator {
    return page.getByTestId(newActionTestId(id)).filter({ visible: true })
}

// Shows the New actions and presses one. The caller checks where it lands.
export async function openNewAction(page: Page, id: string): Promise<void> {
    await openNewMenu(page)
    await newActionItem(page, id).click()
}
````

- [ ] **Step 2: Rewrite the two reader checks**

A reader has no New section and no round New button; the old checks looked for the popover's ids, which no shell draws now, so they would pass with no meaning. Apply:

````diff
diff --git a/tests/e2e/bank-deposit-elsewhere.spec.ts b/tests/e2e/bank-deposit-elsewhere.spec.ts
index 9d68414f..d2cc853e 100644
--- a/tests/e2e/bank-deposit-elsewhere.spec.ts
+++ b/tests/e2e/bank-deposit-elsewhere.spec.ts
@@ -19,6 +19,7 @@ import {
 import { collaboratorLevel, type Level, setCollaboratorLevel } from './books-access-helpers'
 import { uniqueMemo } from './invoice-helpers'
 import { openEntriesList, settleFrames } from './journal-entries-helpers'
+import { newActionItem } from './new-menu-helpers'
 import { PAYMENT_URL } from './receive-payment-helpers'
 import { openSalesReceiptBySearch, SALES_RECEIPT_URL } from './sales-receipt-helpers'
 
@@ -311,11 +312,12 @@ test.describe('bank-deposit: reader (collaborator level)', () => {
         await view.goBack()
         await expect(shownDeposit(view, 'deposit-read-only')).toBeVisible()
 
-        // + New is hidden for a reader.
+        // A reader has no New section: no fold button and no Bank deposit action. The
+        // sidebar itself is drawn.
         await shownDeposit(view, 'deposit-back').click()
         await expect(view.getByTestId('entries-screen').filter({ visible: true })).toBeVisible()
-        await expect(view.getByText('New', { exact: true }).filter({ visible: true })).toHaveCount(
-            0
-        )
+        await expect(view.getByTestId('books-nav-lists').filter({ visible: true })).toBeVisible()
+        await expect(view.getByTestId('books-sidebar-new-toggle')).toHaveCount(0)
+        await expect(newActionItem(view, 'deposit')).toHaveCount(0)
     })
 })
diff --git a/tests/e2e/statements-tab.spec.ts b/tests/e2e/statements-tab.spec.ts
index 7200e76e..43aa9295 100644
--- a/tests/e2e/statements-tab.spec.ts
+++ b/tests/e2e/statements-tab.spec.ts
@@ -1,5 +1,6 @@
 import { expect, type Page, test } from '@playwright/test'
 import { DESKTOP, openBooks, openCustomer } from './customer-form-helpers'
+import { newActionItem } from './new-menu-helpers'
 import { fillInvoice, localDay, postInvoice } from './receive-payment-helpers'
 import {
     newStatementUrl,
@@ -299,15 +300,13 @@ test.describe('statements: tab and statement', () => {
         await page.getByTestId('customer-tab-statements').click()
         await expect(shown(page, 'customer-statements')).toBeVisible()
 
-        // A reader gets no New trigger at all (newMenuForAccess gives no column without
-        // write access), so the sidebar offers no New → Statement. A writer's desktop
-        // trigger is the visible "New" text (transfer-form.spec.ts).
+        // A reader gets no New section at all (newMenuForAccess gives no column without
+        // write access), so the sidebar offers no New → Statement: no fold button, no
+        // round New button, no Statement action. The sidebar itself is drawn.
         await expect(shown(page, 'books-nav-lists')).toBeVisible()
-        await expect(page.getByText('New', { exact: true }).filter({ visible: true })).toHaveCount(
-            0
-        )
+        await expect(page.getByTestId('books-sidebar-new-toggle')).toHaveCount(0)
         await expect(page.getByLabel('New', { exact: true })).toHaveCount(0)
-        await expect(page.getByTestId('books-new-statement')).toHaveCount(0)
+        await expect(newActionItem(page, 'statement')).toHaveCount(0)
 
         await page.setViewportSize(PHONE)
         const cards = shown(page, 'customer-statements-cards')
````

- [ ] **Step 3: Lint and typecheck the e2e files, then run the specs that use the door**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tests/e2e/new-menu-helpers.ts tests/e2e/statements-tab.spec.ts tests/e2e/bank-deposit-elsewhere.spec.ts && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: no error.

Run: `cd /Users/nas/tmp/tinycld/books && lsof -iTCP -sTCP:LISTEN -nP | grep -qE ':(7230|7231) ' && { echo PORTS-BUSY; exit 1; }; E2E_PORT=7230 E2E_PORT_2=7231 E2E_IMAP_PORT=1230 E2E_IMAP_PORT_2=1231 pnpm exec tinycld-pkg test:e2e books/tests/e2e/journal-entries-list-states.spec.ts books/tests/e2e/transfer-form.spec.ts books/tests/e2e/customer-form-page.spec.ts books/tests/e2e/statements-tab.spec.ts books/tests/e2e/bank-deposit-elsewhere.spec.ts books/tests/e2e/journal-entries-read-only.spec.ts books/tests/e2e/mobile-drawer.spec.ts`
Expected: all pass. These seven use the door at desktop and phone widths, the reader checks, the round New button, and the drawer. A failure is a defect of task 9 or 9b: find the cause (a wrong id, a section that did not open, a duplicate element) and fix it at the source. `PORTS-BUSY` or a run longer than the runner allows: report `NEEDS-RUN` with this command.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/new-menu-helpers.ts tests/e2e/statements-tab.spec.ts tests/e2e/bank-deposit-elsewhere.spec.ts
git commit -m "books: e2e door opens the New section of the sidebar"
```

---

### Task 10: Customize shortcuts dialog: the list

**Files:**
- Create: `tinycld/books/stores/shortcuts-dialog-store.ts`
- Create: `tinycld/books/hooks/useMovedFocus.ts`
- Create: `tinycld/books/hooks/useCustomizeShortcuts.ts`
- Modify: `tinycld/books/hooks/useSidebarShortcuts.ts` (part 1's hook)
- Create: `tinycld/books/components/sidebar/CustomizeShortcutsDialog.tsx`
- Modify: `tinycld/books/components/sidebar/ShortcutsSection.tsx`
- Modify: `tinycld/books/components/dashboard/DashboardEditList.tsx`
- Modify: `tinycld/books/screens/_layout.tsx`
- Create: `tests/customize-shortcuts.test.tsx`

**Interfaces:**
- Consumes: part 1 `useSidebarShortcuts()` (`shortcuts`, `isCustomized`, `isReady`, `isError`, `save(next)`, `reset()`), `DEFAULT_SHORTCUTS`, `removeShortcut(list, key)`, `moveShortcut(list, key, -1 | 1)`, `shortcutKey`; task 8 `shortcutRows`, `shortcutTestId`; task 8b `useShortcutLookup`; existing `DashboardIconButton`, core `Dialog`, `DIALOG_SUBMIT_SHORTCUT`, `SortableList`, `SortableDragHandle`, `useWorkspaceStore`.
- Changes part 1's hook, additive: `save(next, onSuccess?)` and `reset(onSuccess?)`; `onSuccess` runs after the write is saved and never after a refused one. Part 1's tests pass unchanged.
- Produces: `useShortcutsDialogStore: { draft: Shortcut[] | null; open(list); setDraft(next); close() }`; `useMovedFocus(...)`, `FocusRequest`, `MoveDirection`; `useCustomizeShortcuts(): { isOpen; canOpen; open(); draft: Shortcut[]; rows: CustomizeRow[]; isDefault; isEmpty; canSave; setDraft; remove(key); move(key, by); reorder(rows); resetToDefaults(); cancel(); save() }` with `CustomizeRow = { key; shortcut; label; icon: LucideIcon | null }`; `CustomizeShortcutsDialog`, `editRowTestId(row)`; the test ids `books-shortcuts-customize`, `books-shortcuts-dialog`, `books-shortcuts-row-<kind>-<ref>` with `-up`, `-down`, `-remove`, `-handle`, `books-shortcuts-dialog-empty`, `books-shortcuts-reset`, `books-shortcuts-save`.

Why a draft: part 1's `save` runs one write at a time, and a write that waits is not in `shortcuts` until the one before it returns. A change computed from `shortcuts` for each press would lose fast changes. So remove, move, drag and Reset to defaults change only the draft, and Save writes one time. The dialog closes only when the write is saved: a refused write shows part 1's toast and leaves the dialog open with the draft. Save is disabled while a write runs or the list cannot be written, and Cancel does nothing while a write runs. A draft equal to the defaults is saved as "no row" (`reset()`), so a later change of the defaults reaches the user. The dialog is drawn by the Books layout, not by the sidebar: on a phone the sidebar is in the drawer, and the pencil closes the drawer.

`useMovedFocus` is the focus rule of the dashboard's edit list, moved to its own file so that two lists share it; `DashboardEditList.tsx` loses its copy and nothing else.

- [ ] **Step 1: Write the failing test**

`tests/customize-shortcuts.test.tsx`:

````tsx
// @vitest-environment happy-dom
import { fireEvent, render, waitFor } from '@testing-library/react'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomizeShortcutsDialog } from '../tinycld/books/components/sidebar/CustomizeShortcutsDialog'
import type { Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'
import BooksSidebar from '../tinycld/books/sidebar'
import { useShortcutsDialogStore } from '../tinycld/books/stores/shortcuts-dialog-store'
import { refuseNthWrite } from './accounts-form-harness'
import { byTestId } from './accounts-test-rows'
import {
    idsWith,
    MY_SALES,
    PROFIT_AND_LOSS,
    SidebarProviders,
    seedSidebar,
} from './sidebar-harness'

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: '/a/books/customers', params: {}, href: '/a/books/customers' }),
}))
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const CUSTOMERS: Shortcut = { kind: 'screen', ref: 'customers' }
const VENDORS: Shortcut = { kind: 'screen', ref: 'vendors' }
const INVOICE: Shortcut = { kind: 'new', ref: 'invoice' }
const GONE_REPORT: Shortcut = { kind: 'report', ref: 'rptgone00000001' }

const ROW = 'books-shortcuts-row-'
const DEFAULT_ROWS = [
    `${ROW}screen-customers`,
    `${ROW}screen-vendors`,
    `${ROW}screen-products`,
    `${ROW}report-books-profit-and-loss`,
    `${ROW}report-books-balance-sheet`,
]

// The dialog's rows: the ids under the row prefix that are a row, not a row's button.
function rowIds(container: ParentNode) {
    return idsWith(container, ROW).filter(id => !/-(up|down|remove|handle)$/.test(id))
}

function press(container: HTMLElement, testID: string) {
    const node = byTestId(container, testID)
    if (!node) throw new Error(`no element ${testID}`)
    fireEvent.click(node)
}

// The React Native test stub does not copy `disabled` to the element; a disabled button
// of the dialog is the one drawn at 0.4 opacity.
function isDimmed(testID: string) {
    return byTestId(document.body, testID)?.getAttribute('style')?.includes('opacity: 0.4') ?? false
}

function pressCancel() {
    const dialog = byTestId(document.body, 'books-shortcuts-dialog')
    const cancel = [...(dialog?.querySelectorAll('rn-text') ?? [])].find(
        node => node.textContent === 'Cancel'
    )
    if (!cancel) throw new Error('no Cancel button')
    fireEvent.click(cancel)
}

// The sidebar and the dialog as the Books layout draws them.
function renderShell() {
    return render(
        <SidebarProviders>
            <BooksSidebar />
            <CustomizeShortcutsDialog />
        </SidebarProviders>
    )
}

async function openDialog(container: HTMLElement) {
    await waitFor(() => expect(byTestId(container, 'books-shortcuts-customize')).not.toBeNull())
    press(container, 'books-shortcuts-customize')
    await waitFor(() => expect(byTestId(document.body, 'books-shortcuts-dialog')).not.toBeNull())
}

function storedItems(store: { toArray: { items: unknown }[] }) {
    return store.toArray.map(row => row.items)
}

beforeEach(() => {
    useShortcutsDialogStore.setState({ draft: null })
    useToastStore.setState({ toasts: [] })
    useWindowSizeStore.setState({ width: 1280, height: 800 })
    useWorkspaceStore.setState({ isDrawerOpen: false })
})

describe('Customize shortcuts dialog', () => {
    it('opens from the pencil with the list in its order', async () => {
        seedSidebar({ shortcuts: [INVOICE, CUSTOMERS, VENDORS] })
        const { container } = renderShell()
        await openDialog(container)

        expect(rowIds(document.body)).toEqual([
            `${ROW}new-invoice`,
            `${ROW}screen-customers`,
            `${ROW}screen-vendors`,
        ])
        expect(byTestId(document.body, `${ROW}new-invoice`)?.textContent).toContain('New invoice')
    })

    it('shows the defaults for a user with no stored list', async () => {
        seedSidebar()
        const { container } = renderShell()
        await openDialog(container)

        await waitFor(() => expect(rowIds(document.body)).toEqual(DEFAULT_ROWS))
        expect(isDimmed('books-shortcuts-reset')).toBe(true)
    })

    it('writes nothing until Save, then writes the draft one time', async () => {
        const { shortcutsStore } = seedSidebar({ shortcuts: [INVOICE, CUSTOMERS, VENDORS] })
        const update = vi.spyOn(shortcutsStore, 'update')
        const { container } = renderShell()
        await openDialog(container)

        press(document.body as HTMLElement, `${ROW}screen-vendors-up`)
        press(document.body as HTMLElement, `${ROW}screen-vendors-up`)
        press(document.body as HTMLElement, `${ROW}screen-customers-remove`)
        expect(rowIds(document.body)).toEqual([`${ROW}screen-vendors`, `${ROW}new-invoice`])
        expect(update).not.toHaveBeenCalled()
        expect(idsWith(container, 'books-shortcut-')).toHaveLength(3)

        press(document.body as HTMLElement, 'books-shortcuts-save')
        await waitFor(() => expect(storedItems(shortcutsStore)).toEqual([[VENDORS, INVOICE]]))
        expect(update).toHaveBeenCalledTimes(1)
        await waitFor(() => expect(byTestId(document.body, 'books-shortcuts-dialog')).toBeNull())
        await waitFor(() =>
            expect(idsWith(container, 'books-shortcut-')).toEqual([
                'books-shortcut-screen-vendors',
                'books-shortcut-new-invoice',
            ])
        )
    })

    it('stays open with the draft when the write is refused, and saves on the next Save', async () => {
        const { shortcutsStore } = seedSidebar({ shortcuts: [INVOICE, CUSTOMERS] })
        const { container } = renderShell()
        await openDialog(container)
        press(document.body as HTMLElement, `${ROW}new-invoice-remove`)

        refuseNthWrite(1, new Error('refused'))
        press(document.body as HTMLElement, 'books-shortcuts-save')
        await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1))
        expect(byTestId(document.body, 'books-shortcuts-dialog')).not.toBeNull()
        expect(rowIds(document.body)).toEqual([`${ROW}screen-customers`])
        expect(storedItems(shortcutsStore)).toEqual([[INVOICE, CUSTOMERS]])

        press(document.body as HTMLElement, 'books-shortcuts-save')
        await waitFor(() => expect(storedItems(shortcutsStore)).toEqual([[CUSTOMERS]]))
        await waitFor(() => expect(byTestId(document.body, 'books-shortcuts-dialog')).toBeNull())
    })

    it('drops the draft on Cancel', async () => {
        const { shortcutsStore } = seedSidebar({ shortcuts: [INVOICE, CUSTOMERS] })
        const { container } = renderShell()
        await openDialog(container)

        press(document.body as HTMLElement, `${ROW}new-invoice-remove`)
        pressCancel()
        expect(byTestId(document.body, 'books-shortcuts-dialog')).toBeNull()
        expect(storedItems(shortcutsStore)).toEqual([[INVOICE, CUSTOMERS]])

        await openDialog(container)
        expect(rowIds(document.body)).toEqual([`${ROW}new-invoice`, `${ROW}screen-customers`])
    })

    it('disables Move up on the first row and Move down on the last', async () => {
        seedSidebar({ shortcuts: [INVOICE, CUSTOMERS] })
        const { container } = renderShell()
        await openDialog(container)

        expect(isDimmed(`${ROW}new-invoice-up`)).toBe(true)
        expect(isDimmed(`${ROW}new-invoice-down`)).toBe(false)
        expect(isDimmed(`${ROW}screen-customers-down`)).toBe(true)
    })

    it('saves an empty list as a stored empty list', async () => {
        const { shortcutsStore } = seedSidebar({ shortcuts: [CUSTOMERS] })
        const { container } = renderShell()
        await openDialog(container)

        press(document.body as HTMLElement, `${ROW}screen-customers-remove`)
        expect(byTestId(document.body, 'books-shortcuts-dialog-empty')).not.toBeNull()
        press(document.body as HTMLElement, 'books-shortcuts-save')

        await waitFor(() => expect(storedItems(shortcutsStore)).toEqual([[]]))
        await waitFor(() => expect(byTestId(container, 'books-shortcuts-empty')).not.toBeNull())
    })

    it('Reset to defaults deletes the stored list on Save', async () => {
        const { shortcutsStore } = seedSidebar({ shortcuts: [INVOICE] })
        const { container } = renderShell()
        await openDialog(container)

        press(document.body as HTMLElement, 'books-shortcuts-reset')
        expect(rowIds(document.body)).toEqual(DEFAULT_ROWS)
        expect(shortcutsStore.toArray).toHaveLength(1)

        press(document.body as HTMLElement, 'books-shortcuts-save')
        await waitFor(() => expect(shortcutsStore.toArray).toHaveLength(0))
        await waitFor(() => expect(idsWith(container, 'books-shortcut-')).toHaveLength(5))
    })

    it('shows a shortcut with nothing to open, so that the user can remove it', async () => {
        const { shortcutsStore } = seedSidebar({
            shortcuts: [GONE_REPORT, { kind: 'report', ref: MY_SALES.id }],
            reports: [PROFIT_AND_LOSS, MY_SALES],
        })
        const { container } = renderShell()
        await openDialog(container)

        const gone = `${ROW}report-rptgone00000001`
        expect(byTestId(document.body, gone)?.textContent).toContain('Not available')
        press(document.body as HTMLElement, `${gone}-remove`)
        press(document.body as HTMLElement, 'books-shortcuts-save')
        await waitFor(() =>
            expect(storedItems(shortcutsStore)).toEqual([[{ kind: 'report', ref: MY_SALES.id }]])
        )
    })

    it('closes the phone drawer when it opens', async () => {
        useWindowSizeStore.setState({ width: 390, height: 844 })
        useWorkspaceStore.setState({ isDrawerOpen: true })
        seedSidebar()
        const { container } = renderShell()
        await openDialog(container)

        expect(useWorkspaceStore.getState().isDrawerOpen).toBe(false)
        expect(rowIds(document.body)).toHaveLength(5)
    })
})
````

- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/customize-shortcuts.test.tsx`
Expected: FAIL: the import `../tinycld/books/components/sidebar/CustomizeShortcutsDialog` does not resolve.

- [ ] **Step 3: Write the store**

`tinycld/books/stores/shortcuts-dialog-store.ts`:

````ts
import { create } from '@tinycld/core/lib/store'
import type { Shortcut } from '../lib/sidebar-shortcuts'

interface ShortcutsDialogState {
    // The list the Customize shortcuts dialog edits; null while the dialog is closed.
    draft: Shortcut[] | null
    open: (list: readonly Shortcut[]) => void
    setDraft: (next: Shortcut[]) => void
    close: () => void
}

// Not persisted: a reload closes the dialog and drops the draft.
export const useShortcutsDialogStore = create<ShortcutsDialogState>()(set => ({
    draft: null,
    open: list => set({ draft: [...list] }),
    setDraft: next => set({ draft: next }),
    close: () => set({ draft: null }),
}))
````

- [ ] **Step 4: Move the focus rule to its own file**

`tinycld/books/hooks/useMovedFocus.ts`:

````ts
import { moveFocus } from '@tinycld/core/lib/move-focus'
import { type RefObject, useLayoutEffect } from 'react'
import type { PressableInstance } from 'react-native'

export type MoveDirection = 'up' | 'down'

// The Move button pressed last, so that it can take the focus back after the move.
export interface FocusRequest {
    id: string
    direction: MoveDirection
}

interface MovedFocus {
    id: string
    // The index the list draws the row at, and the row's place in the saved order.
    index: number
    place: number
    isFirst: boolean
    isLast: boolean
    focusRequest: RefObject<FocusRequest | null>
    upRef: RefObject<PressableInstance | null>
    downRef: RefObject<PressableInstance | null>
}

// Core SortableList draws its rows in cells keyed by index, so a moved row is drawn in
// another cell and the focus stays on the old cell's button, which now belongs to another
// row. Once the moved row is drawn at its new place, its pressed Move button takes the
// focus back, or its other Move button when the pressed one is now disabled at an end.
export function useMovedFocus({
    id,
    index,
    place,
    isFirst,
    isLast,
    focusRequest,
    upRef,
    downRef,
}: MovedFocus) {
    useLayoutEffect(() => {
        const request = focusRequest.current
        if (!request || request.id !== id || index !== place) return
        focusRequest.current = null
        const isUp = request.direction === 'up'
        const isPressedAtEnd = isUp ? isFirst : isLast
        const pressed = isUp ? upRef : downRef
        const other = isUp ? downRef : upRef
        const target = isPressedAtEnd ? other.current : pressed.current
        if (target) moveFocus(target)
    }, [id, index, place, isFirst, isLast, focusRequest, upRef, downRef])
}
````

Apply (the first file of the diff uses the shared hook; the second draws the dialog in the Books layout):

````diff
diff --git a/tinycld/books/components/dashboard/DashboardEditList.tsx b/tinycld/books/components/dashboard/DashboardEditList.tsx
index a1656d7c..50e1ea6d 100644
--- a/tinycld/books/components/dashboard/DashboardEditList.tsx
+++ b/tinycld/books/components/dashboard/DashboardEditList.tsx
@@ -1,12 +1,12 @@
 import { SortableDragHandle, SortableList } from '@tinycld/core/components/SortableList'
 import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
-import { moveFocus } from '@tinycld/core/lib/move-focus'
 import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
 import { ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
 import { Switch } from '@tinycld/core/ui/switch'
 import { ArrowDown, ArrowUp } from 'lucide-react-native'
-import { type RefObject, useLayoutEffect, useRef } from 'react'
+import { type RefObject, useRef } from 'react'
 import { type PressableInstance, Text, View } from 'react-native'
+import { type FocusRequest, type MoveDirection, useMovedFocus } from '../../hooks/useMovedFocus'
 import {
     type DashboardPrefs,
     moveWidget,
@@ -17,52 +17,6 @@ import {
 } from '../../lib/dashboard-prefs'
 import { DashboardIconButton } from './DashboardIconButton'
 
-type MoveDirection = 'up' | 'down'
-
-// The Move button pressed last, so that it can take the focus back after the move.
-interface FocusRequest {
-    id: WidgetId
-    direction: MoveDirection
-}
-
-interface MovedFocus {
-    id: WidgetId
-    index: number
-    place: number
-    isFirst: boolean
-    isLast: boolean
-    focusRequest: RefObject<FocusRequest | null>
-    upRef: RefObject<PressableInstance | null>
-    downRef: RefObject<PressableInstance | null>
-}
-
-// Core SortableList draws its rows in cells keyed by index, so a moved widget is drawn in
-// another cell and the focus stays on the old cell's button, which now belongs to another
-// widget. Once the moved row is drawn at its new place, its pressed Move button takes the
-// focus back, or its other Move button when the pressed one is now disabled at an end.
-function useMovedFocus({
-    id,
-    index,
-    place,
-    isFirst,
-    isLast,
-    focusRequest,
-    upRef,
-    downRef,
-}: MovedFocus) {
-    useLayoutEffect(() => {
-        const request = focusRequest.current
-        if (!request || request.id !== id || index !== place) return
-        focusRequest.current = null
-        const isUp = request.direction === 'up'
-        const isPressedAtEnd = isUp ? isFirst : isLast
-        const pressed = isUp ? upRef : downRef
-        const other = isUp ? downRef : upRef
-        const target = isPressedAtEnd ? other.current : pressed.current
-        if (target) moveFocus(target)
-    }, [id, index, place, isFirst, isLast, focusRequest, upRef, downRef])
-}
-
 function ShowLabel({ isVisible }: { isVisible: boolean }) {
     if (!isVisible) return null
     return <Text className="text-sm text-muted-foreground">Show</Text>
diff --git a/tinycld/books/screens/_layout.tsx b/tinycld/books/screens/_layout.tsx
index c7870da2..9c882a9e 100644
--- a/tinycld/books/screens/_layout.tsx
+++ b/tinycld/books/screens/_layout.tsx
@@ -1,12 +1,14 @@
 import { Stack } from 'expo-router'
 import { View } from 'react-native'
 import { NewFab } from '../components/NewFab'
+import { CustomizeShortcutsDialog } from '../components/sidebar/CustomizeShortcutsDialog'
 
 export default function BooksLayout() {
     return (
         <View className="flex-1">
             <Stack screenOptions={{ headerShown: false }} />
             <NewFab />
+            <CustomizeShortcutsDialog />
         </View>
     )
 }
````

- [ ] **Step 5: Let a caller know when a write is saved**

Apply to `tinycld/books/hooks/useSidebarShortcuts.ts`:

````diff
--- a/tinycld/books/hooks/useSidebarShortcuts.ts
+++ b/tinycld/books/hooks/useSidebarShortcuts.ts
@@ -88,11 +88,13 @@
     })
 
     const canWrite = isReady && !isError && userId !== ''
-    const save = (next: Shortcut[]) => {
-        if (canWrite) saveMutation.mutate(next)
+    // `onSuccess` runs after the write is saved; a refused write shows the toast and does
+    // not call it, so a caller that holds unsaved input (the Customize dialog) keeps it.
+    const save = (next: Shortcut[], onSuccess?: () => void) => {
+        if (canWrite) saveMutation.mutate(next, { onSuccess })
     }
-    const reset = () => {
-        if (canWrite) resetMutation.mutate()
+    const reset = (onSuccess?: () => void) => {
+        if (canWrite) resetMutation.mutate(undefined, { onSuccess })
     }
     const recovery: LiveRecovery =
         isError && query ? { queries: [query], sources: [shortcutsCollection] } : NO_RECOVERY
````

- [ ] **Step 6: Write the hook**

`tinycld/books/hooks/useCustomizeShortcuts.ts`:

````ts
import type { LucideIcon } from 'lucide-react-native'
import { shortcutRows } from '../lib/shortcut-rows'
import {
    DEFAULT_SHORTCUTS,
    moveShortcut,
    removeShortcut,
    type Shortcut,
    shortcutKey,
} from '../lib/sidebar-shortcuts'
import { useShortcutsDialogStore } from '../stores/shortcuts-dialog-store'
import { useShortcutLookup } from './useShortcutLookup'
import { useSidebarShortcuts } from './useSidebarShortcuts'

export interface CustomizeRow {
    key: string
    shortcut: Shortcut
    label: string
    // Null for a shortcut that has nothing to open now (a deleted report or account, a
    // form for a reader): the sidebar does not draw it, the dialog shows it so that the
    // user can remove it.
    icon: LucideIcon | null
}

const NO_DRAFT: Shortcut[] = []
const MISSING_LABEL = 'Not available'

function sameList(a: readonly Shortcut[], b: readonly Shortcut[]) {
    return a.length === b.length && a.every((item, i) => shortcutKey(item) === shortcutKey(b[i]))
}

/**
 * The Customize shortcuts dialog. It edits a draft: remove, move and reorder change only
 * the draft, `save` writes the draft one time, and `cancel` drops it. A change that was
 * computed from the saved list for each press would lose fast changes, because a write
 * that waits behind an earlier one is not in the saved list yet. A draft equal to the
 * defaults is saved as "no row" (`reset`), so later changes of the defaults reach the user.
 */
export function useCustomizeShortcuts() {
    const list = useSidebarShortcuts()
    const draft = useShortcutsDialogStore(state => state.draft)
    const openDraft = useShortcutsDialogStore(state => state.open)
    const setDraft = useShortcutsDialogStore(state => state.setDraft)
    const close = useShortcutsDialogStore(state => state.close)
    const items = draft ?? NO_DRAFT
    const lookup = useShortcutLookup(items)

    const drawn = new Map(shortcutRows(items, lookup.input).map(row => [row.key, row]))
    const rows: CustomizeRow[] = items.map(shortcut => {
        const key = shortcutKey(shortcut)
        const row = drawn.get(key)
        return { key, shortcut, label: row?.label ?? MISSING_LABEL, icon: row?.icon ?? null }
    })

    const canOpen = list.isReady && !list.isError
    const open = () => {
        if (canOpen) openDraft(list.shortcuts)
    }
    // The dialog closes only after the write is saved: a refused write (the hook shows the
    // toast) leaves the dialog open with the draft, so the user's changes are not lost.
    const canSave = canOpen && !list.isSaving
    const save = () => {
        if (!draft || !canSave) return
        const isDefault = sameList(draft, DEFAULT_SHORTCUTS)
        if (isDefault && list.isCustomized) list.reset(close)
        else if (!isDefault && !sameList(draft, list.shortcuts)) list.save(draft, close)
        else close()
    }
    // A write in progress closes the dialog when it is saved; a Cancel then would let that
    // close hit a dialog the user opened again.
    const cancel = () => {
        if (!list.isSaving) close()
    }

    return {
        isOpen: draft !== null,
        canOpen,
        open,
        draft: items,
        rows,
        isDefault: sameList(items, DEFAULT_SHORTCUTS),
        isEmpty: items.length === 0,
        canSave,
        remove: (key: string) => setDraft(removeShortcut(items, key)),
        move: (key: string, by: -1 | 1) => setDraft(moveShortcut(items, key, by)),
        reorder: (next: CustomizeRow[]) => setDraft(next.map(row => row.shortcut)),
        resetToDefaults: () => setDraft([...DEFAULT_SHORTCUTS]),
        cancel,
        save,
    }
}
````

- [ ] **Step 7: Write the dialog**

`tinycld/books/components/sidebar/CustomizeShortcutsDialog.tsx`:

````tsx
import { SortableDragHandle, SortableList } from '@tinycld/core/components/SortableList'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { ArrowDown, ArrowUp, type LucideIcon, X } from 'lucide-react-native'
import { type RefObject, useRef } from 'react'
import { Pressable, type PressableInstance, Text, View } from 'react-native'
import { type CustomizeRow, useCustomizeShortcuts } from '../../hooks/useCustomizeShortcuts'
import { type FocusRequest, type MoveDirection, useMovedFocus } from '../../hooks/useMovedFocus'
import { shortcutTestId } from '../../lib/shortcut-rows'
import { DashboardIconButton } from '../dashboard/DashboardIconButton'

type Customize = ReturnType<typeof useCustomizeShortcuts>

function RowIcon({ icon: Icon }: { icon: LucideIcon | null }) {
    const color = useThemeColor('muted-foreground')
    if (!Icon) return null
    return <Icon size={16} color={color} />
}

interface DialogRowProps {
    row: CustomizeRow
    index: number
    dialog: Customize
    focusRequest: RefObject<FocusRequest | null>
}

function DialogRow({ row, index, dialog, focusRequest }: DialogRowProps) {
    const upRef = useRef<PressableInstance>(null)
    const downRef = useRef<PressableInstance>(null)
    // The place comes from the draft, not from the list's render index: the sortable list
    // draws a new order a render later (and, on native, keeps its cells after a drop).
    const place = dialog.rows.findIndex(candidate => candidate.key === row.key)
    const isFirst = place === 0
    const isLast = place === dialog.rows.length - 1
    useMovedFocus({ id: row.key, index, place, isFirst, isLast, focusRequest, upRef, downRef })
    const id = editRowTestId(row)
    const labelClass = row.icon
        ? 'flex-1 text-base text-foreground'
        : 'flex-1 text-base text-muted-foreground'
    const move = (direction: MoveDirection) => {
        focusRequest.current = { id: row.key, direction }
        dialog.move(row.key, direction === 'up' ? -1 : 1)
    }
    return (
        <View
            testID={id}
            className="mb-2 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
        >
            <SortableDragHandle testID={`${id}-handle`} />
            <RowIcon icon={row.icon} />
            <Text className={labelClass} numberOfLines={1}>
                {row.label}
            </Text>
            <DashboardIconButton
                buttonRef={upRef}
                testID={`${id}-up`}
                label={`Move up: ${row.label}`}
                icon={ArrowUp}
                iconSize={16}
                isDisabled={isFirst}
                onPress={() => move('up')}
            />
            <DashboardIconButton
                buttonRef={downRef}
                testID={`${id}-down`}
                label={`Move down: ${row.label}`}
                icon={ArrowDown}
                iconSize={16}
                isDisabled={isLast}
                onPress={() => move('down')}
            />
            <DashboardIconButton
                testID={`${id}-remove`}
                label={`Remove: ${row.label}`}
                icon={X}
                iconSize={16}
                isDisabled={false}
                onPress={() => dialog.remove(row.key)}
            />
        </View>
    )
}

// `books-shortcuts-row-<kind>-<ref>`: not under the `books-shortcut-` prefix of the
// sidebar's own rows, so a count of the sidebar's shortcuts never includes the dialog's.
export function editRowTestId(row: CustomizeRow) {
    return shortcutTestId(row.shortcut).replace('books-shortcut-', 'books-shortcuts-row-')
}

function EmptyDraft({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="books-shortcuts-dialog-empty" className="text-sm text-muted-foreground">
            No shortcuts. The sidebar shows none.
        </Text>
    )
}

function keyOf(row: CustomizeRow) {
    return row.key
}

// Customize shortcuts (QuickBooks' "Customize Shortcuts"): the user's list with Remove,
// Move up, Move down and drag. Core Dialog draws a sheet on a phone. Nothing is written
// until Save.
export function CustomizeShortcutsDialog() {
    const dialog = useCustomizeShortcuts()
    const focusRequest = useRef<FocusRequest | null>(null)
    const resetStyle = { minHeight: 44, opacity: dialog.isDefault ? 0.4 : 1 }
    const renderItem = ({ item, index }: { item: CustomizeRow; index: number }) => (
        <DialogRow row={item} index={index} dialog={dialog} focusRequest={focusRequest} />
    )
    return (
        <Dialog
            isOpen={dialog.isOpen}
            onClose={dialog.cancel}
            title="Customize shortcuts"
            description="Drag a row, or use the arrows, to change the order."
            size="lg"
            testID="books-shortcuts-dialog"
        >
            <Dialog.Body>
                <SortableList
                    data={dialog.rows}
                    keyExtractor={keyOf}
                    onReorder={dialog.reorder}
                    renderItem={renderItem}
                />
                <EmptyDraft isVisible={dialog.isEmpty} />
                <Pressable
                    testID="books-shortcuts-reset"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: dialog.isDefault }}
                    disabled={dialog.isDefault}
                    onPress={dialog.resetToDefaults}
                    className="self-start justify-center"
                    style={resetStyle}
                >
                    <Text className="text-sm font-medium text-primary">Reset to defaults</Text>
                </Pressable>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={dialog.cancel} />
                <Dialog.ActionButton
                    label="Save"
                    onPress={dialog.save}
                    isDisabled={!dialog.canSave}
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID="books-shortcuts-save"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
````

- [ ] **Step 8: Add the pencil to the Shortcuts heading**

Apply to `tinycld/books/components/sidebar/ShortcutsSection.tsx`:

````diff
--- a/tinycld/books/components/sidebar/ShortcutsSection.tsx
+++ b/tinycld/books/components/sidebar/ShortcutsSection.tsx
@@ -1,6 +1,10 @@
 import { SidebarHeading, SidebarItem } from '@tinycld/core/components/sidebar-primitives'
+import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
+import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
 import { router } from 'expo-router'
+import { Pencil } from 'lucide-react-native'
 import { Pressable, Text, View } from 'react-native'
+import { useCustomizeShortcuts } from '../../hooks/useCustomizeShortcuts'
 import { useShortcutRows } from '../../hooks/useShortcutRows'
 import type { ShortcutRow } from '../../lib/shortcut-rows'
 
@@ -33,6 +37,33 @@
     )
 }
 
+// Opens the Customize shortcuts dialog. Hidden until the list is read: the dialog edits
+// a copy of the list, and there is none to copy before that.
+function CustomizeButton() {
+    const { canOpen, open } = useCustomizeShortcuts()
+    const setDrawerOpen = useWorkspaceStore(state => state.setDrawerOpen)
+    const color = useThemeColor('muted-foreground')
+    if (!canOpen) return null
+    // On a phone the sidebar is in the drawer, which would stay over the page behind the
+    // sheet; the dialog itself is drawn by the Books layout, so it stays.
+    const onPress = () => {
+        setDrawerOpen(false)
+        open()
+    }
+    return (
+        <Pressable
+            testID="books-shortcuts-customize"
+            accessibilityRole="button"
+            accessibilityLabel="Customize shortcuts"
+            onPress={onPress}
+            hitSlop={12}
+            className="items-center justify-center pt-3"
+        >
+            <Pencil size={14} color={color} />
+        </Pressable>
+    )
+}
+
 // A shortcut never shows the active highlight: the fixed navigation under it marks where
 // the user is, and a second mark for the same screen would be noise.
 function renderRow(row: ShortcutRow) {
@@ -54,7 +85,7 @@
     const items = rows.map(renderRow)
     return (
         <>
-            <SidebarHeading>Shortcuts</SidebarHeading>
+            <SidebarHeading action={<CustomizeButton />}>Shortcuts</SidebarHeading>
             {items}
             <ShortcutsNote isVisible={isEmpty} text="No shortcuts" />
             <ShortcutsError isVisible={isError} onRetry={retry} />
````

- [ ] **Step 9: Run the tests, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/customize-shortcuts.test.tsx tests/useSidebarShortcuts.test.tsx tests/shortcuts-section.test.tsx tests/new-section.test.tsx tests/books-sidebar-render.test.tsx && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run dashboard && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/components/sidebar tinycld/books/components/dashboard/DashboardEditList.tsx tinycld/books/hooks/useCustomizeShortcuts.ts tinycld/books/hooks/useSidebarShortcuts.ts tinycld/books/hooks/useMovedFocus.ts tinycld/books/stores/shortcuts-dialog-store.ts tinycld/books/screens/_layout.tsx tests/customize-shortcuts.test.tsx && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: PASS (`customize-shortcuts` 10 tests; part 1's `tests/useSidebarShortcuts.test.tsx` passes unchanged; every dashboard test file still passes); biome and the typecheck print no error.

- [ ] **Step 10: Run the dashboard edit e2e (the moved focus rule) and the drawer e2e**

Run: `cd /Users/nas/tmp/tinycld/books && lsof -iTCP -sTCP:LISTEN -nP | grep -qE ':(7230|7231) ' && { echo PORTS-BUSY; exit 1; }; E2E_PORT=7230 E2E_PORT_2=7231 E2E_IMAP_PORT=1230 E2E_IMAP_PORT_2=1231 pnpm exec tinycld-pkg test:e2e books/tests/e2e/dashboard.spec.ts books/tests/e2e/mobile-drawer.spec.ts`
Expected: all pass (`dashboard.spec.ts` presses the dashboard's Move buttons and checks the focus after a move; the drawer spec opens the Books drawer on a phone). `PORTS-BUSY` or a run longer than the runner allows: report `NEEDS-RUN` with this command.

- [ ] **Step 11: Commit**

```bash
git add tinycld/books/stores/shortcuts-dialog-store.ts tinycld/books/hooks/useMovedFocus.ts tinycld/books/hooks/useSidebarShortcuts.ts tinycld/books/hooks/useCustomizeShortcuts.ts tinycld/books/components/sidebar/CustomizeShortcutsDialog.tsx tinycld/books/components/sidebar/ShortcutsSection.tsx tinycld/books/components/dashboard/DashboardEditList.tsx tinycld/books/screens/_layout.tsx tests/customize-shortcuts.test.tsx
git commit -m "books: Customize shortcuts dialog"
```

---

### Task 11: Customize shortcuts dialog: Add shortcut

**Files:**
- Create: `tinycld/books/lib/shortcut-choices.ts`
- Create: `tinycld/books/hooks/useShortcutChoices.ts`
- Create: `tinycld/books/components/sidebar/ShortcutPicker.tsx`
- Modify: `tinycld/books/hooks/useCustomizeShortcuts.ts`
- Modify: `tinycld/books/components/sidebar/CustomizeShortcutsDialog.tsx`
- Create: `tests/shortcut-choices.test.ts`
- Modify: `tests/customize-shortcuts.test.tsx`

**Interfaces:**
- Consumes: part 1 `staticTargets(canWrite)`, `ShortcutTarget`, `canAddShortcut`, `hasShortcut`, `addShortcut`, `MAX_SHORTCUTS`; task 8 `useBooksReports`, `ShortcutReport`; task 10 `useCustomizeShortcuts`; existing `useAccountOptions(): { options: { value; label; indent }[]; isReady; isError; recovery }`, `SearchPicker`, `useSearchPicker` (`components/SearchPicker.tsx`).
- Produces: `ShortcutChoice { id; label; group; indent?; shortcut }` (`id` is `shortcutKey`), `shortcutChoices(list, { targets, reports, accounts })`, `searchChoices(choices, term)`, `reportShortcut(report)`; `useShortcutChoices(list, term): { choices; isFull; isLoading; isError; retry() }`; `ShortcutPicker({ list, onAdd })`; `add(shortcut)` on `useCustomizeShortcuts()`; the test ids `books-shortcuts-add`, `books-shortcuts-add-search`, `books-shortcuts-add-option-<kind>:<ref>`, `books-shortcuts-full`.

A report shortcut keeps the shipped key of a shipped report (it stays the same when the row is made again) and the row id of a saved one. The pick itself is not tested here: the menu of `SearchPicker` does not open in the unit-test DOM. The test covers what the picker offers and what a pick does to the draft; part 3's e2e spec picks one of each kind.

- [ ] **Step 1: Write the failing tests**

`tests/shortcut-choices.test.ts`:

````ts
import { describe, expect, it } from 'vitest'
import { staticTargets } from '../tinycld/books/lib/shortcut-catalog'
import {
    reportShortcut,
    type ShortcutChoicesInput,
    searchChoices,
    shortcutChoices,
} from '../tinycld/books/lib/shortcut-choices'
import { MAX_SHORTCUTS, type Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'

const SHIPPED = {
    id: 'rptprofitloss01',
    title: 'Profit and Loss',
    shippedKey: 'books.profit_and_loss',
}
const SAVED = { id: 'rptmysales00001', title: 'My sales by month', shippedKey: '' }
const CHECKING = { value: 'acct_checking', label: '1000 Checking', indent: 0 }
const PETTY = { value: 'acct_petty', label: '1010 Petty cash', indent: 1 }

function input(canWrite = true): ShortcutChoicesInput {
    return {
        targets: staticTargets(canWrite),
        reports: [SHIPPED, SAVED],
        accounts: [CHECKING, PETTY],
    }
}

function ids(list: readonly Shortcut[], canWrite = true) {
    return shortcutChoices(list, input(canWrite)).map(choice => choice.id)
}

describe('shortcutChoices', () => {
    it('offers the screens, the forms, the reports and the registers, in that order', () => {
        const choices = shortcutChoices([], input())
        const groups = choices.map(choice => choice.group)

        expect([...new Set(groups)]).toEqual(['Screens', 'New', 'Reports', 'Registers'])
        // Options of one group are consecutive (SearchPicker draws one heading for each run).
        expect(groups).toEqual([...groups].sort((a, b) => groups.indexOf(a) - groups.indexOf(b)))
        expect(ids([])).toContain('screen:customers')
        expect(ids([])).toContain('new:invoice')
    })

    it('keeps a shipped report by its shipped key and a saved report by its row id', () => {
        expect(reportShortcut(SHIPPED)).toEqual({ kind: 'report', ref: 'books.profit_and_loss' })
        expect(reportShortcut(SAVED)).toEqual({ kind: 'report', ref: 'rptmysales00001' })
        expect(ids([])).toContain('report:books.profit_and_loss')
        expect(ids([])).toContain('report:rptmysales00001')
    })

    it('offers a register for each account, with the chart indent', () => {
        const petty = shortcutChoices([], input()).find(
            choice => choice.id === 'register:acct_petty'
        )

        expect(petty).toMatchObject({
            label: '1010 Petty cash',
            group: 'Registers',
            indent: 1,
            shortcut: { kind: 'register', ref: 'acct_petty' },
        })
    })

    it('leaves out a shortcut that is in the list', () => {
        const list: Shortcut[] = [
            { kind: 'screen', ref: 'customers' },
            { kind: 'report', ref: 'books.profit_and_loss' },
            { kind: 'register', ref: 'acct_checking' },
        ]

        expect(ids(list)).not.toContain('screen:customers')
        expect(ids(list)).not.toContain('report:books.profit_and_loss')
        expect(ids(list)).not.toContain('register:acct_checking')
        expect(ids(list)).toContain('screen:vendors')
        expect(ids(list)).toContain('register:acct_petty')
    })

    it('offers no form to a reader', () => {
        const groups = shortcutChoices([], input(false)).map(choice => choice.group)

        expect(groups).not.toContain('New')
        expect(groups).toContain('Screens')
    })

    it('offers nothing when the list is full', () => {
        const full: Shortcut[] = Array.from({ length: MAX_SHORTCUTS }, (_, i) => ({
            kind: 'register',
            ref: `acct_${i}`,
        }))

        expect(shortcutChoices(full, input())).toEqual([])
    })
})

describe('searchChoices', () => {
    const all = shortcutChoices([], input())

    it('returns every choice for an empty search', () => {
        expect(searchChoices(all, '  ')).toEqual(all)
    })

    it('matches every word in any letter case and drops the indent', () => {
        const found = searchChoices(all, 'CASH petty')

        expect(found.map(choice => choice.id)).toEqual(['register:acct_petty'])
        expect(found[0].indent).toBeUndefined()
    })

    it('returns nothing when no label matches', () => {
        expect(searchChoices(all, 'zebra')).toEqual([])
    })
})
````

Apply to `tests/customize-shortcuts.test.tsx`:

````diff
--- a/tests/customize-shortcuts.test.tsx
+++ b/tests/customize-shortcuts.test.tsx
@@ -1,11 +1,12 @@
 // @vitest-environment happy-dom
-import { fireEvent, render, waitFor } from '@testing-library/react'
+import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
 import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
 import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
 import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
 import { beforeEach, describe, expect, it, vi } from 'vitest'
 import { CustomizeShortcutsDialog } from '../tinycld/books/components/sidebar/CustomizeShortcutsDialog'
-import type { Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'
+import { useCustomizeShortcuts } from '../tinycld/books/hooks/useCustomizeShortcuts'
+import { MAX_SHORTCUTS, type Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'
 import BooksSidebar from '../tinycld/books/sidebar'
 import { useShortcutsDialogStore } from '../tinycld/books/stores/shortcuts-dialog-store'
 import { refuseNthWrite } from './accounts-form-harness'
@@ -30,6 +31,7 @@
 const CUSTOMERS: Shortcut = { kind: 'screen', ref: 'customers' }
 const VENDORS: Shortcut = { kind: 'screen', ref: 'vendors' }
 const INVOICE: Shortcut = { kind: 'new', ref: 'invoice' }
+const BILL: Shortcut = { kind: 'new', ref: 'bill' }
 const GONE_REPORT: Shortcut = { kind: 'report', ref: 'rptgone00000001' }
 
 const ROW = 'books-shortcuts-row-'
@@ -226,8 +228,40 @@
         await waitFor(() =>
             expect(storedItems(shortcutsStore)).toEqual([[{ kind: 'report', ref: MY_SALES.id }]])
         )
+    })
+
+    // The picker's menu does not open in the unit-test DOM; the pick itself is covered by
+    // tests/e2e/sidebar-shortcuts.spec.ts. Here: what a pick does to the draft.
+    it('adds a picked shortcut to the end of the draft, and saves it', async () => {
+        const { shortcutsStore } = seedSidebar({ shortcuts: [CUSTOMERS] })
+        const { result } = renderHook(() => useCustomizeShortcuts(), { wrapper: SidebarProviders })
+        await waitFor(() => expect(result.current.canOpen).toBe(true))
+
+        act(() => result.current.open())
+        act(() => result.current.add(BILL))
+        act(() => result.current.add(BILL))
+        expect(result.current.rows.map(row => row.label)).toEqual(['Customers', 'New bill'])
+        expect(storedItems(shortcutsStore)).toEqual([[CUSTOMERS]])
+
+        act(() => result.current.save())
+        await waitFor(() => expect(storedItems(shortcutsStore)).toEqual([[CUSTOMERS, BILL]]))
     })
 
+    it('shows the Add shortcut picker, and the full note at 30 shortcuts', async () => {
+        const full: Shortcut[] = Array.from({ length: MAX_SHORTCUTS }, (_, i) => ({
+            kind: 'register',
+            ref: `acct_${i}`,
+        }))
+        seedSidebar({ shortcuts: [CUSTOMERS] })
+        const { container } = renderShell()
+        await openDialog(container)
+        expect(byTestId(document.body, 'books-shortcuts-add')).not.toBeNull()
+        expect(byTestId(document.body, 'books-shortcuts-full')).toBeNull()
+
+        act(() => useShortcutsDialogStore.getState().setDraft(full))
+        expect(byTestId(document.body, 'books-shortcuts-full')).not.toBeNull()
+    })
+
     it('closes the phone drawer when it opens', async () => {
         useWindowSizeStore.setState({ width: 390, height: 844 })
         useWorkspaceStore.setState({ isDrawerOpen: true })
````

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/shortcut-choices.test.ts tests/customize-shortcuts.test.tsx`
Expected: FAIL: `../tinycld/books/lib/shortcut-choices` does not resolve; in `customize-shortcuts`, `result.current.add` is not a function and there is no `books-shortcuts-add`.

- [ ] **Step 3: Write the choices**

`tinycld/books/lib/shortcut-choices.ts`:

````ts
// What the Customize shortcuts dialog offers under "Add shortcut": every screen, form,
// Books report and account register the user can open that is not in the list yet.
import type { ShortcutTarget } from './shortcut-catalog'
import type { ShortcutReport } from './shortcut-rows'
import { canAddShortcut, hasShortcut, type Shortcut, shortcutKey } from './sidebar-shortcuts'

// The shape of a SearchPicker option, with the shortcut the option adds. `id` is the
// shortcut's key (`<kind>:<ref>`).
export interface ShortcutChoice {
    id: string
    label: string
    group: string
    indent?: number
    shortcut: Shortcut
}

export interface ChoiceAccount {
    value: string
    label: string
    indent: number
}

export interface ShortcutChoicesInput {
    // staticTargets(canWrite): a reader's list has no form.
    targets: readonly ShortcutTarget[]
    reports: readonly ShortcutReport[]
    // The active accounts in chart order (useAccountOptions).
    accounts: readonly ChoiceAccount[]
}

const GROUP_OF_KIND = { screen: 'Screens', new: 'New', report: 'Reports', register: 'Registers' }

function choice(shortcut: Shortcut, label: string, indent?: number): ShortcutChoice {
    return {
        id: shortcutKey(shortcut),
        label,
        group: GROUP_OF_KIND[shortcut.kind],
        indent,
        shortcut,
    }
}

// A shipped report is kept by its shipped key, which stays the same when the report's row
// is made again; a saved report has only its row id.
export function reportShortcut(report: ShortcutReport): Shortcut {
    return { kind: 'report', ref: report.shippedKey === '' ? report.id : report.shippedKey }
}

// In the order of the groups: screens, forms, reports, registers. Empty when the list is
// full. The options of one group are consecutive, as SearchPicker needs.
export function shortcutChoices(
    list: readonly Shortcut[],
    input: ShortcutChoicesInput
): ShortcutChoice[] {
    if (!canAddShortcut(list)) return []
    const all = [
        ...input.targets
            .filter(target => target.shortcut.kind === 'screen')
            .map(target => choice(target.shortcut, target.label)),
        ...input.targets
            .filter(target => target.shortcut.kind === 'new')
            .map(target => choice(target.shortcut, target.label)),
        ...input.reports.map(report => choice(reportShortcut(report), report.title)),
        ...input.accounts.map(account =>
            choice({ kind: 'register', ref: account.value }, account.label, account.indent)
        ),
    ]
    return all.filter(candidate => !hasShortcut(list, candidate.shortcut))
}

// The choices whose label holds every word of the search, in any letter case. A search
// drops the chart's indent: a child without its parent would hang.
export function searchChoices(choices: readonly ShortcutChoice[], term: string): ShortcutChoice[] {
    const words = term.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return [...choices]
    return choices
        .filter(candidate => {
            const label = candidate.label.toLowerCase()
            return words.every(word => label.includes(word))
        })
        .map(candidate => ({ ...candidate, indent: undefined }))
}
````

`tinycld/books/hooks/useShortcutChoices.ts`:

````ts
import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { mergeRecoveries } from '../lib/live-recovery'
import { staticTargets } from '../lib/shortcut-catalog'
import { searchChoices, shortcutChoices } from '../lib/shortcut-choices'
import { canAddShortcut, type Shortcut } from '../lib/sidebar-shortcuts'
import { useAccountOptions } from './useAccountOptions'
import { useBooksAccess } from './useBooksAccess'
import { useBooksReports } from './useBooksReports'

/**
 * The "Add shortcut" choices of the Customize shortcuts dialog for the draft `list` and
 * the search `term`. `isFull` is true when the list holds the most it can (no choice
 * then). While a read is loading or failed, the choices of the kinds that did load are
 * still returned; the picker shows its loading or error row in place of the options.
 */
export function useShortcutChoices(list: readonly Shortcut[], term: string) {
    const { canWrite } = useBooksAccess()
    const reports = useBooksReports()
    const accounts = useAccountOptions()
    const all = shortcutChoices(list, {
        targets: staticTargets(canWrite),
        reports: reports.reports,
        accounts: accounts.options,
    })
    const recovery = mergeRecoveries([reports.recovery, accounts.recovery])
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.sidebar.shortcuts', err),
        })
    }
    const isError = reports.isError || accounts.isError
    return {
        choices: searchChoices(all, term),
        isFull: !canAddShortcut(list),
        isLoading: !isError && !(reports.isReady && accounts.isReady),
        isError,
        retry,
    }
}
````

- [ ] **Step 4: Write the picker**

`tinycld/books/components/sidebar/ShortcutPicker.tsx`:

````tsx
import { Text, View } from 'react-native'
import { useShortcutChoices } from '../../hooks/useShortcutChoices'
import { MAX_SHORTCUTS, type Shortcut } from '../../lib/sidebar-shortcuts'
import { SearchPicker, useSearchPicker } from '../SearchPicker'

interface ShortcutPickerProps {
    // The dialog's draft: a shortcut in it is not offered again.
    list: readonly Shortcut[]
    onAdd: (shortcut: Shortcut) => void
}

function FullNote({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="books-shortcuts-full" className="text-sm text-muted-foreground">
            {`The list holds ${MAX_SHORTCUTS} shortcuts, the most it can. Remove one to add another.`}
        </Text>
    )
}

// "Add shortcut" of the Customize shortcuts dialog: one searchable list of the screens,
// forms, Books reports and account registers that are not in the list yet.
export function ShortcutPicker({ list, onAdd }: ShortcutPickerProps) {
    const picker = useSearchPicker()
    const { choices, isFull, isLoading, isError, retry } = useShortcutChoices(
        list,
        picker.debouncedTerm
    )
    const onChange = (id: string) => {
        const picked = choices.find(candidate => candidate.id === id)
        if (picked) onAdd(picked.shortcut)
    }
    return (
        <View className="gap-2">
            <SearchPicker
                picker={picker}
                title="Add shortcut"
                triggerLabel="Add shortcut"
                triggerAccessibilityLabel="Add shortcut"
                triggerTestId="books-shortcuts-add"
                isPlaceholder
                disabled={isFull}
                searchPlaceholder="Search screens, forms, reports and accounts"
                searchTestId="books-shortcuts-add-search"
                options={choices}
                optionTestIdPrefix="books-shortcuts-add-option"
                value=""
                onChange={onChange}
                isLoading={isLoading}
                loadFailed={isError}
                onRetry={retry}
                emptyText="Nothing more to add"
            />
            <FullNote isVisible={isFull} />
        </View>
    )
}
````

- [ ] **Step 5: Add `add` to the hook and the picker to the dialog**

````diff
--- a/tinycld/books/hooks/useCustomizeShortcuts.ts
+++ b/tinycld/books/hooks/useCustomizeShortcuts.ts
@@ -1,6 +1,7 @@
 import type { LucideIcon } from 'lucide-react-native'
 import { shortcutRows } from '../lib/shortcut-rows'
 import {
+    addShortcut,
     DEFAULT_SHORTCUTS,
     moveShortcut,
     removeShortcut,
@@ -80,6 +81,7 @@
         isDefault: sameList(items, DEFAULT_SHORTCUTS),
         isEmpty: items.length === 0,
         canSave,
+        add: (shortcut: Shortcut) => setDraft(addShortcut(items, shortcut)),
         remove: (key: string) => setDraft(removeShortcut(items, key)),
         move: (key: string, by: -1 | 1) => setDraft(moveShortcut(items, key, by)),
         reorder: (next: CustomizeRow[]) => setDraft(next.map(row => row.shortcut)),
````

````diff
--- a/tinycld/books/components/sidebar/CustomizeShortcutsDialog.tsx
+++ b/tinycld/books/components/sidebar/CustomizeShortcutsDialog.tsx
@@ -8,6 +8,7 @@
 import { type FocusRequest, type MoveDirection, useMovedFocus } from '../../hooks/useMovedFocus'
 import { shortcutTestId } from '../../lib/shortcut-rows'
 import { DashboardIconButton } from '../dashboard/DashboardIconButton'
+import { ShortcutPicker } from './ShortcutPicker'
 
 type Customize = ReturnType<typeof useCustomizeShortcuts>
 
@@ -120,6 +121,7 @@
             testID="books-shortcuts-dialog"
         >
             <Dialog.Body>
+                <ShortcutPicker list={dialog.draft} onAdd={dialog.add} />
                 <SortableList
                     data={dialog.rows}
                     keyExtractor={keyOf}
````

- [ ] **Step 6: Run the tests, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/shortcut-choices.test.ts tests/customize-shortcuts.test.tsx && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/lib/shortcut-choices.ts tinycld/books/hooks/useShortcutChoices.ts tinycld/books/hooks/useCustomizeShortcuts.ts tinycld/books/components/sidebar tests/shortcut-choices.test.ts tests/customize-shortcuts.test.tsx && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: PASS (`shortcut-choices` 9 tests, `customize-shortcuts` 12 tests); biome and the typecheck print no error.

- [ ] **Step 7: Commit**

```bash
git add tinycld/books/lib/shortcut-choices.ts tinycld/books/hooks/useShortcutChoices.ts tinycld/books/hooks/useCustomizeShortcuts.ts tinycld/books/components/sidebar/ShortcutPicker.tsx tinycld/books/components/sidebar/CustomizeShortcutsDialog.tsx tests/shortcut-choices.test.ts tests/customize-shortcuts.test.tsx
git commit -m "books: Add shortcut in the Customize shortcuts dialog"
```

---

### Task 12 (CORE): optional base route of the report view

**Repo:** `/Users/nas/tmp/tinycld/books/tinycld`, branch `books/p1-sidebar-shortcuts` (make it from `main` when it does not exist). Paths in this task and in task 12b are from that repo's root. Tasks 12 and 12b are one core PR, opened and merged before the Books PR.

**Files:**
- Create: `core/reports/lib/report-base.ts`
- Modify: `core/reports/lib/drill.ts`
- Modify: `core/reports/hooks/useRowLinks.ts`
- Modify: `core/reports/hooks/useDrillPanel.ts`
- Modify: `core/reports/hooks/useBackToReports.ts`
- Modify: `core/reports/hooks/useReportBuilder.ts`
- Modify: `core/reports/screens/ReportScreen.tsx`
- Modify: `core/reports/lib/__tests__/drill.test.ts`
- Create: `core/reports/hooks/__tests__/useBackToReports.test.tsx`
- Modify: `docs/packages.md`

**Interfaces:**
- Produces: `ReportScreen({ reportId, basePath? })`, `basePath?: string`, default `'reports'`; `REPORTS_BASE`, `ReportBaseProvider({ base, children })`, `useReportBase(): string` (`@tinycld/core/reports/lib/report-base`); `drillHref(column, row, sourceId, base = REPORTS_BASE)`; `fullReportHref(reportId, defs, options, sourceId, base = REPORTS_BASE)`.
- Contract of `basePath` (a route without the org prefix): a drill opens `<basePath>/<id>?...`; Back from a drilled report with no history opens `<basePath>/<fromId>`; Back with no history and no source opens `<basePath>`; a copy saved with Save as opens `<basePath>/<newId>` (`useReportBuilder`). The host owns both routes. Edit is `router.setParams({ edit: '1' })` on the current route, so the builder runs on the host's route and the host must keep `ReportScreen` mounted (unsaved builder input is lost when it unmounts). The New report screen runs outside the provider and stays on core's routes, as does the copied share link (`view-url.ts`).

No behavior changes for a caller that passes no `basePath`: core's own route `app/a/(app)/reports/[id].tsx` is not changed.

- [ ] **Step 1: Write the failing tests**

`core/reports/hooks/__tests__/useBackToReports.test.tsx`:

````tsx
// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportBaseProvider, useReportBase } from '../../lib/report-base'
import { useBackToReports } from '../useBackToReports'

// A report view drawn on a host's own route goes back to the host's list, not to
// core's hub. The host here is fictional: core names no package.

function zooBase({ children }: { children: ReactNode }) {
    return <ReportBaseProvider base="zoo/reports">{children}</ReportBaseProvider>
}

beforeEach(() => {
    vi.mocked(router.replace).mockClear()
    vi.mocked(router.back).mockClear()
})
afterEach(cleanup)

describe('useReportBase', () => {
    it("is core's own route with no host", () => {
        expect(renderHook(() => useReportBase()).result.current).toBe('reports')
    })

    it('is the base of the host inside its provider', () => {
        const { result } = renderHook(() => useReportBase(), { wrapper: zooBase })
        expect(result.current).toBe('zoo/reports')
    })
})

describe('useBackToReports', () => {
    it('opens the hub when there is no history and no host', () => {
        vi.mocked(router.canGoBack).mockReturnValue(false)
        renderHook(() => useBackToReports()).result.current()
        expect(router.replace).toHaveBeenCalledWith('/a/reports')
    })

    it("opens the host's list when there is no history", () => {
        vi.mocked(router.canGoBack).mockReturnValue(false)
        renderHook(() => useBackToReports(), { wrapper: zooBase }).result.current()
        expect(router.replace).toHaveBeenCalledWith('/a/zoo/reports')
    })

    it('goes back in the history when there is one', () => {
        vi.mocked(router.canGoBack).mockReturnValue(true)
        renderHook(() => useBackToReports(), { wrapper: zooBase }).result.current()
        expect(router.back).toHaveBeenCalledTimes(1)
        expect(router.replace).not.toHaveBeenCalled()
    })
})
````

Apply to `core/reports/lib/__tests__/drill.test.ts`:

````diff
diff --git a/core/reports/lib/__tests__/drill.test.ts b/core/reports/lib/__tests__/drill.test.ts
index 56bf47da..39800a4d 100644
--- a/core/reports/lib/__tests__/drill.test.ts
+++ b/core/reports/lib/__tests__/drill.test.ts
@@ -98,6 +98,12 @@ describe('drillHref', () => {
         expect(Object.keys(search).sort()).toEqual(['from', 'p-status'])
     })
 
+    it('builds the path under the base of the host that draws the report', () => {
+        const href = drillHref(COLUMN, rowWith({ status: 'paid' }), 'r1', 'zoo/reports')
+        expect(href?.startsWith('zoo/reports/r2?')).toBe(true)
+        expect(searchOf(href ?? '')).toEqual({ from: 'r1', 'p-status': 'paid' })
+    })
+
     it('gives no href without a @drill cell or a column drill', () => {
         expect(drillHref(COLUMN, rowWith(undefined), 'r1')).toBeNull()
         expect(
@@ -120,6 +126,8 @@ describe('fullReportHref', () => {
         )
         const href = fullReportHref('r2', TARGET, options, 'r1')
         expect(href.startsWith('reports/r2?')).toBe(true)
+        const hosted = fullReportHref('r2', TARGET, options, 'r1', 'zoo/reports')
+        expect(hosted).toBe(href.replace('reports/r2?', 'zoo/reports/r2?'))
         const search = searchOf(href)
         expect(search).toEqual({
             'p-period': '2026-03-01..2026-03-31',
````

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run core/reports/lib/__tests__/drill.test.ts core/reports/hooks/__tests__/useBackToReports.test.tsx`
Expected: FAIL: `../../lib/report-base` does not resolve; in `drill.test.ts` the two new expectations fail (the path starts with `reports/`).

- [ ] **Step 3: Write the base context**

`core/reports/lib/report-base.ts`:

````ts
import { createContext, createElement, type ReactNode, use } from 'react'

/** The route the report view lives under when its host names no other: core's own. */
export const REPORTS_BASE = 'reports'

// Scoped to one mounted report view, so two views on two routes never share a base.
const ReportBase = createContext<string>(REPORTS_BASE)

/** Sets the route a report view's drills and Back links are built under. */
export function ReportBaseProvider({ base, children }: { base: string; children: ReactNode }) {
    return createElement(ReportBase.Provider, { value: base }, children)
}

/**
 * The route the report view is drawn under, without the org prefix: `<base>/<id>`
 * is a report and `<base>` is the list its Back link opens. A host that draws
 * ReportScreen on its own route passes it as `basePath` and owns both routes.
 */
export function useReportBase(): string {
    return use(ReportBase)
}
````

- [ ] **Step 4: Read the base where a report route is built**

Apply:

````diff
diff --git a/core/reports/hooks/useBackToReports.ts b/core/reports/hooks/useBackToReports.ts
index 2f5366d1..ef8ad033 100644
--- a/core/reports/hooks/useBackToReports.ts
+++ b/core/reports/hooks/useBackToReports.ts
@@ -1,15 +1,17 @@
 import { useOrgHref } from '@tinycld/core/lib/org-routes'
 import { router } from 'expo-router'
 import { reportBack } from '../lib/report-back'
+import { useReportBase } from '../lib/report-base'
 import { useReportRecord } from './useReportRecord'
 
 // A report is opened from the hub, which the router history still holds. Going
 // back returns to it; a deep link with nothing to go back to lands on the hub.
 export function useBackToReports() {
     const orgHref = useOrgHref()
+    const base = useReportBase()
     return () => {
         if (router.canGoBack()) router.back()
-        else router.replace(orgHref('reports'))
+        else router.replace(orgHref(base))
     }
 }
 
@@ -20,18 +22,19 @@ export function useBackToReports() {
  */
 export function useReportBack(fromId: string): { label: string; onBack: () => void } {
     const orgHref = useOrgHref()
+    const base = useReportBase()
     const source = useReportRecord(fromId)
     const back = reportBack(source.state, source.record?.title)
     const onBack = () => {
         if (back.to === 'hub') {
-            router.replace(orgHref('reports'))
+            router.replace(orgHref(base))
             return
         }
         // A failed read stays failed for the next screen's query of the same record
         // until it is recovered, so the source screen would open on its error.
         if (source.state === 'error') source.retry()
         if (router.canGoBack()) router.back()
-        else router.replace(orgHref(`reports/${fromId}`))
+        else router.replace(orgHref(`${base}/${fromId}`))
     }
     return { label: back.label, onBack }
 }
diff --git a/core/reports/hooks/useDrillPanel.ts b/core/reports/hooks/useDrillPanel.ts
index f1df4f65..e8f7d506 100644
--- a/core/reports/hooks/useDrillPanel.ts
+++ b/core/reports/hooks/useDrillPanel.ts
@@ -7,6 +7,7 @@ import { firstOf, fullReportHref } from '../lib/drill'
 import { type FocusTarget, focusFigure, focusNode, rowFocusKey } from '../lib/figure-focus'
 import { recordPanelOf } from '../lib/record-panel'
 import { registeredPanels } from '../lib/registered-panels'
+import { useReportBase } from '../lib/report-base'
 import { UNREADABLE_SPEC } from '../lib/spec'
 import { clearedDrillKeys, DRILL_KEY, DRILL_PREFIX, RECORD_KEY } from '../lib/view-url'
 import { recordTitleOf, useReportUIStore } from '../stores/report-ui-store'
@@ -31,6 +32,7 @@ export interface DrillPanelInput {
 export function useDrillPanel({ targetId, sourceId, sourceTitle }: DrillPanelInput) {
     const router = useRouter()
     const orgHref = useOrgHref()
+    const base = useReportBase()
     const search = useLocalSearchParams()
     const surface = useDetailSurface()
     const record = useReportRecord(targetId)
@@ -80,7 +82,7 @@ export function useDrillPanel({ targetId, sourceId, sourceTitle }: DrillPanelInp
         titleKey,
         onClose,
         onOpenFull: () =>
-            router.push(orgHref(fullReportHref(targetId, view.defs, view.options, sourceId))),
+            router.push(orgHref(fullReportHref(targetId, view.defs, view.options, sourceId, base))),
     }
 }
 
diff --git a/core/reports/hooks/useReportBuilder.ts b/core/reports/hooks/useReportBuilder.ts
index 50105e2b..1b6a6d74 100644
--- a/core/reports/hooks/useReportBuilder.ts
+++ b/core/reports/hooks/useReportBuilder.ts
@@ -20,6 +20,7 @@ import {
     specFromDraft,
 } from '../lib/builder/draft'
 import { problemsFromError } from '../lib/builder/errors'
+import { useReportBase } from '../lib/report-base'
 import { forgetSavedRuns } from '../lib/run-client'
 import { type ParamDef, parseSpec, type ReportSpec } from '../lib/spec'
 import type { CatalogSource } from '../lib/types'
@@ -71,6 +72,8 @@ export function useReportBuilder(input: BuilderInput) {
     const { mode, catalog, base, record, spec } = input
     const { user } = useAuth()
     const orgHref = useOrgHref()
+    // The route of the report view; `base` in this hook is the builder's source.
+    const reportBase = useReportBase()
     const queryClient = useQueryClient()
     const [reportsCollection] = useStore('reports')
     const schema = useMemo(() => builderSchema(catalog), [catalog])
@@ -117,7 +120,7 @@ export function useReportBuilder(input: BuilderInput) {
     const exit = () => {
         if (mode === 'edit') router.setParams({ [EDIT_KEY]: undefined })
         else if (router.canGoBack()) router.back()
-        else router.replace(orgHref('reports'))
+        else router.replace(orgHref(reportBase))
     }
 
     const save = useMutation({
@@ -148,7 +151,7 @@ export function useReportBuilder(input: BuilderInput) {
                 // The view comes back on the same run key; its cached run is the old spec's.
                 forgetSavedRuns(queryClient, id)
                 router.setParams({ [EDIT_KEY]: undefined })
-            } else router.replace(orgHref('reports/[id]', { id }))
+            } else router.replace(orgHref(`${reportBase}/${id}`))
         },
         onError: (error: unknown) => {
             const problems = problemsFromError(error)
diff --git a/core/reports/hooks/useRowLinks.ts b/core/reports/hooks/useRowLinks.ts
index cf9a5406..2c489de7 100644
--- a/core/reports/hooks/useRowLinks.ts
+++ b/core/reports/hooks/useRowLinks.ts
@@ -14,6 +14,7 @@ import {
     tabRouteOf,
 } from '../lib/record-return'
 import { registeredPanels } from '../lib/registered-panels'
+import { useReportBase } from '../lib/report-base'
 import type { ResultColumn, ResultRow } from '../lib/types'
 import { RECORD_KEY } from '../lib/view-url'
 import { type ReportUIScope, useReportUIStore } from '../stores/report-ui-store'
@@ -88,6 +89,7 @@ function useOpenRecordPanel(hasPanel: boolean) {
  */
 export function useRowLinks(drill: RowDrill | undefined): RowLinks | undefined {
     const orgHref = useOrgHref()
+    const base = useReportBase()
     const search = useLocalSearchParams()
     const shown = useStable(shownDrillParams(search))
     const shownRecord = firstOf(search[RECORD_KEY])
@@ -109,7 +111,7 @@ export function useRowLinks(drill: RowDrill | undefined): RowLinks | undefined {
         const record = { [RECORD_KEY]: shownRecord }
         return {
             figureHref: (column, row) => {
-                const href = drillHref(column, row, sourceId)
+                const href = drillHref(column, row, sourceId, base)
                 return href === null ? null : orgHref(href)
             },
             onFigure: (column, row) => {
@@ -126,7 +128,7 @@ export function useRowLinks(drill: RowDrill | undefined): RowLinks | undefined {
             rowKey: row => rowFocusKey(scope, row.id),
             isRowShown: row => isRowShown(row, openedRow, record),
         }
-    }, [sourceId, scope, shown, shownRecord, openedRow, orgHref, openScreen, setDrillOrigin])
+    }, [sourceId, scope, shown, shownRecord, openedRow, orgHref, base, openScreen, setDrillOrigin])
 }
 
 // useNavigation's own default type (its getState may be undefined), read off a call
diff --git a/core/reports/lib/drill.ts b/core/reports/lib/drill.ts
index aa284651..17942f50 100644
--- a/core/reports/lib/drill.ts
+++ b/core/reports/lib/drill.ts
@@ -3,6 +3,7 @@ import { useDetailSurface } from '@tinycld/core/lib/use-detail-surface'
 import { useLocalSearchParams, useRouter } from 'expo-router'
 import { useReportUIStore } from '../stores/report-ui-store'
 import { textFromCents } from './money'
+import { REPORTS_BASE, useReportBase } from './report-base'
 import type { ParamDef } from './spec'
 import type { DrillParams, ResultColumn, ResultRow } from './types'
 import {
@@ -59,12 +60,20 @@ function drillKeys(params: DrillParams, prefix: string): Record<string, string>
     return out
 }
 
-/** The full report's screen path for a figure, with the source report (D3); wrap it with orgHref. */
-export function drillHref(column: ResultColumn, row: ResultRow, sourceId: string): string | null {
+/**
+ * The full report's screen path for a figure, with the source report (D3); wrap it
+ * with orgHref. `base` is the route the report view is drawn under (useReportBase).
+ */
+export function drillHref(
+    column: ResultColumn,
+    row: ResultRow,
+    sourceId: string,
+    base: string = REPORTS_BASE
+): string | null {
     const params = drillCellParams(column, row)
     if (!column.drill || !params) return null
     const query = new URLSearchParams({ ...drillKeys(params, ''), [FROM_KEY]: sourceId })
-    return `reports/${column.drill.reportId}?${query.toString()}`
+    return `${base}/${column.drill.reportId}?${query.toString()}`
 }
 
 /**
@@ -75,14 +84,15 @@ export function fullReportHref(
     reportId: string,
     defs: readonly ParamDef[],
     options: ViewOptions,
-    sourceId: string
+    sourceId: string,
+    base: string = REPORTS_BASE
 ): string {
     const query = new URLSearchParams()
     for (const [key, value] of Object.entries(serializeViewOptions(defs, options))) {
         if (value !== undefined) query.set(key, value)
     }
     query.set(FROM_KEY, sourceId)
-    return `reports/${reportId}?${query.toString()}`
+    return `${base}/${reportId}?${query.toString()}`
 }
 
 /** The route params that show a figure's drill in the panel; every older drill key is cleared. */
@@ -139,6 +149,7 @@ export function isDrillShown(column: ResultColumn, row: ResultRow, search: Searc
 export function useOpenDrill({ sourceId, hasPanel }: { sourceId: string; hasPanel: boolean }) {
     const router = useRouter()
     const orgHref = useOrgHref()
+    const base = useReportBase()
     const search = useLocalSearchParams()
     const surface = useDetailSurface()
     const closeCustomize = useReportUIStore(s => s.closeCustomize)
@@ -152,7 +163,7 @@ export function useOpenDrill({ sourceId, hasPanel }: { sourceId: string; hasPane
             closeCustomize('main')
             return
         }
-        const href = drillHref(column, row, sourceId)
+        const href = drillHref(column, row, sourceId, base)
         if (href) router.push(orgHref(href))
     }
 }
diff --git a/core/reports/screens/ReportScreen.tsx b/core/reports/screens/ReportScreen.tsx
index 0bd47a82..7ba00845 100644
--- a/core/reports/screens/ReportScreen.tsx
+++ b/core/reports/screens/ReportScreen.tsx
@@ -17,6 +17,7 @@ import { useReportRecord } from '../hooks/useReportRecord'
 import { useReportView } from '../hooks/useReportView'
 import type { Catalog } from '../lib/builder/columns'
 import { HUB_BACK_LABEL } from '../lib/report-back'
+import { REPORTS_BASE, ReportBaseProvider } from '../lib/report-base'
 import { canCopyReport, UNREADABLE_SPEC } from '../lib/spec'
 import type { CatalogSource } from '../lib/types'
 import { EDIT_KEY, FROM_KEY } from '../lib/view-url'
@@ -193,7 +194,27 @@ function EditingReport({ record, catalog, base, back }: EditingReportProps) {
 
 // A drilled report (`from`) names its source on its back link; the hub's reads
 // Reports and reads no record.
-export function ReportScreen({ reportId }: { reportId: string }) {
+interface ReportScreenProps {
+    reportId: string
+    /**
+     * The route this screen is drawn under, without the org prefix, when it is not
+     * core's own: a drill and a saved copy open `<basePath>/<id>`, and Back with no
+     * history opens `<basePath>`. The host owns both routes. Edit stays on the
+     * current route (`?edit=1`). New report and the copied share link are core's
+     * routes.
+     */
+    basePath?: string
+}
+
+export function ReportScreen({ reportId, basePath = REPORTS_BASE }: ReportScreenProps) {
+    return (
+        <ReportBaseProvider base={basePath}>
+            <ReportByOrigin reportId={reportId} />
+        </ReportBaseProvider>
+    )
+}
+
+function ReportByOrigin({ reportId }: { reportId: string }) {
     const search = useLocalSearchParams<{ [FROM_KEY]?: string }>()
     const fromId = search[FROM_KEY]
     if (fromId) return <ReportFromSource reportId={reportId} fromId={fromId} />
````

- [ ] **Step 5: Run the tests, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run core/reports && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check core/reports && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck && pnpm run check:core-isolation`
Expected: PASS (every test file under `core/reports`; `useBackToReports` 5 tests); biome and the typecheck print no error; `check-core-isolation` reports no new reference.

- [ ] **Step 6: Document the prop for package authors**

Apply to `docs/packages.md` (the new section goes before `### Test build tag`):

````diff
diff --git a/docs/packages.md b/docs/packages.md
index 4227e012..de98a37f 100644
--- a/docs/packages.md
+++ b/docs/packages.md
@@ -1842,2 +1845,27 @@ data.
 
+#### Drawing a report on a package's own route
+
+A report opened on core's route (`/a/reports/<id>`) leaves the package: its sidebar
+goes. To keep a report inside the package, draw core's report view on a route of
+the package and pass that route as `basePath`:
+
+```tsx
+import { ReportScreen } from '@tinycld/core/reports/screens/ReportScreen'
+
+// screens/reports/[id].tsx of the package `<slug>`
+export default function PackageReport() {
+    const { id } = useLocalSearchParams<{ id: string }>()
+    return <ReportScreen reportId={id} basePath="<slug>/reports" />
+}
+```
+
+With `basePath`, a drill to another report opens `<basePath>/<id>`, Back from a
+drilled report returns to `<basePath>/<id>` of its source, a copy saved with **Save
+as** opens `<basePath>/<newId>`, and Back with no history opens `<basePath>`. The
+package owns both routes: `<basePath>/[id]` and `<basePath>` (a screen of the package,
+for example its own list of its reports). **Edit** opens the builder on the current
+route (`?edit=1`), so the screen must stay mounted while the reader edits: do not
+unmount it on a failed reload of a list. **New report** and the copied share link
+are core's routes.
+
 ### Test build tag
````

- [ ] **Step 7: Commit**

```bash
git add core/reports/lib/report-base.ts core/reports/lib/drill.ts core/reports/hooks/useRowLinks.ts core/reports/hooks/useDrillPanel.ts core/reports/hooks/useBackToReports.ts core/reports/hooks/useReportBuilder.ts core/reports/screens/ReportScreen.tsx core/reports/lib/__tests__/drill.test.ts core/reports/hooks/__tests__/useBackToReports.test.tsx docs/packages.md
git commit -m "reports: optional base route of the report view"
```

---

### Task 12b (CORE): remove the Reports entry of the main navigation

**Repo:** `/Users/nas/tmp/tinycld/books/tinycld`, the branch of task 12.

**Files:**
- Modify: `core/components/workspace/PackageRail.tsx`
- Modify: `core/components/workspace/MoreDrawer.tsx`
- Modify: `tests/e2e/helpers.ts`
- Modify: `tests/e2e/report-view-helpers.ts`
- Modify: `tests/e2e/reports-helpers.ts`
- Modify: `tests/e2e/reports-create.spec.ts`
- Modify: `tests/scripts/reports-stub/screens/index.tsx.txt`
- Modify: `app/a/(app)/_layout.tsx` (a comment that names the rail link)
- Modify: `core/help/reports.md`
- Modify: `docs/packages.md`

**Interfaces:**
- Removes: the rail link `nav-reports` and the More row `more-reports`, with no condition and no manifest field (decision of the human, 2026-11-23; it holds until a second report consumer exists). The routes `/a/reports`, `/a/reports/new` and `/a/reports/[id]` stay.
- Changes for specs: `openReportsHub(page)` is now defined in `tests/e2e/reports-helpers.ts` (all 25 core specs import it from there already) and opens the hub through the new link `salesstub-open-reports` of the stub's landing screen. It leaves `tests/e2e/report-view-helpers.ts`, so `@tinycld/core/e2e-helpers` no longer exports it: a package's spec presses its package's own link. `navigateToPackage(page, 'reports')` no longer works (`reports` leaves `CHROME_HEADINGS`); no file calls it after this task.

- [ ] **Step 1: Remove the two entries, and give the specs their path to the hub**

Apply:

````diff
diff --git a/app/a/(app)/_layout.tsx b/app/a/(app)/_layout.tsx
index 6997904c..460343b9 100644
--- a/app/a/(app)/_layout.tsx
+++ b/app/a/(app)/_layout.tsx
@@ -98,7 +98,8 @@ function ActivePkgSync() {
         // list. The full href (path + query) is captured at any depth; a
         // package root (e.g. /mail) is itself a valid href, so leaving a
         // package on its list still restores to the list. Skipped for app-owned
-        // areas (settings/help/reports), which the rail always links to their root.
+        // areas (settings/help/reports): the rail links settings and help to their root,
+        // and a package links to the Reports hub.
         if (
             nextSlug &&
             !NON_RESTORABLE_SLUGS.has(nextSlug) &&
diff --git a/core/components/workspace/MoreDrawer.tsx b/core/components/workspace/MoreDrawer.tsx
index 55c4164b..22b96984 100644
--- a/core/components/workspace/MoreDrawer.tsx
+++ b/core/components/workspace/MoreDrawer.tsx
@@ -5,7 +5,7 @@ import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
 import { useSortedPackages } from '@tinycld/core/lib/use-sorted-packages'
 import { Sheet } from '@tinycld/core/ui/sheet'
 import { useRouter } from 'expo-router'
-import { BarChart3, Bell, LogOut, Settings, User, X } from 'lucide-react-native'
+import { Bell, LogOut, Settings, User, X } from 'lucide-react-native'
 import { useCallback } from 'react'
 import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
 import { MAX_VISIBLE_TABS } from './MobileTabBar'
@@ -90,18 +90,6 @@ export function MoreDrawer() {
                     </Text>
                 </Pressable>
 
-                {/* Reports is an app area with no tab of its own on a phone. */}
-                <Pressable
-                    testID="more-reports"
-                    className="flex-row items-center gap-3.5 px-4 py-3.5 rounded-lg"
-                    onPress={() => handleNav(() => router.push(orgHref('reports')))}
-                >
-                    <BarChart3 size={20} color={textColor} />
-                    <Text className="text-base font-medium" style={{ color: textColor }}>
-                        Reports
-                    </Text>
-                </Pressable>
-
                 {/* The settings HUB, not the personal page. MobileTabBar has no
                     settings entry, so this row is the ONLY way into settings on a
                     phone — pointing it at a single section left Rules, Members and
diff --git a/core/components/workspace/PackageRail.tsx b/core/components/workspace/PackageRail.tsx
index 44038af8..075b6bea 100644
--- a/core/components/workspace/PackageRail.tsx
+++ b/core/components/workspace/PackageRail.tsx
@@ -9,7 +9,6 @@ import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
 import { useSortedPackages } from '@tinycld/core/lib/use-sorted-packages'
 import { type Href, Link } from 'expo-router'
 import {
-    BarChart3,
     Building2,
     HelpCircle,
     type LucideIcon,
@@ -110,16 +109,6 @@ export function PackageRail({
                 <ImportIndicator />
                 <NotificationBell color={railText} />
 
-                <Link href={orgHref('reports')} asChild>
-                    <Pressable
-                        testID="nav-reports"
-                        className="w-11 h-11 rounded-xl justify-center items-center"
-                        accessibilityLabel="Reports"
-                    >
-                        <BarChart3 size={22} color={railText} />
-                    </Pressable>
-                </Link>
-
                 <Link href={orgHref('help')} asChild>
                     <Pressable
                         testID="nav-help"
diff --git a/tests/e2e/helpers.ts b/tests/e2e/helpers.ts
index 92cba6f4..74bf53fa 100644
--- a/tests/e2e/helpers.ts
+++ b/tests/e2e/helpers.ts
@@ -495,16 +495,15 @@ export async function navigateToPackage(page: Page, pkg: string, options?: { wai
     // is still loading, which is why the URL-based version needed
     // `waitUntil: 'commit'` everywhere and still raced.
     //
-    // settings/help/reports are app chrome, not packages: app/(app)/_layout maps them
+    // settings/help are app chrome, not packages: app/(app)/_layout maps them
     // to activePkgSlug=null on purpose (they leave the rail highlight where it
     // was), so no `pkg-active-*` marker ever appears for them. Gate those on
     // their own heading instead — waiting for the marker would hang forever.
-    // Reports has a hub-only heading id: its report screens show a "Reports"
-    // back link, which a text match would take for the hub.
+    // The Reports hub is chrome too, but the rail has no link to it: a spec
+    // opens it through a package's own link (openReportsHub of reports-helpers).
     const CHROME_HEADINGS: Record<string, (p: Page) => Locator> = {
         settings: p => p.getByText('Settings', { exact: true }).first(),
         help: p => p.getByText('Help', { exact: true }).first(),
-        reports: p => p.getByTestId('reports-hub-heading'),
     }
     const chromeHeading = CHROME_HEADINGS[pkg]
     const onTarget = chromeHeading ? chromeHeading(page) : packageScreen(page, pkg)
diff --git a/tests/e2e/report-view-helpers.ts b/tests/e2e/report-view-helpers.ts
index d536b237..6f884497 100644
--- a/tests/e2e/report-view-helpers.ts
+++ b/tests/e2e/report-view-helpers.ts
@@ -1,15 +1,12 @@
 import { type Download, expect, type Locator, type Page } from '@playwright/test'
-import { inStatement, navigateToPackage } from './helpers.ts'
+import { inStatement } from './helpers.ts'
 
 // Helpers for any spec that drives the reports hub and core's report view: they
 // name no source, so a package's own report e2e uses them through
-// @tinycld/core/e2e-helpers (E11). The `.ts` extension is required there (see
+// @tinycld/core/e2e-helpers (E11). None opens the hub: core's navigation has no
+// entry for it, so a spec opens it through its package's own link. The `.ts` extension is required there (see
 // core/e2e-helpers.ts).
 
-export async function openReportsHub(page: Page) {
-    await navigateToPackage(page, 'reports', { waitFor: page.getByTestId('reports-hub') })
-}
-
 export function hubRow(page: Page, title: string): Locator {
     return page.locator('[data-testid^="reports-hub-row-"]').filter({ hasText: title })
 }
diff --git a/tests/e2e/reports-create.spec.ts b/tests/e2e/reports-create.spec.ts
index 0cd10f04..8d6c5be6 100644
--- a/tests/e2e/reports-create.spec.ts
+++ b/tests/e2e/reports-create.spec.ts
@@ -137,10 +137,11 @@ test.describe('creating a report', () => {
     test('on a phone the hub shows cards and the builder is a full sheet with a preview', async ({
         p,
     }) => {
+        // The hub is opened from a package's link, at the default viewport (the helper
+        // presses a rail link, which a phone does not draw); the phone layout is the
+        // subject here, not the way in.
+        await openReportsHub(p)
         await p.setViewportSize({ width: 390, height: 844 })
-        // A phone has no rail: Reports is a row of the More sheet.
-        await p.getByTestId('nav-more').click()
-        await p.getByTestId('more-reports').click()
         await expect(p.getByTestId('reports-hub')).toBeVisible()
         await startReport(p, SALES_SOURCE)
         await expect(p.getByTestId('report-builder-mode-design')).toBeVisible()
diff --git a/tests/e2e/reports-helpers.ts b/tests/e2e/reports-helpers.ts
index cf4690bd..71dc435f 100644
--- a/tests/e2e/reports-helpers.ts
+++ b/tests/e2e/reports-helpers.ts
@@ -3,13 +3,12 @@ import { deriveUsername } from '@tinycld/core/lib/derive-username'
 import { strFromU8, unzipSync } from 'fflate'
 import PocketBase from 'pocketbase'
 import { inStatement, loginAs, navigateToPackage } from './helpers'
-import { chooseParamOption, hubRow, openReportsHub, rowOf } from './report-view-helpers'
+import { chooseParamOption, hubRow, rowOf } from './report-view-helpers'
 
 export {
     cellOf,
     chooseParamOption,
     hubRow,
-    openReportsHub,
     pressToolbar,
     rowOf,
 } from './report-view-helpers'
@@ -107,6 +106,19 @@ export async function openReportStub(page: Page) {
     await navigateToPackage(page, 'salesstub', { waitFor: page.getByTestId('salesstub-landing') })
 }
 
+/**
+ * Opens the Reports hub with all its tabs. Core's navigation has no entry for the
+ * hub: a package links to it, and the stub's landing screen holds that link. Call it
+ * at the default viewport (openReportStub presses a rail link), then set a phone size.
+ */
+export async function openReportsHub(page: Page) {
+    const hub = page.getByTestId('reports-hub-heading')
+    await openReportStub(page)
+    await page.getByTestId('salesstub-open-reports').click()
+    await expect(hub).toBeVisible()
+    await expect(page.getByTestId('reports-hub')).toBeVisible()
+}
+
 const REGION_LABELS = { north: 'North', south: 'South', east: 'East', none: 'No region' } as const
 
 export async function addTeam(
diff --git a/tests/scripts/reports-stub/screens/index.tsx.txt b/tests/scripts/reports-stub/screens/index.tsx.txt
index 52dfbc28..f92d3d8d 100644
--- a/tests/scripts/reports-stub/screens/index.tsx.txt
+++ b/tests/scripts/reports-stub/screens/index.tsx.txt
@@ -1,6 +1,7 @@
 import { useLiveQuery } from '@tanstack/react-db'
 import { useAuth } from '@tinycld/core/lib/auth'
 import { useMutation } from '@tinycld/core/lib/mutations'
+import { useOrgHref } from '@tinycld/core/lib/org-routes'
 import { useStore } from '@tinycld/core/lib/pocketbase'
 import { Button, ButtonText } from '@tinycld/core/ui/button'
 import {
@@ -20,6 +21,7 @@ import {
     zodResolver,
 } from '@tinycld/core/ui/form'
 import { Menu } from '@tinycld/core/ui/menu'
+import { router } from 'expo-router'
 import { newRecordId } from 'pbtsdb/core'
 import { useState } from 'react'
 import { ScrollView, Text, View } from 'react-native'
@@ -573,12 +575,29 @@ function DrawerMenuDemo() {
     )
 }
 
+// Core's navigation has no entry for the Reports hub: a package links to it. This is
+// the link the reports specs open the hub with (all tabs, no package filter).
+function OpenReportsLink() {
+    const orgHref = useOrgHref()
+    return (
+        <Button
+            testID="salesstub-open-reports"
+            variant="outline"
+            className="self-start"
+            onPress={() => router.push(orgHref('reports'))}
+        >
+            <ButtonText>Open Reports</ButtonText>
+        </Button>
+    )
+}
+
 export default function ReportStubIndex() {
     return (
         <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 p-4">
             <Text testID="salesstub-landing" className="text-lg font-semibold text-foreground">
                 Sales stub
             </Text>
+            <OpenReportsLink />
             <TeamForm />
             <SaleForm />
             <ManySalesForm />
````

- [ ] **Step 2: Check that no caller of the old path is left**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && command grep -rn "nav-reports\|more-reports\|navigateToPackage(page, 'reports'" --include='*.ts' --include='*.tsx' --include='*.txt' core tests app scripts`
Expected: no line.

Run: `cd /Users/nas/tmp/tinycld/books && command grep -rln "openReportsHub" --include='*.ts' */tests 2>/dev/null | command grep -v "^tinycld/"`
Expected: no line (no package spec used the helper). If a line shows, that spec is of another package: give it its package's own link to the hub in that package's repo, under the same branch name, and report it.

- [ ] **Step 3: Update the help topic and the package docs**

Apply to `core/help/reports.md`:

````diff
diff --git a/core/help/reports.md b/core/help/reports.md
index ede0aa3f..3937a3b5 100644
--- a/core/help/reports.md
+++ b/core/help/reports.md
@@ -5,12 +5,13 @@ tags: [reports, report builder, share report, publish, filter, group, pivot, for
 order: 40
 ---
 
-Open **Reports** from the rail (on a phone: **More → Reports**). The hub has three
-tabs: **Mine** (reports you own), **Shared with me**, and **Published** (reports an
-admin published for everyone). **Last run** shows when you last ran a report on this
-device.
+A package that has reports links to the Reports hub from its own screens (for example
+from its sidebar): there is no entry for the hub in the rail or in **More**. The hub
+has three tabs: **Mine** (reports you own), **Shared with me**, and **Published**
+(reports an admin published for everyone). **Last run** shows when you last ran a
+report on this device.
 
-A package can open the hub for its own reports (for example from its sidebar). The
+A package can open the hub for its own reports only. The
 hub then shows "Showing reports from" and the package's name, and one list of every
 report of that package you can open: your own, the ones shared with you, and the
 published ones. To see all reports in the tabs again, select **Show all reports**.
````

Apply to `docs/packages.md`:

````diff
diff --git a/docs/packages.md b/docs/packages.md
index 4227e012..de98a37f 100644
--- a/docs/packages.md
+++ b/docs/packages.md
@@ -1821,5 +1821,6 @@ nothing changes.
 
-A package's e2e opens core's report view with `openReportsHub`, `hubRow`,
-`rowOf`, `cellOf`, `pressToolbar` and `chooseParamOption`, all from
-`@tinycld/core/e2e-helpers`.
+A package's e2e drives the hub and core's report view with `hubRow`, `rowOf`,
+`cellOf`, `pressToolbar` and `chooseParamOption`, all from
+`@tinycld/core/e2e-helpers`. No helper opens the hub: core's navigation has no
+entry for it, so the spec presses the package's own link to it.
 
@@ -1827,4 +1828,6 @@ A package's e2e opens core's report view with `openReportsHub`, `hubRow`,
 
-Core's Reports hub is at `/a/reports`. To show only your package's reports and
-report sources (for a sidebar "Reports" entry), link to it with your slug:
+Core's Reports hub is at `/a/reports`. Core's navigation (the rail, and **More**
+on a phone) has no entry for it: a package that has reports links to it. To show
+only your package's reports and report sources (for a sidebar "Reports" entry),
+link to it with your slug:
 
````

- [ ] **Step 4: Run the unit tests, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run core/components/workspace && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check core/components/workspace tests/e2e/helpers.ts tests/e2e/report-view-helpers.ts tests/e2e/reports-helpers.ts tests/e2e/reports-create.spec.ts && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck && pnpm run check:core-isolation`
Expected: PASS; biome and the typecheck print no error (an unused import of `BarChart3`, `Link` or `router` is an error: remove only what this task made unused).

- [ ] **Step 5: Run the core report specs, or hand the command to the driver**

The report specs need the stub package `salesstub`, which a lane workspace does not hold. The stub template `tests/scripts/reports-stub/screens/index.tsx.txt` (the new link `salesstub-open-reports`) is first compiled and run where the stub is scaffolded. The scaffold changes the workspace's member list and needs an install, so an implementer does not run it. Report this line, as it is, to the driver:

`NEEDS-RUN: cd /Users/nas/tmp/tinycld/books && pnpm exec tsx tinycld/tests/scripts/scaffold-reports-stub.ts && pnpm install && lsof -iTCP -sTCP:LISTEN -nP | grep -qE ':(7230|7231) ' && { echo PORTS-BUSY; exit 1; }; E2E_PORT=7230 E2E_PORT_2=7231 E2E_IMAP_PORT=1230 E2E_IMAP_PORT_2=1231 pnpm exec tinycld-pkg test:e2e $(command grep -rl "openReportsHub" tinycld/tests/e2e --include='*.spec.ts' | tr '\n' ' ')`

Expected of that run: all pass (the 25 core specs that open the hub, `reports-create.spec.ts` with its phone test among them). The scaffold step is the one of core's CI (`.github/workflows/ci.yml`, "Scaffold reports stub package"). After the run the driver removes the stub member again (`salesstub/` and its line in the root member list), because a Books run must not hold it.

- [ ] **Step 6: Commit**

```bash
git add core/components/workspace/PackageRail.tsx core/components/workspace/MoreDrawer.tsx "app/a/(app)/_layout.tsx" tests/e2e/helpers.ts tests/e2e/report-view-helpers.ts tests/e2e/reports-helpers.ts tests/e2e/reports-create.spec.ts tests/scripts/reports-stub/screens/index.tsx.txt core/help/reports.md docs/packages.md
git commit -m "nav: remove the Reports entry of the main navigation"
```

---

## What part 3 takes from this part

- `useBooksReports()` (task 8) for the Reports section; `FoldHeading` (task 9) for its heading; `books-ui-store` gets `isReportsOpen` and `toggleReports()` beside `isNewOpen`, and the persist test of `tests/books-ui-store.test.ts` then names three fields.
- Task 13 (the Books report route) is in part 3. It needs task 12 in the workspace's core checkout. Rules for it, from the review of this part: (1) draw core's `ReportScreen` with `basePath="books/reports"` and NEVER unmount it on the state of a list read (Edit runs the builder on the same route with `?edit=1`; an unmount loses unsaved input): show the "not a Books report" note only for a loaded `reports` row of that id whose `source` does not start with `books.` (a one-row live query), and for a missing row or a failed read draw `ReportScreen`, which has its own loading, error and no-access frames; (2) Books owns `books/reports` too (Back with no history opens it): a Books screen that lists the Books reports inside Books, never a redirect to core's hub (Back from a Books report must stay in Books); (3) task 19's e2e types in the builder on the Books route and checks that the text stays after the reports read fails and recovers. Task 15 then makes `shippedReportHref` build the Books route, and `tests/shortcut-rows.test.ts` expects `/a/books/reports/[id]` in place of `/a/reports/[id]`.
- Task 14 removes the `reports` entry of `SIDEBAR_ENTRIES`; a stored `screen:reports` shortcut then has no target, is not drawn in the sidebar, and shows as "Not available" in the dialog. No manifest field is set: core's entry is gone with no condition (task 12b).
- The Books e2e helper `openBooksReports` (`tests/e2e/books-report-helpers.ts`) still presses `books-nav-reports`; task 14 points it at `books-sidebar-reports-all`.
- The e2e door `tests/e2e/new-menu-helpers.ts`: `openNewMenu(page)` works at both widths; `newSectionToggle(page)`; the ids of this part's header list. Task 18 covers at 1280 and at 390: the pick in the Add shortcut picker (one of each kind), remove, reorder, Save, reload; the round New button opening the drawer; a reader with no New section.
- Help (task 20) names: the pencil "Customize shortcuts", "Add shortcut", "Reset to defaults", the 30-shortcut limit, "Not available" rows; and that Reports is reached from a package, not from the rail.
