# Sidebar Shortcuts: Reports in Books, Settings in Core Settings, E2E and Help Implementation Plan (part 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Books reports inside Books from a Reports section of the sidebar, show the Books settings sections in core Settings, prove the whole unit with e2e at desktop and phone widths, and record it in help and in the shell spec.

**Architecture:** A Books route `books/reports/[id]` draws core's `ReportScreen` with `basePath="books/reports"` (core task 12 of part 2), so drill links, Back and Save as stay under the Books sidebar. The route never gates `ReportScreen` on a loading or failed read, because Edit runs the builder on the same route. A folding **Reports** section of the sidebar lists the Books reports (part 2's `useBooksReports`) and ends with "All reports", which opens core's hub filtered to Books; the fixed navigation loses its Reports entry. Every Books link to a report goes through `shippedReportHref`, which now builds the Books route. The route `books/reports` is a Books screen with the same list, so Back from a report with no history stays in Books. Core's sidebar item closes the phone drawer at once, with no timer (one core task, 12c). One component, `SectionPanel`, draws a settings section with its own load, error and access states; the Books settings shell and seven panel files named in the manifest list `settings` both draw it.

**Tech Stack:** Expo Router, pbtsdb + TanStack DB (`useLiveQuery`), Zustand (`@tinycld/core/lib/store`), core `ReportScreen`, core sidebar primitives, vitest + happy-dom, Playwright.

**Spec:** the unit `p1-sidebar-shortcuts` in `/Users/nas/code/tinycld/docs/superpowers/plans/2026-10-21-books-run-manifest.yaml`, the outline `/Users/nas/tmp/tinycld/auto-helix-books/staging/p1-sidebar-shortcuts/plan-outline.md` (target layout and decisions; read its first two sections before any task), the shell spec `/Users/nas/tmp/tinycld/books/books/docs/specs/books-shell-design.md`, part 1 `/Users/nas/tmp/tinycld/books/books/docs/plans/2026-11-23-sidebar-shortcuts.md` and part 2 `/Users/nas/tmp/tinycld/books/books/docs/plans/2026-11-23-sidebar-shortcuts-part2.md`.

**This part holds one core task, 12c, and tasks 13 to 20 of the outline, the last ones.** Outline tasks 16 and 17 are one task here (Task 16), so the part has eight tasks. Task 12c is a CORE task: it belongs with tasks 12 and 12b of part 2 (the same core branch `books/p1-sidebar-shortcuts`, the same core PR, merged before the Books PR) and is in this part only because part 2 is at its eight-task limit. It removes the 500 ms timer with which core's sidebar item closes the phone drawer (known limit 4 of part 2): the timer closes a drawer that the round New button opens again inside that time. It is small and touches no file of tasks 12 and 12b.

Order and dependencies: 12c (core) runs in the core checkout before task 12 starts or after task 12b is committed, never at the same time as one of them: its Step 4 runs the typecheck of the whole of core, which a half-done task 12 would fail. Tasks 13 to 20 are Books tasks and run in order. They need parts 1 and 2 built. Task 13 needs core task 12 in the core checkout `/Users/nas/tmp/tinycld/books/tinycld` (it does not typecheck without it); the e2e helpers of task 15 need core task 12b; the phone e2e of tasks 18 and 19 needs core task 12c.

The outline's file names `tests/books-report-route.test.ts` and `tests/settings-panels.test.tsx` are `tests/books-report-route.test.tsx` (it renders a hook) and `tests/settings-panels.test.ts` (it renders nothing) here.

## Global Constraints

- Tasks 13 to 20 work only in `/Users/nas/tmp/tinycld/books/books` and never edit `/Users/nas/tmp/tinycld/books/tinycld` (core). Task 12c works only in core, on the branch `books/p1-sidebar-shortcuts`. Never edit anything under `node_modules`. The generator command of tasks 13, 16 and 20 writes only gitignored output in core; that is not an edit of core.
- Books names no other package. Core names no package: no `books` in a core file or test of task 12c; the fictional name in its test is `zoo`.
- Books runs on web and native: no web-only API in `tinycld/books/**`.
- All PocketBase data goes through pbtsdb. No raw PocketBase call, no new endpoint, no SQL. E2E sets up data through the UI only.
- Never `any`, never a `biome-ignore`, never `console.*`. Row types come from the query, never from a hand-written row interface.
- JSX holds no `.map()`, no ternary and no `{cond && <X />}`: compute above the return, and give a part an `isVisible` prop that returns `null`.
- No raw color: semantic Tailwind tokens, or `useThemeColor`.
- Shared UI state is a Zustand store, never a new React Context.
- Files that Metro loads import their own package by relative path (`../lib/x`), never `~/tinycld/books/...`.
- Test ids of this part never start with `books-nav-` (specs select `[data-testid^="books-nav-"]`) and never start with `books-shortcut-` (the sidebar's shortcut rows have that prefix).
- Tools: `PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH`, then `vitest`, `biome`, `tinycld-pkg typecheck`. Never `pnpm install` in a member.
- E2E: one command for all named files, from `/Users/nas/tmp/tinycld/books`, on ports 7230 and 7231, after the port check shown in the task. A run that would take longer than the runner allows is reported as `NEEDS-RUN` with the command; never raise a timeout, never make a test serial, never add a one-worker project, never run a spec again to make it pass. A test whose rows another test would write takes a user of its own (core's `freshMember` fixture). A failure is diagnosed and fixed at its source; when the source is in core, stop and report it.
- The Commit step of each task is for the runner; an implementer does not commit or push. No commit message names an AI tool.
- A step that says "Apply" shows a unified diff of the change. Apply it by its content with the Edit tool (line numbers can differ when an earlier task changed the file); the result must hold every `+` line and no `-` line. Then run `biome check --write` on the file only when the step's lint names a format difference.
- In the unit-test DOM (the React Native stub), `testID` is the attribute `testid`, `accessibilityLabel` is `accessibilitylabel`, a `Text` is `rn-text`, and `disabled` is not copied to the element.
- Three tasks touch more than 8 files (13: 9 files, three of them under 30 lines; 15: 12 files; 16: 15 files, seven of them five-line panel files). Each stays under 600 changed lines; they are not split, because the part is at its eight-task limit and a split of task 15 would leave stale e2e between two tasks.
- Books sidebar rows keep core's `SidebarItem` with `closesDrawer`. Books adds no code of its own that closes the drawer and no wait for core's timer: the timer is removed in core (task 12c).
- The e2e specs of tasks 18 and 19 are written after the code they prove, so they have no RED run; their proof is the GREEN run of the task and the unit tests named in each spec's header.

## Review Focus

- **Task 12c (core):** the fix is in `SidebarItem` itself, with no timer left; `sidebar-item-drawer.test.tsx` fails before the fix at the case "leaves a drawer open that is opened again after the press" (fake timers); no package name in the test.
- **Task 13:** `screens/reports/[id].tsx` returns `ReportScreen` in every state except a loaded report of another package: no loading gate, no error gate (a gate unmounts the builder and loses unsaved edits). `tests/books-report-route.test.tsx` holds the `booksReportState` table and the refused-read case. `screens/reports/index.tsx` is a Books screen (the Books reports list), never a redirect to core's hub: Back from a Books report with no history stays in Books. Its test ids (`books-reports-*`) differ from the sidebar's (`books-sidebar-report*`), because both are on screen together.
- **Task 14:** `tests/reports-section.test.tsx`: the section is under New and above "Go to"; "All reports" is drawn in the loading, empty and error states too; the failed read shows Retry and recovers. No `books-nav-reports` is left.
- **Task 15:** every Books link to a report builds `books/reports/[id]` in ONE place (`shippedReportHref`); no spec still expects `/a/reports/<id>` after a Books link.
- **Task 16:** `sectionPanelState` checks access before the settings row (a person with no Books level cannot read the row); the admin-only section is refused to a bookkeeper in the panel itself, not only by the shell's list; a drawn body stays under a later loading or error state (`keepsSectionBody`), so a form keeps its unsaved text. `tests/settings-panels.test.ts` holds the manifest list equal to `SETTINGS_SECTIONS` (slugs, order, labels). Each panel file brings its own scroller (core's panel screen has none).
- **Tasks 18 and 19:** not run RED (written after the code); a test that writes a shortcut list, the reader test and the Save as test each run as a `freshMember` (a user of its own) and the Playwright config gets no new project and no new title rule; the one test that saves the company settings row (one row for the organization) uses the existing `(company settings)` title rule; Back after a reload on a Books report lands on `/a/books/reports` with the Books sidebar and no core hub; a locator on a stacked screen is filtered to the visible one; the builder test fails ONLY the Books list read.

Decisions of this part (recorded in the shell spec by task 20): `/a/books/reports` is the Books reports screen; the Reports section is closed at first; the round New button is hidden on a report; a stored `screen:reports` shortcut draws no row any more (the entry is gone; no user has one, the unit is not released); the panel wrapper `SectionPanelScreen` is added to the outline's `SectionPanel`, because core's panel screen does not scroll.

---

### Task 12c (CORE): a sidebar item closes the phone drawer at once

**Repo:** `/Users/nas/tmp/tinycld/books/tinycld`, branch `books/p1-sidebar-shortcuts` (the branch of tasks 12 and 12b of part 2; make it from `main` when it does not exist). Paths in this task are from that repo's root. This task goes in the core PR of tasks 12 and 12b, which merges before the Books PR.

**Files:**
- Modify: `core/components/sidebar-primitives/SidebarItem.tsx`
- Test: `core/components/sidebar-primitives/__tests__/sidebar-item-drawer.test.tsx`

**Interfaces:**
- Consumes: `useWorkspaceStore` (`isDrawerOpen`, `setDrawerOpen`) of `@tinycld/core/lib/stores/workspace-store`, `useWindowSizeStore` of `@tinycld/core/lib/stores/window-size-store` (the width that `useBreakpoint` reads).
- Produces: `SidebarItem` with `closesDrawer` closes the phone drawer in the press itself and starts no timer. Its props do not change. The phone e2e of tasks 18 and 19 relies on this.

The defect: with `closesDrawer`, a press on a phone runs `setTimeout(() => setDrawerOpen(false), 500)`. A press that changes the route closes the drawer at once already (the effect on the route in `app/a/(app)/_layout.tsx`), so the timer has nothing left to close, but it still fires: a drawer that a package's control or a swipe opens again inside the 500 ms is closed by it. The fix closes the drawer in the press and removes the timer.

The test is a unit test of a component, which the project keeps for cases that e2e cannot reach cheaply: only fake timers can hold the 500 ms window open.

What changes for the packages: an item whose press does not change the route (a view choice, a filter) closed the drawer after 500 ms and now closes it at once. No prop and no package file changes.

- [ ] **Step 1: Write the failing test**


Create `core/components/sidebar-primitives/__tests__/sidebar-item-drawer.test.tsx`:

````tsx
// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarItem } from '../SidebarItem'

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }

function isDrawerOpen() {
    return useWorkspaceStore.getState().isDrawerOpen
}

// What a package's own control does when it opens the drawer (a round New button on a
// phone, for example).
function openDrawer() {
    useWorkspaceStore.getState().setDrawerOpen(true)
}

function renderItem(props: { closesDrawer?: boolean; onPress?: () => void }) {
    const { container } = render(<SidebarItem label="Zoo keepers" testID="zoo-item" {...props} />)
    return container.querySelector('[testid="zoo-item"]') as HTMLElement
}

beforeEach(() => {
    vi.useFakeTimers()
    useWindowSizeStore.setState(PHONE)
    openDrawer()
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

describe('SidebarItem and the phone drawer', () => {
    it('closes the drawer at once on a press, after the press handler ran', () => {
        const seen: boolean[] = []
        const item = renderItem({ closesDrawer: true, onPress: () => seen.push(isDrawerOpen()) })

        fireEvent.click(item)

        expect(seen).toEqual([true])
        expect(isDrawerOpen()).toBe(false)
    })

    // The defect this guards: the item closed the drawer with a timer 500 ms after the
    // press. A press that changes the route closes the drawer at once (the app layout does
    // that), so the timer then closed a drawer the user had opened again.
    it('leaves a drawer open that is opened again after the press', () => {
        const item = renderItem({ closesDrawer: true })
        fireEvent.click(item)
        // The route change of the press, as the app layout handles it.
        useWorkspaceStore.getState().setDrawerOpen(false)

        openDrawer()
        vi.advanceTimersByTime(1000)

        expect(isDrawerOpen()).toBe(true)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('leaves the drawer open when the item does not close it', () => {
        const item = renderItem({})

        fireEvent.click(item)
        vi.advanceTimersByTime(1000)

        expect(isDrawerOpen()).toBe(true)
    })

    it('does not touch the drawer state above the phone width', () => {
        useWindowSizeStore.setState(DESKTOP)
        const item = renderItem({ closesDrawer: true })

        fireEvent.click(item)
        vi.advanceTimersByTime(1000)

        expect(isDrawerOpen()).toBe(true)
    })
})
````

- [ ] **Step 2: Run the test to see it fail**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run core/components/sidebar-primitives/__tests__/sidebar-item-drawer.test.tsx`
Expected: FAIL, 2 failed and 2 passed: "closes the drawer at once on a press, after the press handler ran" (the drawer is still open) and "leaves a drawer open that is opened again after the press" (the timer closed it).

- [ ] **Step 3: Close the drawer in the press**

Apply to `core/components/sidebar-primitives/SidebarItem.tsx`:

````diff
--- a/core/components/sidebar-primitives/SidebarItem.tsx
+++ b/core/components/sidebar-primitives/SidebarItem.tsx
@@ -32,9 +32,9 @@
 
     const handlePress = () => {
         onPress?.()
-        if (closesDrawer && isMobile) {
-            setTimeout(() => setDrawerOpen(false), 500)
-        }
+        // At once, with no timer: a timer would also close a drawer that the user opens
+        // again after the press.
+        if (closesDrawer && isMobile) setDrawerOpen(false)
     }
 
     return (
````

- [ ] **Step 4: Run the tests, the lint, the typecheck and the isolation check**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run core/components/sidebar-primitives && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check core/components/sidebar-primitives && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck && pnpm run check:core-isolation`
Expected: PASS (the 4 tests of the new file and the existing test of the folder); biome, the typecheck and the isolation check print no error.

- [ ] **Step 5: Commit**

````bash
cd /Users/nas/tmp/tinycld/books/tinycld
git add core/components/sidebar-primitives/SidebarItem.tsx core/components/sidebar-primitives/__tests__/sidebar-item-drawer.test.tsx
git commit -m "sidebar: close the phone drawer at once on an item press"
````

---

### Task 13: The Books report route

**Files:**
- Create: `tinycld/books/lib/books-report-route.ts`
- Create: `tinycld/books/hooks/useBooksReportState.ts`
- Create: `tinycld/books/screens/reports/[id].tsx`
- Create: `tinycld/books/hooks/useBooksReportList.ts`
- Create: `tinycld/books/components/reports/BooksReportList.tsx`
- Create: `tinycld/books/screens/reports/index.tsx`
- Modify: `tinycld/books/lib/shell-nav.ts` (`FAB_FREE_SCREEN`)
- Test: `tests/books-report-route.test.tsx`, `tests/books-reports-screen.test.tsx`

**Interfaces:**
- Consumes: core `ReportScreen({ reportId, basePath? })` from `@tinycld/core/reports/screens/ReportScreen` (core task 12; `basePath` defaults to `'reports'`), core `useOrgHref`, core `SidebarItem`, core `recoverLiveQueries` and `log`; part 2's `useBooksReports(): { reports, isReady, isError, recovery }` (`hooks/useBooksReports.ts`, rows `{ id, title, shippedKey }`, shipped first; type `BooksReport`); `useFabClearanceStyle()` (`lib/fab-clearance.ts`); part 2's test harness `tests/sidebar-harness.tsx` (`seedSidebar`, `SidebarProviders`, `idsWith`, `PROFIT_AND_LOSS`, `BALANCE_SHEET`, `MY_SALES`, `ZOO_REPORT`, `SeedReport`), `tests/accounts-form-harness.ts` (`onDemandStore`, `heldOnDemandStore`, `useStoreStub`), `tests/silence-log.ts`.
- Produces: `BOOKS_REPORT_BASE = 'books/reports'`, `BOOKS_REPORT_ROUTE = 'books/reports/[id]'`, `REPORTS_HUB_ROUTE = 'reports'`, `BOOKS_HUB_PARAMS: Record<string, string>` (`{ package: 'books' }`), `type BooksReportState = 'report' | 'foreign'`, `booksReportState(row: { source: string } | undefined): BooksReportState`, `useBooksReportState(reportId: string): BooksReportState`; `useBooksReportList(): { reports, isLoading, isError, retry }`; `type ReportListScope = 'sidebar' | 'screen'` and `BooksReportList({ isVisible, scope, reports, isLoading, isError, onRetry })` (the report rows, the loading, empty and error parts, then "All reports"; test ids for the scope `screen`: `books-reports-row-<report id>`, `books-reports-all`, `books-reports-loading`, `books-reports-empty`, `books-reports-error`, `books-reports-retry`; for the scope `sidebar`: the ids task 14 lists); the routes `/a/books/reports/<id>` and `/a/books/reports` (the Books reports screen, test id `books-reports-screen`).

Why the route never gates: Edit report is `router.setParams({ edit: '1' })` on the current route, so core's builder lives inside this route's `ReportScreen` and holds unsaved state. A loading or error frame drawn by Books in place of `ReportScreen` would unmount it. Core's `ReportScreen` draws its own loading, error and no-access frames. Books only replaces it for a report that loaded and belongs to another package, which has no builder state to lose on this route (the Books sidebar would be the wrong sidebar for it).

Why `/a/books/reports` is a Books screen: core's report view opens `<basePath>` for Back when there is no history (a report opened from a link, or after a reload). A redirect to core's hub there would take the user out of Books, which the Books route exists to prevent. So the route draws the Books reports list inside Books. Its rows and states are the ones of the sidebar's Reports section (task 14), so both draw one component, `BooksReportList`; each has its own read (`useBooksReportList`) and its own test ids, because the sidebar and the screen are on screen together. "All reports" on the screen is the user's own step to core's hub.

- [ ] **Step 1: Write the two failing tests**


Create `tests/books-report-route.test.tsx`:

````tsx
// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useBooksReportState } from '../tinycld/books/hooks/useBooksReportState'
import {
    BOOKS_HUB_PARAMS,
    BOOKS_REPORT_BASE,
    BOOKS_REPORT_ROUTE,
    booksReportState,
    REPORTS_HUB_ROUTE,
} from '../tinycld/books/lib/books-report-route'
import { hidesNewFab } from '../tinycld/books/lib/shell-nav'
import { onDemandStore, seedBooks } from './accounts-form-harness'
import { MY_SALES, PROFIT_AND_LOSS, type SeedReport, ZOO_REPORT } from './sidebar-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The refused read is logged by pbtsdb on purpose.
silenceLog()

function seedReports(rows: SeedReport[], refuseOnceFor?: string) {
    seedBooks({ level: 'admin' })
    return onDemandStore<SeedReport>('reports', rows, refuseOnceFor)
}

describe('the Books report routes', () => {
    it('are under books/reports, and the hub lists only Books reports', () => {
        expect(BOOKS_REPORT_BASE).toBe('books/reports')
        expect(BOOKS_REPORT_ROUTE).toBe(`${BOOKS_REPORT_BASE}/[id]`)
        expect(REPORTS_HUB_ROUTE).toBe('reports')
        expect(BOOKS_HUB_PARAMS).toEqual({ package: 'books' })
    })

    it('keep the round New button off a report and on no other reports path', () => {
        expect(hidesNewFab('/a/books/reports/rptprofitloss01')).toBe(true)
        expect(hidesNewFab('/a/books/reports')).toBe(false)
    })
})

describe('booksReportState', () => {
    it('draws the report view for a Books report', () => {
        expect(booksReportState({ source: 'books.account_balances' })).toBe('report')
    })

    it('draws the report view when there is no row: loading, failed, no access, deleted', () => {
        expect(booksReportState(undefined)).toBe('report')
    })

    it('is foreign only for a loaded row of another package', () => {
        expect(booksReportState({ source: 'zoo.feedings' })).toBe('foreign')
        expect(booksReportState({ source: 'booksish.x' })).toBe('foreign')
        expect(booksReportState({ source: '' })).toBe('foreign')
    })
})

describe('useBooksReportState', () => {
    it('is report for a shipped and for a saved Books report', async () => {
        const store = seedReports([PROFIT_AND_LOSS, MY_SALES, ZOO_REPORT])
        const shipped = renderHook(() => useBooksReportState(PROFIT_AND_LOSS.id))
        const saved = renderHook(() => useBooksReportState(MY_SALES.id))

        await waitFor(() => expect(store.has(MY_SALES.id)).toBe(true))
        expect(shipped.result.current).toBe('report')
        expect(saved.result.current).toBe('report')
    })

    it('is foreign for a loaded report of another package', async () => {
        seedReports([PROFIT_AND_LOSS, ZOO_REPORT])
        const { result } = renderHook(() => useBooksReportState(ZOO_REPORT.id))

        await waitFor(() => expect(result.current).toBe('foreign'))
    })

    it('stays report for an id with no row', async () => {
        const store = seedReports([PROFIT_AND_LOSS])
        const known = renderHook(() => useBooksReportState(PROFIT_AND_LOSS.id))
        const unknown = renderHook(() => useBooksReportState('rptgone00000001'))

        await waitFor(() => expect(store.has(PROFIT_AND_LOSS.id)).toBe(true))
        expect(known.result.current).toBe('report')
        expect(unknown.result.current).toBe('report')
    })

    it('stays report when the read of the row fails', async () => {
        const store = seedReports([ZOO_REPORT], ZOO_REPORT.id)
        expectLiveQueryError(store.id)
        const { result } = renderHook(() => useBooksReportState(ZOO_REPORT.id))

        await waitFor(() => expect(store.status).toBe('ready'))
        expect(result.current).toBe('report')
    })
})
````

Create `tests/books-reports-screen.test.tsx`:

````tsx
// @vitest-environment happy-dom
import { fireEvent, render, waitFor } from '@testing-library/react'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BooksReportsScreen from '../tinycld/books/screens/reports/index'
import { heldOnDemandStore } from './accounts-form-harness'
import { byTestId } from './accounts-test-rows'
import {
    BALANCE_SHEET,
    idsWith,
    MY_SALES,
    PROFIT_AND_LOSS,
    type SeedReport,
    SidebarProviders,
    seedSidebar,
    ZOO_REPORT,
} from './sidebar-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: '/a/books/reports', params: {}, href: '/a/books/reports' }),
}))
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The refused read is logged by pbtsdb on purpose.
silenceLog()

const ROW = 'books-reports-row-'
const ALL = 'books-reports-all'

function renderScreen() {
    return render(<BooksReportsScreen />, { wrapper: SidebarProviders })
}

// The rows of the screen in document order: the report rows, then the All reports row.
function screenRows(container: HTMLElement) {
    return idsWith(container, 'books-reports-').filter(id => id.startsWith(ROW) || id === ALL)
}

async function shownRows(container: HTMLElement, count: number) {
    await waitFor(() => expect(idsWith(container, ROW)).toHaveLength(count))
}

beforeEach(() => {
    vi.mocked(router.navigate).mockClear()
    vi.mocked(router.replace).mockClear()
})

describe('Books reports screen', () => {
    it('lists the Books reports, shipped first, then All reports, and no report of another package', async () => {
        seedSidebar({ reports: [MY_SALES, ZOO_REPORT, PROFIT_AND_LOSS, BALANCE_SHEET] })
        const { container } = renderScreen()
        await shownRows(container, 3)

        expect(byTestId(container, 'books-reports-screen')).not.toBeNull()
        expect(screenRows(container)).toEqual([
            `${ROW}${BALANCE_SHEET.id}`,
            `${ROW}${PROFIT_AND_LOSS.id}`,
            `${ROW}${MY_SALES.id}`,
            ALL,
        ])
        // A screen of Books, not a way on to another route.
        expect(vi.mocked(router.replace)).not.toHaveBeenCalled()
        expect(vi.mocked(router.navigate)).not.toHaveBeenCalled()
    })

    it('uses its own test ids, so the sidebar beside it has no element with the same id', async () => {
        seedSidebar()
        const { container } = renderScreen()
        await shownRows(container, 2)

        expect(idsWith(container, 'books-sidebar-')).toEqual([])
    })

    it('opens a report on the Books route and All reports on the hub with the Books filter', async () => {
        seedSidebar()
        const { container } = renderScreen()
        await shownRows(container, 2)

        fireEvent.click(byTestId(container, `${ROW}${PROFIT_AND_LOSS.id}`) as HTMLElement)
        fireEvent.click(byTestId(container, ALL) as HTMLElement)

        expect(vi.mocked(router.navigate).mock.calls.map(call => call[0])).toEqual([
            { pathname: '/a/books/reports/[id]', params: { id: PROFIT_AND_LOSS.id } },
            { pathname: '/a/reports', params: { package: 'books' } },
        ])
    })

    it('says so when there is no Books report, and still offers All reports', async () => {
        seedSidebar({ reports: [ZOO_REPORT] })
        const { container } = renderScreen()

        await waitFor(() =>
            expect(byTestId(container, 'books-reports-empty')?.textContent).toBe('No reports')
        )
        expect(screenRows(container)).toEqual([ALL])
    })

    it('shows Loading while the reports load', async () => {
        seedSidebar()
        const store = heldOnDemandStore<SeedReport>('reports', [PROFIT_AND_LOSS])
        store.hold()
        const { container } = renderScreen()

        await waitFor(() => expect(byTestId(container, 'books-reports-loading')).not.toBeNull())
        expect(byTestId(container, 'books-reports-empty')).toBeNull()

        store.release()

        await shownRows(container, 1)
        expect(byTestId(container, 'books-reports-loading')).toBeNull()
    })

    it('shows an error with Retry, not an empty list, when the reports cannot be read', async () => {
        seedSidebar()
        const store = heldOnDemandStore<SeedReport>('reports', [PROFIT_AND_LOSS], {
            refuseFirstLoad: true,
        })
        expectLiveQueryError(store.id)
        const { container } = renderScreen()

        await waitFor(() => expect(byTestId(container, 'books-reports-error')).not.toBeNull())
        expect(byTestId(container, 'books-reports-empty')).toBeNull()
        expect(screenRows(container)).toEqual([ALL])

        fireEvent.click(byTestId(container, 'books-reports-retry') as HTMLElement)

        await shownRows(container, 1)
        expect(byTestId(container, 'books-reports-error')).toBeNull()
    })
})
````

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/books-report-route.test.tsx tests/books-reports-screen.test.tsx`
Expected: FAIL: `../tinycld/books/lib/books-report-route` and `../tinycld/books/screens/reports/index` cannot be resolved.

- [ ] **Step 3: Write the route constants and the state function**

Create `tinycld/books/lib/books-report-route.ts`:

````ts
// Books draws core's report view on its own routes, so a person who reads a Books report
// stays in Books, with the Books sidebar. Core's view takes the base route and builds its
// drill, Back and Save as links under it.

// The base route core's report view gets (`basePath`), without the org prefix. Back with
// no history opens it, so Books owns this route too: the Books reports screen
// (screens/reports/index.tsx).
export const BOOKS_REPORT_BASE = 'books/reports'

// One report: `orgHref(BOOKS_REPORT_ROUTE, { id })`.
export const BOOKS_REPORT_ROUTE = 'books/reports/[id]'

// Core's Reports hub, and the params that make it list only the Books reports:
// `orgHref(REPORTS_HUB_ROUTE, BOOKS_HUB_PARAMS)`.
export const REPORTS_HUB_ROUTE = 'reports'
export const BOOKS_HUB_PARAMS: Record<string, string> = { package: 'books' }

// A report's source key starts with its package's slug and a dot.
const BOOKS_SOURCE_PREFIX = 'books.'

// `report`: draw core's report view. `foreign`: the report belongs to another package.
export type BooksReportState = 'report' | 'foreign'

// What the Books report route draws for the `reports` row of its id. Only a row that is
// loaded and names another package's source is foreign. No row (still loading, a failed
// read, no access, a deleted report) is `report`: core's view has its own frames for those,
// and the route must never take the view away while a person edits the report in it.
export function booksReportState(row: { source: string } | undefined): BooksReportState {
    if (row && !row.source.startsWith(BOOKS_SOURCE_PREFIX)) return 'foreign'
    return 'report'
}
````

- [ ] **Step 4: Write the hook**

Create `tinycld/books/hooks/useBooksReportState.ts`:

````ts
import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { type BooksReportState, booksReportState } from '../lib/books-report-route'

/**
 * What the Books report route draws for this report id (`booksReportState`). It reads the
 * one row, not the list of Books reports: the answer must not change when that list
 * reloads or fails. Core's report view reads the same row, so this adds no request.
 */
export function useBooksReportState(reportId: string): BooksReportState {
    const [reportsCollection] = useStore('reports')
    const { data } = useLiveQuery({
        query: q =>
            q
                .from({ report: reportsCollection })
                .where(({ report }) => eq(report.id, reportId))
                .select(({ report }) => ({ source: report.source }))
                .findOne(),
        queryKey: ['books', 'report-source', reportId],
    })
    return booksReportState(data)
}
````

- [ ] **Step 5: Hide the round New button on a report**

Core's report view fills the screen and has its own toolbar; the button would cover its last rows.

Apply to `tinycld/books/lib/shell-nav.ts`:

````diff
--- a/tinycld/books/lib/shell-nav.ts
+++ b/tinycld/books/lib/shell-nav.ts
@@ -231,9 +222,10 @@
 // `/vendor-credits`, `/vendor-refunds`), or no screen at all (transfers, write-offs and
 // deposits have no list). Pay Bills has no id: `/pay-bills` itself is the form. The
 // Reconcile history (`/reconcile/history`) is a list beside the accounts screen, not a
-// reconciliation, so it keeps the button too.
+// reconciliation, so it keeps the button too. A report (`/reports/<id>`) is core's report
+// view, which leaves no room under its table for the button.
 const FAB_FREE_SCREEN =
-    /\/books\/((entries|customers|vendors|products|transfers|invoices|sales-receipts|credit-memos|refund-receipts|estimates|bills|expenses|vendor-credits|vendor-refunds|payments|bill-payments|write-offs|deposits)\/[^/]+|reconcile\/(?!history\/?$)[^/]+|pay-bills)\/?$/
+    /\/books\/((entries|customers|vendors|products|transfers|invoices|sales-receipts|credit-memos|refund-receipts|estimates|bills|expenses|vendor-credits|vendor-refunds|payments|bill-payments|write-offs|deposits|reports)\/[^/]+|reconcile\/(?!history\/?$)[^/]+|pay-bills)\/?$/
 
 export function hidesNewFab(pathname: string): boolean {
     return FAB_FREE_SCREEN.test(pathname)
````

- [ ] **Step 6: Write the list hook and the list component**

Create `tinycld/books/hooks/useBooksReportList.ts`:

````ts
import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useBooksReports } from './useBooksReports'

/**
 * The Books reports the reader can open, with the states a list of them draws. The Reports
 * section of the sidebar and the Books reports screen each call it: each is its own read,
 * so each has its own error and its own Retry.
 */
export function useBooksReportList() {
    const { reports, isReady, isError, recovery } = useBooksReports()
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.reports.list', err),
        })
    }
    return { reports, isLoading: !isReady && !isError, isError, retry }
}
````

Create `tinycld/books/components/reports/BooksReportList.tsx`:

````tsx
import { SidebarItem } from '@tinycld/core/components/sidebar-primitives'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useUrl } from '@tinycld/core/lib/use-url'
import { router } from 'expo-router'
import { BarChart3 } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { BooksReport } from '../../hooks/useBooksReports'
import {
    BOOKS_HUB_PARAMS,
    BOOKS_REPORT_BASE,
    BOOKS_REPORT_ROUTE,
    REPORTS_HUB_ROUTE,
} from '../../lib/books-report-route'

// Where the list is drawn. The two can be on screen together (the sidebar beside the Books
// reports screen), so each has its own test ids.
export type ReportListScope = 'sidebar' | 'screen'

const ID_PREFIX: Record<ReportListScope, { row: string; part: string }> = {
    sidebar: { row: 'books-sidebar-report', part: 'books-sidebar-reports' },
    screen: { row: 'books-reports-row', part: 'books-reports' },
}

function ReportsNote({
    isVisible,
    testID,
    text,
}: {
    isVisible: boolean
    testID: string
    text: string
}) {
    if (!isVisible) return null
    return (
        <Text testID={testID} className="px-3 py-2 text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

function ReportsError({
    isVisible,
    part,
    onRetry,
}: {
    isVisible: boolean
    part: string
    onRetry: () => void
}) {
    if (!isVisible) return null
    return (
        <View testID={`${part}-error`} className="flex-row items-center gap-2 px-3">
            <Text accessibilityRole="alert" className="flex-1 text-sm text-danger">
                Could not load the reports
            </Text>
            <Pressable
                testID={`${part}-retry`}
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

interface BooksReportListProps {
    isVisible: boolean
    scope: ReportListScope
    reports: readonly BooksReport[]
    isLoading: boolean
    isError: boolean
    onRetry: () => void
}

// The Books reports, or what stands in for them, then the row that opens core's Reports
// hub. That row is drawn in every state: the hub does its own read.
export function BooksReportList(props: BooksReportListProps) {
    const { isVisible, scope, reports, isLoading, isError, onRetry } = props
    const orgHref = useOrgHref()
    const { pathname } = useUrl()
    if (!isVisible) return null

    const { row, part } = ID_PREFIX[scope]
    const items = reports.map(report => (
        <SidebarItem
            key={report.id}
            label={report.title}
            isActive={pathname.endsWith(`/${BOOKS_REPORT_BASE}/${report.id}`)}
            closesDrawer
            onPress={() => router.navigate(orgHref(BOOKS_REPORT_ROUTE, { id: report.id }))}
            testID={`${row}-${report.id}`}
        />
    ))
    const isEmpty = !isLoading && !isError && reports.length === 0
    return (
        <>
            {items}
            <ReportsNote isVisible={isLoading} testID={`${part}-loading`} text="Loading…" />
            <ReportsNote isVisible={isEmpty} testID={`${part}-empty`} text="No reports" />
            <ReportsError isVisible={isError} part={part} onRetry={onRetry} />
            <SidebarItem
                label="All reports"
                icon={BarChart3}
                closesDrawer
                onPress={() => router.navigate(orgHref(REPORTS_HUB_ROUTE, BOOKS_HUB_PARAMS))}
                testID={`${part}-all`}
            />
        </>
    )
}
````

- [ ] **Step 7: Write the two route files**

Create `tinycld/books/screens/reports/[id].tsx`:

````tsx
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { ReportScreen } from '@tinycld/core/reports/screens/ReportScreen'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router, useLocalSearchParams } from 'expo-router'
import { Text, View } from 'react-native'
import { useBooksReportState } from '../../hooks/useBooksReportState'
import { BOOKS_REPORT_BASE } from '../../lib/books-report-route'

// A report of another package was opened on the Books route (a hand-written link). It is
// not drawn in Books; the person can open it where it belongs.
function NotBooksReport({ reportId }: { reportId: string }) {
    const orgHref = useOrgHref()
    return (
        <View
            testID="books-report-foreign"
            className="flex-1 items-center justify-center gap-3 bg-background p-6"
        >
            <Text className="text-base text-foreground">This report is not a Books report.</Text>
            <Button
                size="sm"
                variant="outline"
                testID="books-report-foreign-open"
                onPress={() => router.replace(orgHref('reports/[id]', { id: reportId }))}
            >
                <ButtonText>Open it in Reports</ButtonText>
            </Button>
        </View>
    )
}

/**
 * A Books report, in core's report view, on a Books route: the Books sidebar stays, and the
 * view's drill, Back and Save as links stay under `books/reports`.
 *
 * Edit runs core's report builder on this same route (`?edit=1`), and the builder keeps its
 * unsaved input in component state. So the view is drawn for every state but one: a loaded
 * row of another package. Do not put a loading, error or list check in front of it.
 */
export default function BooksReportRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const state = useBooksReportState(id)
    if (state === 'foreign') return <NotBooksReport reportId={id} />
    return <ReportScreen reportId={id} basePath={BOOKS_REPORT_BASE} />
}
````

Create `tinycld/books/screens/reports/index.tsx`:

````tsx
import { ScrollView, Text } from 'react-native'
import { BooksReportList } from '../../components/reports/BooksReportList'
import { useBooksReportList } from '../../hooks/useBooksReportList'
import { useFabClearanceStyle } from '../../lib/fab-clearance'

/**
 * `/a/books/reports`: the Books reports, inside Books. Core's report view opens this route
 * for Back when there is no history (a report opened from a link or after a reload), so
 * Back from a Books report always stays in Books.
 */
export default function BooksReportsScreen() {
    const list = useBooksReportList()
    // The phone New button floats over the scroller, so the last row needs room to clear it.
    const fabClearance = useFabClearanceStyle()
    return (
        <ScrollView
            testID="books-reports-screen"
            className="flex-1 bg-background"
            contentContainerClassName="gap-1 p-4"
            contentContainerStyle={fabClearance}
        >
            <Text accessibilityRole="header" className="px-3 text-xl font-semibold text-foreground">
                Reports
            </Text>
            <Text className="px-3 pb-2 text-sm text-muted-foreground">
                The Books reports you can open. To search, make or share a report, choose All
                reports.
            </Text>
            <BooksReportList
                isVisible
                scope="screen"
                reports={list.reports}
                isLoading={list.isLoading}
                isError={list.isError}
                onRetry={list.retry}
            />
        </ScrollView>
    )
}
````

The existing `package.json` export `"./screens/*"` covers both files.

- [ ] **Step 8: Generate the route files of the app shell**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run packages:generate`
Expected: ends with no error; `app/a/(app)/books/reports/[id].tsx` and `app/a/(app)/books/reports/index.tsx` exist in `/Users/nas/tmp/tinycld/books/tinycld` (gitignored output).

- [ ] **Step 9: Run the tests, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/books-report-route.test.tsx tests/books-reports-screen.test.tsx tests/shell-nav.test.ts`
Expected: PASS, no failed test.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/lib/books-report-route.ts tinycld/books/hooks/useBooksReportState.ts tinycld/books/hooks/useBooksReportList.ts tinycld/books/components/reports tinycld/books/screens/reports tinycld/books/lib/shell-nav.ts tests/books-report-route.test.tsx tests/books-reports-screen.test.tsx`
Expected: no error.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: no error. If the only error is `Property 'basePath' does not exist` at `screens/reports/[id].tsx`, core task 12 is not in the core checkout: STOP and report `BLOCKED: core task 12 (ReportScreen basePath) is not in /Users/nas/tmp/tinycld/books/tinycld`. Do not cast, do not drop the prop.

- [ ] **Step 10: Commit**

````bash
cd /Users/nas/tmp/tinycld/books/books
git add tinycld/books/lib/books-report-route.ts tinycld/books/hooks/useBooksReportState.ts tinycld/books/hooks/useBooksReportList.ts tinycld/books/components/reports/BooksReportList.tsx tests/books-reports-screen.test.tsx "tinycld/books/screens/reports/[id].tsx" tinycld/books/screens/reports/index.tsx tinycld/books/lib/shell-nav.ts tests/books-report-route.test.tsx
git commit -m "books: open reports on a Books route"
````

---

### Task 14: The Reports section of the sidebar

**Files:**
- Create: `tinycld/books/components/sidebar/ReportsSection.tsx`
- Modify: `tinycld/books/stores/books-ui-store.ts`
- Modify: `tinycld/books/sidebar.tsx`
- Modify: `tinycld/books/lib/shell-nav.ts` (the `reports` entry goes)
- Test: `tests/reports-section.test.tsx` (new), `tests/books-ui-store.test.ts`, `tests/books-sidebar.test.tsx`, `tests/shell-nav.test.ts`, `tests/shortcut-catalog.test.ts`

**Interfaces:**
- Consumes: task 13's `useBooksReportList()` and `BooksReportList` (with the scope `sidebar`), which build the Books report route and the hub link; part 2's `FoldHeading({ title, isOpen, onToggle, testID })`, `tests/sidebar-harness.tsx` (`seedSidebar`, `renderSidebar`, `SidebarProviders`, `idsWith`).
- Produces: `ReportsSection()` (no props); store fields `isReportsOpen: boolean` (false at first, persisted) and `toggleReports(): void`; test ids `books-sidebar-reports-toggle`, `books-sidebar-report-<report id>`, `books-sidebar-reports-all`, `books-sidebar-reports-loading`, `books-sidebar-reports-empty`, `books-sidebar-reports-error`, `books-sidebar-reports-retry`. `SIDEBAR_ENTRIES` has no `reports` entry and no element has the id `books-nav-reports`.

The section is closed at first: Books ships more reports than fit above "Go to". "All reports" is the last row in every open state, so the hub is reachable when the list is loading, empty or failed. After this task the e2e door `openBooksReports` still presses `books-nav-reports`; task 15 moves it. Do not run e2e between the two.

- [ ] **Step 1: Write the new test and change the four tests the entry's removal touches**


Create `tests/reports-section.test.tsx`:

````tsx
// @vitest-environment happy-dom
import { fireEvent, render, waitFor } from '@testing-library/react'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportsSection } from '../tinycld/books/components/sidebar/ReportsSection'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'
import { heldOnDemandStore } from './accounts-form-harness'
import { byTestId } from './accounts-test-rows'
import {
    BALANCE_SHEET,
    idsWith,
    MY_SALES,
    PROFIT_AND_LOSS,
    renderSidebar,
    type SeedReport,
    SidebarProviders,
    seedSidebar,
    ZOO_REPORT,
} from './sidebar-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

const url = vi.hoisted(() => ({ pathname: '/a/books/dashboard' }))

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: url.pathname, params: {}, href: url.pathname }),
}))
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The refused read is logged by pbtsdb on purpose.
silenceLog()

const ROW = 'books-sidebar-report-'
const ALL = 'books-sidebar-reports-all'

function toggle(container: HTMLElement) {
    return byTestId(container, 'books-sidebar-reports-toggle') as HTMLElement
}

// The Reports rows in document order: the report rows, then the All reports row.
function reportRows(container: HTMLElement) {
    return idsWith(container, 'books-sidebar-report').filter(id => id.startsWith(ROW) || id === ALL)
}

async function openRows(container: HTMLElement, count: number) {
    await waitFor(() => expect(idsWith(container, ROW)).toHaveLength(count))
}

beforeEach(() => {
    useBooksUIStore.setState({ isAccountingOpen: true, isNewOpen: false, isReportsOpen: true })
    url.pathname = '/a/books/dashboard'
    vi.mocked(router.navigate).mockClear()
})

describe('Reports section', () => {
    it('is folded until the user opens it, and the fold button says what a press does', () => {
        useBooksUIStore.setState({ isReportsOpen: false })
        seedSidebar()
        const { container } = renderSidebar()

        expect(toggle(container).getAttribute('accessibilitylabel')).toBe('Expand Reports')
        expect(reportRows(container)).toEqual([])

        fireEvent.click(toggle(container))

        expect(toggle(container).getAttribute('accessibilitylabel')).toBe('Collapse Reports')
        expect(useBooksUIStore.getState().isReportsOpen).toBe(true)
        expect(reportRows(container)).toContain(ALL)
    })

    it('lists the Books reports, shipped first, then All reports, and no report of another package', async () => {
        seedSidebar({ reports: [MY_SALES, ZOO_REPORT, PROFIT_AND_LOSS, BALANCE_SHEET] })
        const { container } = renderSidebar()
        await openRows(container, 3)

        expect(reportRows(container)).toEqual([
            `${ROW}${BALANCE_SHEET.id}`,
            `${ROW}${PROFIT_AND_LOSS.id}`,
            `${ROW}${MY_SALES.id}`,
            ALL,
        ])
        expect(byTestId(container, `${ROW}${MY_SALES.id}`)?.textContent).toBe('My sales by month')
        expect(byTestId(container, ALL)?.textContent).toBe('All reports')
    })

    it('sits between the New section and the fixed navigation', async () => {
        seedSidebar()
        const { container } = renderSidebar()
        await openRows(container, 2)

        const before = (first: string, second: string) =>
            (byTestId(container, first) as HTMLElement).compareDocumentPosition(
                byTestId(container, second) as HTMLElement
            ) & Node.DOCUMENT_POSITION_FOLLOWING
        expect(before('books-sidebar-new-toggle', 'books-sidebar-reports-toggle')).toBeTruthy()
        expect(before(ALL, 'books-nav-dashboard')).toBeTruthy()
        expect(byTestId(container, 'books-nav-reports')).toBeNull()
    })

    it('opens a report on the Books route and All reports on the hub with the Books filter', async () => {
        seedSidebar()
        const { container } = renderSidebar()
        await openRows(container, 2)

        fireEvent.click(byTestId(container, `${ROW}${PROFIT_AND_LOSS.id}`) as HTMLElement)
        fireEvent.click(byTestId(container, ALL) as HTMLElement)

        expect(vi.mocked(router.navigate).mock.calls.map(call => call[0])).toEqual([
            { pathname: '/a/books/reports/[id]', params: { id: PROFIT_AND_LOSS.id } },
            { pathname: '/a/reports', params: { package: 'books' } },
        ])
    })

    it('marks the report that is open, and no other row', async () => {
        url.pathname = `/a/books/reports/${BALANCE_SHEET.id}`
        seedSidebar()
        const { container } = renderSidebar()
        await openRows(container, 2)

        const isMarked = (id: string) =>
            byTestId(container, id)
                ?.querySelector('rn-text')
                ?.getAttribute('class')
                ?.includes('font-semibold')
        expect(isMarked(`${ROW}${BALANCE_SHEET.id}`)).toBe(true)
        expect(isMarked(`${ROW}${PROFIT_AND_LOSS.id}`)).toBe(false)
        expect(isMarked(ALL)).toBe(false)
    })

    it('shows the section to a reader', async () => {
        seedSidebar({ level: 'read_only' })
        const { container } = renderSidebar()
        await openRows(container, 2)

        expect(byTestId(container, 'books-sidebar-new-toggle')).toBeNull()
        expect(reportRows(container)).toHaveLength(3)
    })

    it('says so when there is no Books report, and still offers All reports', async () => {
        seedSidebar({ reports: [ZOO_REPORT] })
        const { container } = renderSidebar()

        await waitFor(() =>
            expect(byTestId(container, 'books-sidebar-reports-empty')?.textContent).toBe(
                'No reports'
            )
        )
        expect(reportRows(container)).toEqual([ALL])
    })

    it('shows Loading while the reports load', async () => {
        seedSidebar()
        const store = heldOnDemandStore<SeedReport>('reports', [PROFIT_AND_LOSS])
        store.hold()
        const { container } = renderSidebar()

        await waitFor(() =>
            expect(byTestId(container, 'books-sidebar-reports-loading')).not.toBeNull()
        )
        expect(byTestId(container, 'books-sidebar-reports-empty')).toBeNull()
        expect(reportRows(container)).toEqual([ALL])

        store.release()

        await openRows(container, 1)
        expect(byTestId(container, 'books-sidebar-reports-loading')).toBeNull()
    })

    it('shows an error with Retry, not an empty list, when the reports cannot be read', async () => {
        seedSidebar()
        const store = heldOnDemandStore<SeedReport>('reports', [PROFIT_AND_LOSS], {
            refuseFirstLoad: true,
        })
        expectLiveQueryError(store.id)
        // The section alone: the store refuses one load, and in the whole sidebar the
        // Shortcuts section's own read of the reports would take the refusal.
        const { container } = render(<ReportsSection />, { wrapper: SidebarProviders })

        await waitFor(() =>
            expect(byTestId(container, 'books-sidebar-reports-error')).not.toBeNull()
        )
        expect(byTestId(container, 'books-sidebar-reports-empty')).toBeNull()
        expect(reportRows(container)).toEqual([ALL])

        fireEvent.click(byTestId(container, 'books-sidebar-reports-retry') as HTMLElement)

        await openRows(container, 1)
        expect(byTestId(container, 'books-sidebar-reports-error')).toBeNull()
    })
})
````

Apply to `tests/books-ui-store.test.ts`:

````diff
--- a/tests/books-ui-store.test.ts
+++ b/tests/books-ui-store.test.ts
@@ -3,7 +3,11 @@
 
 describe('useBooksUIStore', () => {
     beforeEach(() => {
-        useBooksUIStore.setState({ isAccountingOpen: true, isNewOpen: false })
+        useBooksUIStore.setState({
+            isAccountingOpen: true,
+            isNewOpen: false,
+            isReportsOpen: false,
+        })
     })
 
     it('starts with the accounting group open', () => {
@@ -29,11 +33,23 @@
         expect(useBooksUIStore.getState().isNewOpen).toBe(true)
     })
 
-    it('persists the two fold states under tinycld_books_ui', () => {
+    it('starts with the Reports section closed; toggleReports flips it', () => {
+        expect(useBooksUIStore.getState().isReportsOpen).toBe(false)
+        useBooksUIStore.getState().toggleReports()
+        expect(useBooksUIStore.getState().isReportsOpen).toBe(true)
+        useBooksUIStore.getState().toggleReports()
+        expect(useBooksUIStore.getState().isReportsOpen).toBe(false)
+    })
+
+    it('persists the three fold states under tinycld_books_ui', () => {
         const options = useBooksUIStore.persist.getOptions()
         expect(options.name).toBe('tinycld_books_ui')
         useBooksUIStore.getState().toggleAccounting()
         const partial = options.partialize?.(useBooksUIStore.getState())
-        expect(partial).toEqual({ isAccountingOpen: false, isNewOpen: false })
+        expect(partial).toEqual({
+            isAccountingOpen: false,
+            isNewOpen: false,
+            isReportsOpen: false,
+        })
     })
 })
````

Apply to `tests/books-sidebar.test.tsx`:

````diff
--- a/tests/books-sidebar.test.tsx
+++ b/tests/books-sidebar.test.tsx
@@ -27,7 +27,6 @@
             'sales',
             'expenses',
             'lists',
-            'reports',
         ])
         expect(result.current.accounting.map(e => e.id)).toEqual([
             'accounts',
@@ -36,8 +35,9 @@
         ])
     })
 
-    // The real entries, not allAvailable: Reports must be available on its own.
-    it('with the real entries, top is Dashboard, Banking, Sales, Expenses, Lists then Reports, and Reports opens the Books hub', () => {
+    // Reports is a section of the sidebar (components/sidebar/ReportsSection.tsx), not an
+    // entry of the fixed navigation.
+    it('with the real entries, top is Dashboard, Banking, Sales, Expenses then Lists, with no Reports entry', () => {
         const { result } = renderHook(() => useBooksSidebar())
         expect(result.current.top.map(e => e.id)).toEqual([
             'dashboard',
@@ -45,10 +45,8 @@
             'sales',
             'expenses',
             'lists',
-            'reports',
         ])
-        const reports = result.current.top.find(e => e.id === 'reports')
-        expect(reports).toMatchObject({ href: 'reports', params: { package: 'books' } })
+        expect(SIDEBAR_ENTRIES.some(e => e.id === 'reports')).toBe(false)
     })
 
     it('returns an empty accounting list when no accounting entry is available', () => {
@@ -63,7 +61,6 @@
             'sales',
             'expenses',
             'lists',
-            'reports',
         ])
     })
 
@@ -78,7 +75,6 @@
             'sales',
             'expenses',
             'lists',
-            'reports',
         ])
         expect(result.current.accounting.map(e => e.id)).toEqual([
             'accounts',
````

Apply to `tests/shell-nav.test.ts`:

````diff
--- a/tests/shell-nav.test.ts
+++ b/tests/shell-nav.test.ts
@@ -434,7 +434,6 @@
             'sales',
             'expenses',
             'lists',
-            'reports',
         ])
     })
 
@@ -468,7 +467,6 @@
             'sales',
             'expenses',
             'lists',
-            'reports',
         ])
         for (const item of [...NEW_ACTIONS, ...LIST_ENTRIES]) {
             expect(item.id).not.toBe('banking')
@@ -653,34 +651,13 @@
     })
 })
 
+// The Books reports are a section of the sidebar (components/sidebar/ReportsSection.tsx);
+// the fixed navigation has no Reports entry, so a screen shortcut cannot name it.
 describe('reports sidebar entry', () => {
-    function reportsEntry(): SidebarEntry {
-        const reports = SIDEBAR_ENTRIES.find(e => e.id === 'reports')
-        if (!reports) throw new Error('SIDEBAR_ENTRIES has no reports entry')
-        return reports
-    }
-
-    it("opens core's Reports hub filtered to Books", () => {
-        expect(reportsEntry()).toMatchObject({
-            label: 'Reports',
-            href: 'reports',
-            params: { package: 'books' },
-        })
-    })
-
-    it('is always available and in the top group', () => {
-        const reports = reportsEntry()
-        expect(reports.available).toBe(true)
-        expect(reports.group).toBeUndefined()
-        expect(sidebarSections(availableOnly(SIDEBAR_ENTRIES)).top.map(e => e.id)).toContain(
-            'reports'
-        )
+    it('is not in the fixed navigation', () => {
+        expect(SIDEBAR_ENTRIES.some(e => e.id === 'reports')).toBe(false)
+        expect(SIDEBAR_ENTRIES.some(e => e.href === 'reports')).toBe(false)
     })
-
-    it('sits right after lists', () => {
-        const ids = SIDEBAR_ENTRIES.map(e => e.id)
-        expect(ids.indexOf('reports')).toBe(ids.indexOf('lists') + 1)
-    })
 })
 
 describe('registry integrity', () => {
````

Apply to `tests/shortcut-catalog.test.ts`:

````diff
--- a/tests/shortcut-catalog.test.ts
+++ b/tests/shortcut-catalog.test.ts
@@ -142,6 +142,8 @@
 
     it('has no target for a ref it does not know, a report or a register', () => {
         expect(staticTarget({ kind: 'screen', ref: 'payroll' }, true)).toBeNull()
+        // The Reports entry left the fixed navigation: a stored shortcut to it opens nothing.
+        expect(staticTarget({ kind: 'screen', ref: 'reports' }, true)).toBeNull()
         expect(staticTarget({ kind: 'new', ref: 'paycheck' }, true)).toBeNull()
         expect(staticTarget({ kind: 'report', ref: 'books.balance_sheet' }, true)).toBeNull()
         expect(staticTarget({ kind: 'register', ref: 'customers' }, true)).toBeNull()
````

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/reports-section.test.tsx tests/books-ui-store.test.ts tests/books-sidebar.test.tsx tests/shell-nav.test.ts tests/shortcut-catalog.test.ts`
Expected: FAIL: `reports-section.test.tsx` cannot resolve `../tinycld/books/components/sidebar/ReportsSection`; the changed cases of the other four files fail (the `reports` entry is still there, the store has no `isReportsOpen`).

- [ ] **Step 3: Add the fold state to the store**

Apply to `tinycld/books/stores/books-ui-store.ts`:

````diff
--- a/tinycld/books/stores/books-ui-store.ts
+++ b/tinycld/books/stores/books-ui-store.ts
@@ -8,6 +8,9 @@
     toggleNew: () => void
     // Opens the New section and never closes it: the phone's New button calls this.
     openNew: () => void
+    // The Reports section of the sidebar. Closed until the user opens it.
+    isReportsOpen: boolean
+    toggleReports: () => void
 }
 
 export const useBooksUIStore = create<BooksUIState>()(
@@ -24,11 +27,19 @@
             openNew: () => {
                 set({ isNewOpen: true })
             },
+            isReportsOpen: false,
+            toggleReports: () => {
+                set(s => ({ isReportsOpen: !s.isReportsOpen }))
+            },
         }),
         {
             name: 'tinycld_books_ui',
             storage: asyncStorage,
-            partialize: s => ({ isAccountingOpen: s.isAccountingOpen, isNewOpen: s.isNewOpen }),
+            partialize: s => ({
+                isAccountingOpen: s.isAccountingOpen,
+                isNewOpen: s.isNewOpen,
+                isReportsOpen: s.isReportsOpen,
+            }),
         }
     )
 )
````

- [ ] **Step 4: Write the section**

Create `tinycld/books/components/sidebar/ReportsSection.tsx`:

````tsx
import { useBooksReportList } from '../../hooks/useBooksReportList'
import { useBooksUIStore } from '../../stores/books-ui-store'
import { BooksReportList } from '../reports/BooksReportList'
import { FoldHeading } from './FoldHeading'

// The Reports section of the Books sidebar: every Books report the reader can open, the
// shipped ones first, each on the Books report route. Folded until the user opens it (the
// state is kept): Books ships more reports than the sidebar has room for above "Go to".
export function ReportsSection() {
    const list = useBooksReportList()
    const isOpen = useBooksUIStore(s => s.isReportsOpen)
    const toggle = useBooksUIStore(s => s.toggleReports)

    return (
        <>
            <FoldHeading
                title="Reports"
                isOpen={isOpen}
                onToggle={toggle}
                testID="books-sidebar-reports-toggle"
            />
            <BooksReportList
                isVisible={isOpen}
                scope="sidebar"
                reports={list.reports}
                isLoading={list.isLoading}
                isError={list.isError}
                onRetry={list.retry}
            />
        </>
    )
}
````

- [ ] **Step 5: Draw the section and remove the fixed Reports entry**

Apply to `tinycld/books/sidebar.tsx`:

````diff
--- a/tinycld/books/sidebar.tsx
+++ b/tinycld/books/sidebar.tsx
@@ -7,6 +7,7 @@
 import { router } from 'expo-router'
 import { FoldHeading } from './components/sidebar/FoldHeading'
 import { NewSection } from './components/sidebar/NewSection'
+import { ReportsSection } from './components/sidebar/ReportsSection'
 import { ShortcutsSection } from './components/sidebar/ShortcutsSection'
 import { useBooksSidebar } from './hooks/useBooksSidebar'
 import type { SidebarEntry } from './lib/shell-nav'
@@ -29,8 +30,8 @@
     )
 }
 
-// The Books sidebar, top to bottom: the user's Shortcuts, the New actions, then the fixed
-// navigation under "Go to". The same component is the desktop sidebar and the phone drawer.
+// The Books sidebar, top to bottom: the user's Shortcuts, the New actions, the Books
+// reports, then the fixed navigation under "Go to". The same component is the desktop sidebar and the phone drawer.
 export default function BooksSidebar() {
     const {
         top,
@@ -62,6 +63,7 @@
         <SidebarNav>
             <ShortcutsSection />
             <NewSection />
+            <ReportsSection />
             <SidebarHeading>Go to</SidebarHeading>
             {topItems}
             <AccountingHeading
````

Apply to `tinycld/books/lib/shell-nav.ts`:

````diff
--- a/tinycld/books/lib/shell-nav.ts
+++ b/tinycld/books/lib/shell-nav.ts
@@ -1,6 +1,5 @@
 import type { LucideIcon } from 'lucide-react-native'
 import {
-    BarChart3,
     BookOpen,
     FileText,
     Landmark,
@@ -85,14 +84,6 @@
     },
     { id: 'lists', label: 'Lists', icon: List, href: 'books/lists', available: true },
     {
-        id: 'reports',
-        label: 'Reports',
-        icon: BarChart3,
-        href: 'reports',
-        params: { package: 'books' },
-        available: true,
-    },
-    {
         id: 'accounts',
         label: 'Chart of Accounts',
         icon: BookOpen,
````

`params?` stays on the `SidebarEntry` type: `sidebar.tsx` and the shortcut catalog still read it.

- [ ] **Step 6: Run the tests, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/reports-section.test.tsx tests/books-ui-store.test.ts tests/books-sidebar.test.tsx tests/shell-nav.test.ts tests/shortcut-catalog.test.ts tests/shortcuts-section.test.tsx tests/new-section.test.tsx tests/books-sidebar-render.test.tsx`
Expected: PASS, no failed test.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/components/sidebar/ReportsSection.tsx tinycld/books/stores/books-ui-store.ts tinycld/books/sidebar.tsx tinycld/books/lib/shell-nav.ts tests/reports-section.test.tsx tests/books-ui-store.test.ts tests/books-sidebar.test.tsx tests/shell-nav.test.ts tests/shortcut-catalog.test.ts`
Expected: no error.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: no error.

- [ ] **Step 7: Commit**

````bash
cd /Users/nas/tmp/tinycld/books/books
git add tinycld/books/components/sidebar/ReportsSection.tsx tinycld/books/stores/books-ui-store.ts tinycld/books/sidebar.tsx tinycld/books/lib/shell-nav.ts tests/reports-section.test.tsx tests/books-ui-store.test.ts tests/books-sidebar.test.tsx tests/shell-nav.test.ts tests/shortcut-catalog.test.ts
git commit -m "books: Reports section in the sidebar"
````

---

### Task 15: Books report links and the e2e door open the Books route

**Files:**
- Modify: `tinycld/books/hooks/useShippedReportHref.ts`
- Test: `tests/shortcut-rows.test.ts`, `tests/shortcuts-section.test.tsx`
- Modify (e2e, one to five lines each): `tests/e2e/books-report-helpers.ts`, `tests/e2e/books-ap-aging.spec.ts`, `tests/e2e/books-expenses-by-vendor.spec.ts`, `tests/e2e/books-report-1099.spec.ts`, `tests/e2e/books-vendor-balance.spec.ts`, `tests/e2e/books-sales-tax-liability.spec.ts`, `tests/e2e/dashboard.spec.ts`, `tests/e2e/reconcile-history.spec.ts`, `tests/e2e/reconciliation-report.spec.ts`

**Interfaces:**
- Consumes: task 13's `BOOKS_REPORT_ROUTE`; task 14's test ids `books-sidebar-reports-toggle` and `books-sidebar-reports-all`.
- Produces: `shippedReportHref(orgHref, id, params)` returns the href of `books/reports/[id]` (same signature as before). E2E helper `openReportsSection(page: Page): Promise<void>` in `tests/e2e/books-report-helpers.ts` (opens the Reports fold when it is closed; the sidebar must be on screen); `openBooksReports(page)` keeps its signature and reaches the hub through "All reports".

Every Books link to a report already goes through `shippedReportHref` (the customer, vendor and product lists, the dashboard widgets, the Taxes page, the 1099 section, Reconcile, Reconcile history, the shortcut rows), so one change moves them all. A report opened from core's hub stays on core's route (`/a/reports/<id>`); the specs that open a report from the hub keep their URL checks.

- [ ] **Step 1: Change the two unit tests**


Apply to `tests/shortcut-rows.test.ts`:

````diff
--- a/tests/shortcut-rows.test.ts
+++ b/tests/shortcut-rows.test.ts
@@ -60,10 +60,10 @@
                 '1000 Business Checking',
                 { pathname: '/a/books/accounts/[id]', params: { id: 'acct1' } },
             ],
-            ['Profit and Loss', { pathname: '/a/reports/[id]', params: { id: 'rpt1' } }],
+            ['Profit and Loss', { pathname: '/a/books/reports/[id]', params: { id: 'rpt1' } }],
             ['New invoice', '/a/books/invoices/new'],
             ['Customers', '/a/books/customers'],
-            ['My sales', { pathname: '/a/reports/[id]', params: { id: 'rpt2' } }],
+            ['My sales', { pathname: '/a/books/reports/[id]', params: { id: 'rpt2' } }],
             ['Petty cash', { pathname: '/a/books/accounts/[id]', params: { id: 'acct2' } }],
         ])
         expect(drawn.map(row => row.key)).toEqual([
````

Apply to `tests/shortcuts-section.test.tsx`:

````diff
--- a/tests/shortcuts-section.test.tsx
+++ b/tests/shortcuts-section.test.tsx
@@ -84,7 +84,7 @@
 
         expect(vi.mocked(router.navigate).mock.calls.map(call => call[0])).toEqual([
             '/a/books/vendors',
-            { pathname: '/a/reports/[id]', params: { id: BALANCE_SHEET.id } },
+            { pathname: '/a/books/reports/[id]', params: { id: BALANCE_SHEET.id } },
         ])
     })
 
````

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/shortcut-rows.test.ts tests/shortcuts-section.test.tsx`
Expected: FAIL: three cases still receive the pathname `/a/reports/[id]`.

- [ ] **Step 3: Build the Books route in `shippedReportHref`**

Apply to `tinycld/books/hooks/useShippedReportHref.ts`:

````diff
--- a/tinycld/books/hooks/useShippedReportHref.ts
+++ b/tinycld/books/hooks/useShippedReportHref.ts
@@ -2,6 +2,7 @@
 import { useLiveQuery } from '@tanstack/react-db'
 import { useOrgHref } from '@tinycld/core/lib/org-routes'
 import { useStore } from '@tinycld/core/lib/pocketbase'
+import { BOOKS_REPORT_ROUTE } from '../lib/books-report-route'
 import { reportParamQuery } from '../lib/shipped-reports'
 
 type OrgHref = ReturnType<typeof useOrgHref>
@@ -26,10 +27,11 @@
     return data?.id ?? null
 }
 
-// The report's route with each param written as core's report view reads it
-// (`?p-<param id>=<value>`), so the report opens with those filters set.
+// The report's Books route (the report opens inside Books, with the Books sidebar) with
+// each param written as core's report view reads it (`?p-<param id>=<value>`), so the
+// report opens with those filters set.
 export function shippedReportHref(orgHref: OrgHref, id: string, params: Record<string, string>) {
-    return orgHref('reports/[id]', { id, ...reportParamQuery(params) })
+    return orgHref(BOOKS_REPORT_ROUTE, { id, ...reportParamQuery(params) })
 }
 
 // The href of the shipped report with this key, opened with `params` set. Null while it
````

- [ ] **Step 4: Run the unit tests**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/shortcut-rows.test.ts tests/shortcuts-section.test.tsx tests/reports-section.test.tsx tests/dashboard`
Expected: PASS, no failed test.

- [ ] **Step 5: Move the e2e door and the e2e URL checks**

The door first: `openBooksReports` opens the Reports section and presses "All reports".

Apply to `tests/e2e/books-report-helpers.ts`:

````diff
--- a/tests/e2e/books-report-helpers.ts
+++ b/tests/e2e/books-report-helpers.ts
@@ -25,8 +25,10 @@
 import { isPhone, swipeFromLeftEdge } from './account-register-helpers'
 import { fillLine, type LineInput, openNewEntry, postOpenEntry } from './journal-entries-helpers'
 
-// Books' reports run in core's report view (/a/reports/<id>). These helpers drive it
-// through core's test ids (core/reports/components) and read it in one snapshot.
+// Books' reports run in core's report view: on the Books route (/a/books/reports/<id>) when
+// a Books link or the Books sidebar opens one, on core's route (/a/reports/<id>) when the
+// Reports hub does. These helpers drive the view through core's test ids
+// (core/reports/components) and read it in one snapshot.
 
 export type AsOfPreset = 'today' | 'endOfLastMonth' | 'endOfLastQuarter' | 'endOfLastFiscalYear'
 
@@ -150,18 +152,26 @@
     await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)
 }
 
-// Core's Reports hub filtered to Books, reached the way a user does: Reports in the Books
-// sidebar (on a phone, in the Books menu, the drawer). Open Books at the desktop viewport
-// first when the page is a phone: navigateToPackage clicks the desktop rail.
+// Opens the Reports section of the Books sidebar and leaves it open. The sidebar must be on
+// screen (on a phone: the Books menu, the drawer). The fold state is kept across screens
+// and reloads, so this opens a folded section and never presses the fold button of an open one.
+export async function openReportsSection(page: Page): Promise<void> {
+    const toggle = page.getByTestId('books-sidebar-reports-toggle').filter({ visible: true })
+    await toggle.waitFor()
+    if ((await toggle.getAttribute('aria-label')) === 'Expand Reports') await toggle.click()
+    await expect(toggle).toHaveAttribute('aria-label', 'Collapse Reports')
+}
+
+// Core's Reports hub filtered to Books, reached the way a user does: All reports in the
+// Reports section of the Books sidebar (on a phone, in the Books menu, the drawer). Open
+// Books at the desktop viewport first when the page is a phone: navigateToPackage clicks
+// the desktop rail.
 export async function openBooksReports(page: Page): Promise<void> {
     await navigateToPackage(page, 'books')
     const width = page.viewportSize()?.width ?? Number.POSITIVE_INFINITY
-    let reports = page.getByTestId('books-nav-reports')
-    if (width <= MOBILE_MAX_WIDTH) {
-        await openBooksMenu(page)
-        reports = page.getByTestId('mobile-drawer-panel').getByTestId('books-nav-reports')
-    }
-    await reports.click()
+    if (width <= MOBILE_MAX_WIDTH) await openBooksMenu(page)
+    await openReportsSection(page)
+    await page.getByTestId('books-sidebar-reports-all').filter({ visible: true }).click()
     await expect(page).toHaveURL(/\/a\/reports\?package=books/)
     await page.getByTestId('reports-hub').waitFor()
 }
````

Apply to `tests/e2e/books-ap-aging.spec.ts`:

````diff
--- a/tests/e2e/books-ap-aging.spec.ts
+++ b/tests/e2e/books-ap-aging.spec.ts
@@ -340,7 +340,7 @@
         await expect(aging).toHaveText('A/P Aging')
         await aging.click()
         await expect(page.getByTestId('report-screen')).toBeVisible()
-        await expect(page).toHaveURL(/\/a\/reports\//)
+        await expect(page).toHaveURL(/\/a\/books\/reports\//)
         await expect(
             page.getByTestId('report-document-title').filter({ visible: true })
         ).toHaveText(AP_AGING_TITLE)
````

Apply to `tests/e2e/books-expenses-by-vendor.spec.ts`:

````diff
--- a/tests/e2e/books-expenses-by-vendor.spec.ts
+++ b/tests/e2e/books-expenses-by-vendor.spec.ts
@@ -673,7 +673,7 @@
             ])
         await expenses.click()
         await expect(page.getByTestId('report-screen')).toBeVisible()
-        await expect(page).toHaveURL(/\/a\/reports\//)
+        await expect(page).toHaveURL(/\/a\/books\/reports\//)
         await expect(
             page.getByTestId('report-document-title').filter({ visible: true })
         ).toHaveText(EXPENSES_BY_VENDOR_TITLE)
````

Apply to `tests/e2e/books-report-1099.spec.ts`:

````diff
--- a/tests/e2e/books-report-1099.spec.ts
+++ b/tests/e2e/books-report-1099.spec.ts
@@ -682,7 +682,7 @@
         await expect(form1099).toHaveText(REPORT_1099_TITLE)
         await form1099.click()
         await expect(page.getByTestId('report-screen')).toBeVisible()
-        await expect(page).toHaveURL(/\/a\/reports\//)
+        await expect(page).toHaveURL(/\/a\/books\/reports\//)
         await expect(
             page.getByTestId('report-document-title').filter({ visible: true })
         ).toHaveText(REPORT_1099_TITLE)
@@ -728,7 +728,7 @@
         await expect(open).toContainText('Open the 1099 report')
         await open.click()
         await expect(page.getByTestId('report-screen')).toBeVisible()
-        await expect(page).toHaveURL(/\/a\/reports\//)
+        await expect(page).toHaveURL(/\/a\/books\/reports\//)
         await expect(
             page.getByTestId('report-document-title').filter({ visible: true })
         ).toHaveText(REPORT_1099_TITLE)
````

Apply to `tests/e2e/books-vendor-balance.spec.ts`:

````diff
--- a/tests/e2e/books-vendor-balance.spec.ts
+++ b/tests/e2e/books-vendor-balance.spec.ts
@@ -405,7 +405,7 @@
             .toBe(true)
         await balance.click()
         await expect(page.getByTestId('report-screen')).toBeVisible()
-        await expect(page).toHaveURL(/\/a\/reports\//)
+        await expect(page).toHaveURL(/\/a\/books\/reports\//)
         await expect(
             page.getByTestId('report-document-title').filter({ visible: true })
         ).toHaveText(VENDOR_BALANCE_TITLE)
````

Apply to `tests/e2e/books-sales-tax-liability.spec.ts`:

````diff
--- a/tests/e2e/books-sales-tax-liability.spec.ts
+++ b/tests/e2e/books-sales-tax-liability.spec.ts
@@ -253,7 +253,7 @@
     await expectPhoneLines(page, rowOfKind(snapshot, 'subtotal', `Total ${LODGING}`).id)
 }
 
-const REPORT_URL = /\/a\/reports\/[a-z0-9]{15}(\?|$)/
+const REPORT_URL = /\/a\/books\/reports\/[a-z0-9]{15}(\?|$)/
 
 // A press on the Sales tax page's Liability report button, then the report screen.
 async function pressLiabilityReport(page: Page) {
````

Apply to `tests/e2e/dashboard.spec.ts`:

````diff
--- a/tests/e2e/dashboard.spec.ts
+++ b/tests/e2e/dashboard.spec.ts
@@ -219,7 +219,8 @@
         ['sales', 'dashboard-sales-report'],
     ]) {
         const link = widget(page, id).getByTestId(testId)
-        if ((await link.count()) > 0) await expect(link).toHaveAttribute('href', /\/reports\//)
+        if ((await link.count()) > 0)
+            await expect(link).toHaveAttribute('href', /\/books\/reports\//)
     }
 }
 
@@ -268,7 +269,8 @@
         await expect(invoicesPart(page, 'unpaid')).toHaveText(MONEY)
         await expect(invoicesPart(page, 'view')).toHaveAttribute('href', /\/books\/invoices$/)
         const aging = invoicesPart(page, 'aging')
-        if ((await aging.count()) > 0) await expect(aging).toHaveAttribute('href', /\/reports\//)
+        if ((await aging.count()) > 0)
+            await expect(aging).toHaveAttribute('href', /\/books\/reports\//)
         const deposit = invoicesPart(page, 'deposit')
         if ((await deposit.count()) > 0) {
             expect(await deposit.evaluate(el => el.tagName)).toBe('A')
@@ -508,7 +510,7 @@
         const lastDay = endOfLastMonth(today)
         const firstDay = `${lastDay.slice(0, 8)}01`
         await widget(page, 'profitAndLoss').getByTestId('dashboard-pnl-report').click()
-        await expect(page).toHaveURL(/\/reports\/[^/?]+\?/)
+        await expect(page).toHaveURL(/\/books\/reports\/[^/?]+\?/)
         expect(new URL(page.url()).searchParams.get('p-period')).toBe(`${firstDay}..${lastDay}`)
         await expect(page.getByTestId('report-title').filter({ visible: true })).toBeVisible()
 
````

Apply to `tests/e2e/reconcile-history.spec.ts`:

````diff
--- a/tests/e2e/reconcile-history.spec.ts
+++ b/tests/e2e/reconcile-history.spec.ts
@@ -77,7 +77,9 @@
 }
 
 function reportUrlOf(reconciliationId: string): RegExp {
-    return new RegExp(`/a/reports/[a-z0-9]{15}\\?(?:.*&)?p-statement=${reconciliationId}(?:&|$)`)
+    return new RegExp(
+        `/a/books/reports/[a-z0-9]{15}\\?(?:.*&)?p-statement=${reconciliationId}(?:&|$)`
+    )
 }
 
 function summaryUrlOf(reconciliationId: string): RegExp {
````

Apply to `tests/e2e/reconciliation-report.spec.ts`:

````diff
--- a/tests/e2e/reconciliation-report.spec.ts
+++ b/tests/e2e/reconciliation-report.spec.ts
@@ -32,7 +32,9 @@
 }
 
 function reportUrlOf(reconciliationId: string): RegExp {
-    return new RegExp(`/a/reports/[a-z0-9]{15}\\?(?:.*&)?p-statement=${reconciliationId}(?:&|$)`)
+    return new RegExp(
+        `/a/books/reports/[a-z0-9]{15}\\?(?:.*&)?p-statement=${reconciliationId}(?:&|$)`
+    )
 }
 
 test.describe('reconciliation-report: report', () => {
````

Then confirm that no spec still expects core's route after a Books link:

Run: `cd /Users/nas/tmp/tinycld/books/books && command grep -nF 'toHaveURL(/\/a\/reports\/' tests/e2e/*.spec.ts | command grep -m 20 ''`
Expected: prints nothing.

- [ ] **Step 6: Run the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/hooks/useShippedReportHref.ts tests/shortcut-rows.test.ts tests/shortcuts-section.test.tsx tests/e2e/books-report-helpers.ts tests/e2e/books-ap-aging.spec.ts tests/e2e/books-expenses-by-vendor.spec.ts tests/e2e/books-report-1099.spec.ts tests/e2e/books-vendor-balance.spec.ts tests/e2e/books-sales-tax-liability.spec.ts tests/e2e/dashboard.spec.ts tests/e2e/reconcile-history.spec.ts tests/e2e/reconciliation-report.spec.ts`
Expected: no error.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: no error.

- [ ] **Step 7: Commit**

The e2e files of this task run in tasks 18 and 19's command.

````bash
cd /Users/nas/tmp/tinycld/books/books
git add tinycld/books/hooks/useShippedReportHref.ts tests/shortcut-rows.test.ts tests/shortcuts-section.test.tsx tests/e2e/books-report-helpers.ts tests/e2e/books-ap-aging.spec.ts tests/e2e/books-expenses-by-vendor.spec.ts tests/e2e/books-report-1099.spec.ts tests/e2e/books-vendor-balance.spec.ts tests/e2e/books-sales-tax-liability.spec.ts tests/e2e/dashboard.spec.ts tests/e2e/reconcile-history.spec.ts tests/e2e/reconciliation-report.spec.ts
git commit -m "books: report links open the Books report route"
````

---

### Task 16: Books settings sections, one panel and two entry points (outline tasks 16 and 17)

**Files:**
- Create: `tinycld/books/components/settings/SectionPanel.tsx`
- Modify: `tinycld/books/lib/settings-sections.ts`
- Modify: `tinycld/books/components/settings/SettingsShell.tsx`
- Create: `tinycld/books/settings/company.tsx`, `accounting.tsx`, `sales.tsx`, `purchases.tsx`, `numbering.tsx`, `form-1099.tsx`, `access.tsx` (five lines each)
- Modify: `manifest.ts` (`settings`), `package.json` (`./settings/*` export)
- Test: `tests/section-panel.test.tsx`, `tests/settings-panels.test.ts`

The task has two halves with a commit each: A, the panel (steps 1 to 7), and B, the panels in core Settings (steps B1 to B7).

**Interfaces:**
- Consumes: `SectionBody({ section: SectionId, isAdmin: boolean })`, `useBooksAccess()` (`{ canRead, isAdmin, isReady, isError, retry }`), `useBooksSettings()` (`{ settings, isReady, hasLoadError, retryLoad }`), `SETTINGS_SECTIONS`, `SectionId`; part 2's `SidebarProviders` (a query client and the overlay provider for tests).
- Produces: `type SectionPanelState = 'loading' | 'error' | 'no-access' | 'admin-only' | 'body'`, `sectionPanelState(section: SectionId, reads): SectionPanelState` and `keepsSectionBody(state: SectionPanelState, wasDrawn: boolean): boolean` in `lib/settings-sections.ts`; `SectionPanel({ section: SectionId })` and `SectionPanelScreen({ section: SectionId })` in `components/settings/SectionPanel.tsx`; test ids `books-settings-panel` (the scroller of `SectionPanelScreen`), `books-settings-panel-error`, `books-settings-panel-retry`, `books-settings-panel-no-access`, `books-settings-panel-admin-only`.

The outline names the type `SettingsSectionId`; the code's name is `SectionId` (`lib/settings-sections.ts`). `SectionPanelScreen` is added to the outline: core's panel screen (`PackagePanelScreen`) gives a panel a fixed-height area with no scroller, so a panel brings its own (as mail's panels do).

In the Books settings shell the panel's states are already settled by the shell (it waits for the same reads), so there the panel draws the body at once. In core Settings nothing is above the panel, so it draws every state itself. A core admin can open a panel with no Books level; an admin-only section (Access) must not reach a bookkeeper by its direct URL.

A body that was drawn stays when a later reload of a read loads or fails (`keepsSectionBody`): the section can hold a form with unsaved text, and a frame in its place would drop it (the same rule as the report route of task 13). The error with Retry is then drawn above the body. Lost access removes the body.

- [ ] **Step 1: Write the failing test**


Create `tests/section-panel.test.tsx`:

````tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SectionPanel, SectionPanelScreen } from '../tinycld/books/components/settings/SectionPanel'
import {
    keepsSectionBody,
    SETTINGS_SECTIONS,
    sectionPanelState,
} from '../tinycld/books/lib/settings-sections'
import type { BooksSettings } from '../tinycld/books/types'
import { seedBooks, settingsStore } from './accounts-form-harness'
import { byTestId } from './accounts-test-rows'
import { SidebarProviders } from './sidebar-harness'
import { expectLiveQueryError, silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()
afterEach(cleanup)

const row: BooksSettings = {
    id: 'bookssettings01',
    close_date: '',
    fiscal_year_start_month: 1,
    currency: 'USD',
    business_name: 'Acme',
    ownership: '',
    tax_id: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    setup_completed: true,
    setup_started: true,
    threshold_1099: 200000,
    sales_deposit_account: '',
    default_customer_message: '',
    purchase_lines: 'both',
    created: '2026-01-01 00:00:00.000Z',
    updated: '2026-01-01 00:00:00.000Z',
}

type Seed = Parameters<typeof seedBooks>[0]

function seed(opts: Seed = {}) {
    seedBooks({
        level: 'admin',
        ledger: { lines: [], entries: [], balances: [], settings: [row] },
        ...opts,
    })
}

const READY = {
    isAccessReady: true,
    isAccessError: false,
    canRead: true,
    isAdmin: true,
    isSettingsReady: true,
    isSettingsError: false,
    hasSettings: true,
}

describe('sectionPanelState', () => {
    it('is the body for every section when an admin has all the reads', () => {
        expect(SETTINGS_SECTIONS.map(s => sectionPanelState(s.id, READY))).toEqual(
            SETTINGS_SECTIONS.map(() => 'body')
        )
    })

    it('waits for the access read, then for the settings read', () => {
        expect(sectionPanelState('company', { ...READY, isAccessReady: false })).toBe('loading')
        expect(sectionPanelState('company', { ...READY, isSettingsReady: false })).toBe('loading')
    })

    it('is an error when a read fails or the settings row is absent', () => {
        expect(sectionPanelState('company', { ...READY, isAccessError: true })).toBe('error')
        expect(sectionPanelState('company', { ...READY, isSettingsError: true })).toBe('error')
        expect(sectionPanelState('company', { ...READY, hasSettings: false })).toBe('error')
    })

    it('says no access before it reads the settings a person with no level cannot read', () => {
        const none = { ...READY, canRead: false, isAdmin: false, hasSettings: false }
        expect(sectionPanelState('company', none)).toBe('no-access')
        expect(sectionPanelState('access', none)).toBe('no-access')
    })

    it('keeps the admin-only section from a person who is not a Books admin', () => {
        const bookkeeper = { ...READY, isAdmin: false }
        expect(sectionPanelState('access', bookkeeper)).toBe('admin-only')
        expect(sectionPanelState('company', bookkeeper)).toBe('body')
    })
})

describe('keepsSectionBody', () => {
    it('draws the body only in the body state before it was drawn', () => {
        expect(keepsSectionBody('body', false)).toBe(true)
        expect(keepsSectionBody('loading', false)).toBe(false)
        expect(keepsSectionBody('error', false)).toBe(false)
    })

    it('keeps a drawn body, with its unsaved text, while a later read loads or fails', () => {
        expect(keepsSectionBody('loading', true)).toBe(true)
        expect(keepsSectionBody('error', true)).toBe(true)
    })

    it('removes a drawn body when the access is lost', () => {
        expect(keepsSectionBody('no-access', true)).toBe(false)
        expect(keepsSectionBody('admin-only', true)).toBe(false)
    })
})

describe('SectionPanel', () => {
    it('draws the section body with no shell around it', async () => {
        seed()
        const { container } = render(<SectionPanel section="company" />, {
            wrapper: SidebarProviders,
        })
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-company-business-name')).not.toBeNull()
        )
        expect(byTestId(container, 'books-settings')).toBeNull()
        expect(byTestId(container, 'books-settings-back')).toBeNull()
    })

    it('shows the admin-only note, not the Access section, to a bookkeeper', async () => {
        seed({ level: 'bookkeeper' })
        const { container } = render(<SectionPanel section="access" />, {
            wrapper: SidebarProviders,
        })
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-panel-admin-only')).not.toBeNull()
        )
        expect(byTestId(container, 'books-settings-access')).toBeNull()
    })

    it('shows the error with Retry when the settings read fails, and the body after Retry', async () => {
        seed({ settingsFailsOnce: true })
        expectLiveQueryError(settingsStore().id)
        const { container } = render(<SectionPanel section="company" />, {
            wrapper: SidebarProviders,
        })
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-panel-error')).not.toBeNull()
        )
        fireEvent.click(byTestId(container, 'books-settings-panel-retry') as Element)
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-company-business-name')).not.toBeNull()
        )
        expect(byTestId(container, 'books-settings-panel-error')).toBeNull()
    })
})

describe('SectionPanelScreen', () => {
    it('puts the section in its own scroller', async () => {
        seed()
        const { container } = render(<SectionPanelScreen section="company" />, {
            wrapper: SidebarProviders,
        })
        await waitFor(() =>
            expect(byTestId(container, 'books-settings-company-business-name')).not.toBeNull()
        )
        const scroller = byTestId(container, 'books-settings-panel')
        expect(
            scroller?.contains(byTestId(container, 'books-settings-company-business-name'))
        ).toBe(true)
    })
})
````

- [ ] **Step 2: Run the test to see it fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/section-panel.test.tsx`
Expected: FAIL: `../tinycld/books/components/settings/SectionPanel` cannot be resolved.

- [ ] **Step 3: Add the state function**

Apply to `tinycld/books/lib/settings-sections.ts`:

````diff
--- a/tinycld/books/lib/settings-sections.ts
+++ b/tinycld/books/lib/settings-sections.ts
@@ -31,6 +31,44 @@
     return SETTINGS_SECTIONS.filter(s => isAdmin || !s.adminOnly)
 }
 
+export type SectionPanelState = 'loading' | 'error' | 'no-access' | 'admin-only' | 'body'
+
+interface SectionPanelReads {
+    isAccessReady: boolean
+    isAccessError: boolean
+    canRead: boolean
+    isAdmin: boolean
+    isSettingsReady: boolean
+    isSettingsError: boolean
+    hasSettings: boolean
+}
+
+/**
+ * What one settings section shows when it stands alone. The access answers come first: a
+ * person with no Books level cannot read the settings row, so that read tells nothing.
+ */
+export function sectionPanelState(section: SectionId, reads: SectionPanelReads): SectionPanelState {
+    if (reads.isAccessError) return 'error'
+    if (!reads.isAccessReady) return 'loading'
+    if (!reads.canRead) return 'no-access'
+    const adminOnly = SETTINGS_SECTIONS.find(s => s.id === section)?.adminOnly ?? false
+    if (adminOnly && !reads.isAdmin) return 'admin-only'
+    if (reads.isSettingsError) return 'error'
+    if (!reads.isSettingsReady) return 'loading'
+    // A ready read with no settings row has nothing to show.
+    return reads.hasSettings ? 'body' : 'error'
+}
+
+/**
+ * A section body that was drawn stays while a later read loads or fails: it can hold a
+ * form with text the user has not saved, and a frame in its place would drop that text.
+ * Lost access still removes it.
+ */
+export function keepsSectionBody(state: SectionPanelState, wasDrawn: boolean): boolean {
+    if (state === 'body') return true
+    return wasDrawn && (state === 'loading' || state === 'error')
+}
+
 function accountingSummary(settings: BooksSettings | undefined): string {
     const month = FISCAL_MONTHS[(settings?.fiscal_year_start_month ?? 1) - 1] ?? FISCAL_MONTHS[0]
     const base = `Fiscal year starts in ${month}`
````

- [ ] **Step 4: Write the panel**

Create `tinycld/books/components/settings/SectionPanel.tsx`:

````tsx
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { useRef } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useBooksSettings } from '../../hooks/useBooksSettings'
import { keepsSectionBody, type SectionId, sectionPanelState } from '../../lib/settings-sections'
import { SectionBody } from './SectionBody'

function PanelLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <LoadingState />
}

function PanelError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View
            accessibilityRole="alert"
            className="items-center gap-3 p-6"
            testID="books-settings-panel-error"
        >
            <Text className="text-sm text-foreground">Settings could not be loaded.</Text>
            <Button
                size="sm"
                variant="outline"
                testID="books-settings-panel-retry"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function PanelNote({
    isVisible,
    testID,
    text,
}: {
    isVisible: boolean
    testID: string
    text: string
}) {
    if (!isVisible) return null
    return (
        <Text className="p-6 text-sm text-muted-foreground" testID={testID}>
            {text}
        </Text>
    )
}

function PanelBody({
    isVisible,
    section,
    isAdmin,
}: {
    isVisible: boolean
    section: SectionId
    isAdmin: boolean
}) {
    if (!isVisible) return null
    return <SectionBody section={section} isAdmin={isAdmin} />
}

/**
 * One Books settings section with its own load, error and access states and no shell
 * around it. The Books settings screen and the panels of core Settings both draw it, so a
 * section has one implementation behind its two entry points.
 */
export function SectionPanel({ section }: { section: SectionId }) {
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const state = sectionPanelState(section, {
        isAccessReady: access.isReady,
        isAccessError: access.isError,
        canRead: access.canRead,
        isAdmin: access.isAdmin,
        isSettingsReady: settings.isReady,
        isSettingsError: settings.hasLoadError,
        hasSettings: settings.settings !== undefined,
    })
    // The section whose body was drawn: its body stays under a later loading or error state.
    const drawn = useRef<SectionId | null>(null)
    if (state === 'body') drawn.current = section
    const showsBody = keepsSectionBody(state, drawn.current === section)
    // Only a failed read is rebuilt; the access read every Books screen shares stays as it is.
    const retry = () => {
        if (access.isError) access.retry()
        if (settings.hasLoadError) settings.retryLoad()
    }

    return (
        <>
            <PanelLoading isVisible={state === 'loading' && !showsBody} />
            <PanelError isVisible={state === 'error'} onRetry={retry} />
            <PanelNote
                isVisible={state === 'no-access'}
                testID="books-settings-panel-no-access"
                text="You do not have access to Books. A Books admin can give it to you."
            />
            <PanelNote
                isVisible={state === 'admin-only'}
                testID="books-settings-panel-admin-only"
                text="Only a Books admin can open this section."
            />
            <PanelBody isVisible={showsBody} section={section} isAdmin={access.isAdmin} />
        </>
    )
}

/**
 * A section as a panel of core Settings. Core's panel screen draws the header and gives
 * the panel a fixed-height area with no scroller, so the panel brings its own.
 */
export function SectionPanelScreen({ section }: { section: SectionId }) {
    return (
        <ScrollView
            testID="books-settings-panel"
            className="flex-1 bg-background"
            contentContainerClassName="gap-4 p-4"
        >
            <SectionPanel section={section} />
        </ScrollView>
    )
}
````

- [ ] **Step 5: Draw the panel in the Books settings shell**

Apply to `tinycld/books/components/settings/SettingsShell.tsx`:

````diff
--- a/tinycld/books/components/settings/SettingsShell.tsx
+++ b/tinycld/books/components/settings/SettingsShell.tsx
@@ -7,8 +7,8 @@
 import { useSettingsShell } from '../../hooks/useSettingsShell'
 import { useFabClearanceStyle } from '../../lib/fab-clearance'
 import type { SectionId } from '../../lib/settings-sections'
-import { SectionBody } from './SectionBody'
 import { SectionList, type SectionListItem } from './SectionList'
+import { SectionPanel } from './SectionPanel'
 
 function ShellLoading({ isVisible }: { isVisible: boolean }) {
     if (!isVisible) return null
@@ -32,7 +32,6 @@
     isWide: boolean
     sections: SectionListItem[]
     openId: SectionId | undefined
-    isAdmin: boolean
     onOpen: (id: SectionId) => void
     onBack: () => void
 }
@@ -70,7 +69,7 @@
 // One tree for both breakpoints: only the chrome (rail or back bar) comes and goes, so the
 // section body keeps its position and a dirty form keeps its edits when the window resizes.
 function DetailFrame(props: DetailProps) {
-    const { isVisible, isWide, sections, openId, isAdmin, onOpen, onBack } = props
+    const { isVisible, isWide, sections, openId, onOpen, onBack } = props
     // The phone New FAB floats over the scroller, so the last row needs room to scroll clear of it.
     const fabClearance = useFabClearanceStyle()
     if (!isVisible || !openId) return null
@@ -87,7 +86,7 @@
                     contentContainerStyle={fabClearance}
                 >
                     <SectionTitle isVisible={isWide} label={label} />
-                    <SectionBody section={openId} isAdmin={isAdmin} />
+                    <SectionPanel section={openId} />
                 </ScrollView>
             </View>
         </View>
@@ -95,7 +94,7 @@
 }
 
 export function SettingsShell({ section }: { section: SectionId | undefined }) {
-    const { part, sections, openId, isAdmin, openSection, back, retry } = useSettingsShell(section)
+    const { part, sections, openId, openSection, back, retry } = useSettingsShell(section)
     const isWide = useBreakpoint() !== 'mobile'
 
     return (
@@ -107,7 +106,6 @@
                 isWide={isWide}
                 sections={sections}
                 openId={openId}
-                isAdmin={isAdmin}
                 onOpen={openSection}
                 onBack={back}
             />
````

`useSettingsShell` still returns `isAdmin` (its section list needs it); the shell component no longer reads it.

- [ ] **Step 6: Run the tests, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/section-panel.test.tsx tests/useSettingsShell.test.tsx tests/settings-sections.test.ts tests/settings-sections-numbering.test.ts`
Expected: PASS, no failed test.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tinycld/books/components/settings/SectionPanel.tsx tinycld/books/components/settings/SettingsShell.tsx tinycld/books/lib/settings-sections.ts tests/section-panel.test.tsx`
Expected: no error.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: no error.

- [ ] **Step 7: Commit**

````bash
cd /Users/nas/tmp/tinycld/books/books
git add tinycld/books/components/settings/SectionPanel.tsx tinycld/books/components/settings/SettingsShell.tsx tinycld/books/lib/settings-sections.ts tests/section-panel.test.tsx
git commit -m "books: one settings section panel for two entry points"
````

#### Half B: the panels in core Settings

**Interfaces of half B:**
- Consumes: half A's `SectionPanelScreen({ section })`; `SETTINGS_SECTIONS`.
- Produces: `manifest.settings: { slug, label, component }[]` with the seven sections in the order and with the labels of `SETTINGS_SECTIONS`; the core Settings rows `settings-org-books-<slug>` under the group "Books" and the routes `/a/settings/books/<slug>` (core draws them, for core admins only).

All seven go in `settings` (the organization's panels): they hold the company's data, not one user's (`accountSettings`) and not the deployment's (`systemSettings`). The Books sidebar keeps its Settings entry: a Books admin who is not a core admin has no other way in.

- [ ] **Step B1: Write the failing test**


Create `tests/settings-panels.test.ts`:

````ts
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../manifest'
import { SETTINGS_SECTIONS } from '../tinycld/books/lib/settings-sections'

const ROOT = resolve(__dirname, '..')

describe('Books panels in core Settings', () => {
    it('lists the sections of the Books settings screen, in the same order, with the same labels', () => {
        expect(manifest.settings.map(p => ({ slug: p.slug, label: p.label }))).toEqual(
            SETTINGS_SECTIONS.map(s => ({ slug: s.id, label: s.label }))
        )
    })

    it('names for each panel a file that draws that section', () => {
        for (const panel of manifest.settings) {
            expect(panel.component).toBe(`settings/${panel.slug}`)
            const file = resolve(ROOT, 'tinycld/books', `${panel.component}.tsx`)
            expect(existsSync(file), file).toBe(true)
            expect(readFileSync(file, 'utf8')).toContain(
                `<SectionPanelScreen section="${panel.slug}" />`
            )
        }
    })

    it('exports the panel files, so the generated settings registry can import them', () => {
        const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
        expect(pkg.exports['./settings/*']).toBe('./tinycld/books/settings/*.tsx')
    })
})
````

- [ ] **Step B2: Run the test to see it fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/settings-panels.test.ts`
Expected: FAIL: `manifest.settings` is undefined.

- [ ] **Step B3: Write the seven panel files**

Create `tinycld/books/settings/company.tsx`:

````tsx
import { SectionPanelScreen } from '../components/settings/SectionPanel'

export default function CompanySettingsPanel() {
    return <SectionPanelScreen section="company" />
}
````

Create `tinycld/books/settings/accounting.tsx`:

````tsx
import { SectionPanelScreen } from '../components/settings/SectionPanel'

export default function AccountingSettingsPanel() {
    return <SectionPanelScreen section="accounting" />
}
````

Create `tinycld/books/settings/sales.tsx`:

````tsx
import { SectionPanelScreen } from '../components/settings/SectionPanel'

export default function SalesSettingsPanel() {
    return <SectionPanelScreen section="sales" />
}
````

Create `tinycld/books/settings/purchases.tsx`:

````tsx
import { SectionPanelScreen } from '../components/settings/SectionPanel'

export default function PurchasesSettingsPanel() {
    return <SectionPanelScreen section="purchases" />
}
````

Create `tinycld/books/settings/numbering.tsx`:

````tsx
import { SectionPanelScreen } from '../components/settings/SectionPanel'

export default function NumberingSettingsPanel() {
    return <SectionPanelScreen section="numbering" />
}
````

Create `tinycld/books/settings/form-1099.tsx`:

````tsx
import { SectionPanelScreen } from '../components/settings/SectionPanel'

export default function Form1099SettingsPanel() {
    return <SectionPanelScreen section="form-1099" />
}
````

Create `tinycld/books/settings/access.tsx`:

````tsx
import { SectionPanelScreen } from '../components/settings/SectionPanel'

export default function AccessSettingsPanel() {
    return <SectionPanelScreen section="access" />
}
````

- [ ] **Step B4: Name the panels in the manifest and export the files**

Apply to `manifest.ts`:

````diff
--- a/manifest.ts
+++ b/manifest.ts
@@ -17,6 +17,18 @@
     ],
     help: { directory: 'help' },
     sidebar: { component: 'sidebar' },
+    // The Books settings sections as panels of core Settings (Settings, group Books): the
+    // same sections, in the same order and with the same labels, as the Books settings
+    // screen (lib/settings-sections.ts). tests/settings-panels.test.ts holds the two lists equal.
+    settings: [
+        { slug: 'company', label: 'Company', component: 'settings/company' },
+        { slug: 'accounting', label: 'Accounting', component: 'settings/accounting' },
+        { slug: 'sales', label: 'Sales', component: 'settings/sales' },
+        { slug: 'purchases', label: 'Purchases', component: 'settings/purchases' },
+        { slug: 'numbering', label: 'Numbering', component: 'settings/numbering' },
+        { slug: 'form-1099', label: '1099s', component: 'settings/form-1099' },
+        { slug: 'access', label: 'Access', component: 'settings/access' },
+    ],
     provider: { component: 'provider' },
     migrations: { directory: 'pb-migrations' },
     collections: { register: 'collections', types: 'types' },
````

Apply to `package.json`:

````diff
--- a/package.json
+++ b/package.json
@@ -18,6 +18,7 @@
         "./hooks/*": "./tinycld/books/hooks/*.ts",
         "./components/*": "./tinycld/books/components/*.tsx",
         "./setup/*": "./tinycld/books/setup/*.tsx",
+        "./settings/*": "./tinycld/books/settings/*.tsx",
         "./forms": "./tinycld/books/forms/hosts.ts",
         "./forms-ui": "./tinycld/books/forms/ui.ts"
     },
````

- [ ] **Step B5: Generate the settings registry of the app shell**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run packages:generate`
Expected: ends with no error. `command grep -o '@tinycld/books/settings/[a-z0-9-]*' /Users/nas/tmp/tinycld/books/tinycld/tinycld.config.ts | sort -u` prints seven lines, one for each panel (gitignored output).

- [ ] **Step B6: Run the tests, the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/settings-panels.test.ts tests/section-panel.test.tsx`
Expected: PASS, no failed test.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check manifest.ts package.json tinycld/books/settings tests/settings-panels.test.ts`
Expected: no error.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: no error.

- [ ] **Step B7: Commit**

````bash
cd /Users/nas/tmp/tinycld/books/books
git add tinycld/books/settings manifest.ts package.json tests/settings-panels.test.ts
git commit -m "books: settings sections as panels of Settings"
````

---

### Task 18: E2E of the Shortcuts and New sections

**Files:**
- Create: `tests/e2e/sidebar-shortcuts-helpers.ts`
- Create: `tests/e2e/sidebar-shortcuts.spec.ts`
- Modify: `tests/e2e/mobile-drawer.spec.ts`
- Modify: `tests/e2e/books-access-helpers.ts` (`setLevelOf`)

**Interfaces:**
- Consumes: core task 12c (no sidebar item leaves a drawer timer); core's `test` and `expect` with the `freshMember` fixture (`@tinycld/core/e2e-helpers`, from core `tests/e2e/member-fixtures.ts`: a new member for one test, signed in on `freshMember.page`); part 2's test ids (`books-shortcuts-customize`, `books-shortcuts-dialog`, `books-shortcuts-add`, `books-shortcuts-add-search`, `books-shortcuts-add-option-<kind>:<ref>`, `books-shortcuts-add-option-empty`, `books-shortcuts-row-<kind>-<ref>` with `-up`, `-down`, `-remove`, `books-shortcuts-reset`, `books-shortcuts-save`, `books-shortcut-<kind>-<ref>`, `books-sidebar-new-toggle`, `books-sidebar-new-group-<customers|vendors|other>`), part 2's `tests/e2e/new-menu-helpers.ts` (`openNewMenu`, `openNewAction`, `newActionItem`, `newActionTestId`), `tests/e2e/account-register-helpers.ts` (`DESKTOP`, `PHONE`, `isPhone`, `swipeFromLeftEdge`), `tests/e2e/books-access-helpers.ts` (`accessRow`, `openAccess`, the body of `setCollaboratorLevel`), `ACCOUNT_LABELS` of `tests/e2e/journal-entries-helpers.ts`, core `login`, `navigateToPackage`; tasks 13 and 15 (a report shortcut opens `/a/books/reports/<id>`).
- Produces: `tests/e2e/sidebar-shortcuts-helpers.ts`: `type ShortcutKind`, `DEFAULT_SLUGS: string[]`, `openBooksAt(page, size)`, `showSidebar(page)`, `shortcutRow(page, slug)`, `shortcutSlugs(page)`, `expectShortcuts(page, slugs)`, `pressShortcut(page, slug)`, `customizeDialog(page)`, `openCustomize(page)`, `dialogRow(page, slug)`, `addShortcut(page, kind, search, label?): Promise<string>` (returns the row's slug `<kind>-<ref>`), `saveShortcuts(page)`, `cancelCustomize(page)`. `tests/e2e/books-access-helpers.ts`: `setLevelOf(page: Page, email: string, level: Level): Promise<void>` (the owner's page, in Books; `setCollaboratorLevel(page, level)` keeps its signature and calls it).

Isolation: a shortcut list is one row for each user. Two tests that write the list of the one shared e2e user would write under each other's checks on parallel workers. So each test that writes a list takes `freshMember`: its own user, its own row, the normal parallel workers, no new Playwright project and no title rule. The user starts with no stored list, which also proves the defaults for a new user. Facts this rests on, read from the code and not yet seen in a run: a new member has the organization role member with package access "full", so the Books level Bookkeeper (`pb-migrations/2100000000_create_books_access.js`), and Books gives each user a viewer share of its shipped reports (`server/report_shares.go`). When the first run shows a new member with no New section or no Trial Balance, that is a defect to find at its source; report it, do not move the test back to the shared user.

The reader test takes a `freshMember` too. The owner (the test's `page`) sets that member's Books level to Read-only in Settings, Access, before the member opens Books. The member is the test's own, so the test changes no level that another test reads, puts nothing back, and has no `(collaborator level)` title: it runs on the parallel workers. The tests that sign in as the shared e2e user (the New section tests, the drawer check) only read its list, and no test writes it.

- [ ] **Step 1: Write the helpers**


Create `tests/e2e/sidebar-shortcuts-helpers.ts`:

````ts
import { expect, type Locator, type Page } from '@playwright/test'
import { navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP, isPhone, swipeFromLeftEdge } from './account-register-helpers'

// The Shortcuts section of the Books sidebar and its Customize shortcuts dialog. The
// sidebar's own rows are `books-shortcut-<kind>-<ref>`; the dialog's rows are
// `books-shortcuts-row-<kind>-<ref>`, so a read of one never counts the other.

export type ShortcutKind = 'screen' | 'new' | 'report' | 'register'

// What a user with no stored list gets (lib/sidebar-shortcuts.ts DEFAULT_SHORTCUTS), as
// the slugs (`<kind>-<ref>`) of the rows.
export const DEFAULT_SLUGS = [
    'screen-customers',
    'screen-vendors',
    'screen-products',
    'report-books-profit-and-loss',
    'report-books-balance-sheet',
]

const ROW_PREFIX = 'books-shortcut-'
const ADD_OPTION_PREFIX = 'books-shortcuts-add-option-'

// Signs nothing in: the page is logged in. Opens Books on the dashboard at `size`. The
// package rail exists only at the desktop width, so the size is set after the navigation.
export async function openBooksAt(page: Page, size: { width: number; height: number }) {
    await page.setViewportSize(DESKTOP)
    await navigateToPackage(page, 'books')
    await expect(page).toHaveURL(/\/a\/books\/dashboard/)
    await page.getByTestId('dashboard-screen').filter({ visible: true }).waitFor()
    await page.setViewportSize(size)
}

// Puts the Books sidebar on screen. On a wide screen it is there. On a phone it is the
// drawer: the helper waits until the drawer rests (open or closed), then opens a closed one.
export async function showSidebar(page: Page): Promise<void> {
    if (!isPhone(page)) return
    const panel = page.getByTestId('mobile-drawer-panel')
    await panel.waitFor({ state: 'attached' })
    const rest = async () => {
        const box = await panel.boundingBox()
        if (!box) return 'moving'
        if (box.x === 0) return 'open'
        return box.x + box.width <= 0 ? 'closed' : 'moving'
    }
    await expect.poll(rest).not.toBe('moving')
    if ((await rest()) === 'open') return
    await swipeFromLeftEdge(page)
    await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0)
}

export function shortcutRow(page: Page, slug: string): Locator {
    return page.getByTestId(`${ROW_PREFIX}${slug}`).filter({ visible: true })
}

// The slugs of the sidebar's shortcut rows, from the top.
export async function shortcutSlugs(page: Page): Promise<string[]> {
    const ids = await page
        .locator(`[data-testid^="${ROW_PREFIX}"]`)
        .filter({ visible: true })
        .evaluateAll(rows => rows.map(row => row.getAttribute('data-testid') ?? ''))
    return ids.map(id => id.slice(ROW_PREFIX.length))
}

export async function expectShortcuts(page: Page, slugs: readonly string[]): Promise<void> {
    await showSidebar(page)
    await expect.poll(() => shortcutSlugs(page)).toEqual(slugs)
}

// Shows the sidebar and presses a shortcut. The caller checks where it lands.
export async function pressShortcut(page: Page, slug: string): Promise<void> {
    await showSidebar(page)
    await shortcutRow(page, slug).click()
}

export function customizeDialog(page: Page): Locator {
    return page.getByTestId('books-shortcuts-dialog')
}

export async function openCustomize(page: Page): Promise<void> {
    await showSidebar(page)
    await page.getByTestId('books-shortcuts-customize').filter({ visible: true }).click()
    await expect(customizeDialog(page)).toBeVisible()
}

export function dialogRow(page: Page, slug: string): Locator {
    return customizeDialog(page).getByTestId(`books-shortcuts-row-${slug}`)
}

// The dialog is open. Searches Add shortcut for `search` and picks the choice of `kind`
// whose label is `label`. Returns the slug of the row the pick adds.
export async function addShortcut(
    page: Page,
    kind: ShortcutKind,
    search: string,
    label: string = search
): Promise<string> {
    await page.getByTestId('books-shortcuts-add').filter({ visible: true }).click()
    const field = page.getByTestId('books-shortcuts-add-search')
    await expect(field).toBeFocused()
    await field.fill(search)
    const prefix = `${ADD_OPTION_PREFIX}${kind}:`
    const option = page
        .getByRole('menuitem', { name: label, exact: true })
        .and(page.locator(`[data-testid^="${prefix}"]`))
    await expect(option).toBeVisible()
    const id = (await option.getAttribute('data-testid')) ?? ''
    const slug = `${kind}-${id.slice(prefix.length).replace(/[^a-zA-Z0-9]/g, '-')}`
    await option.click()
    await expect(dialogRow(page, slug)).toBeVisible()
    return slug
}

// The dialog is open with a change in it. Saves and waits until the dialog is gone.
export async function saveShortcuts(page: Page): Promise<void> {
    await page.getByTestId('books-shortcuts-save').click()
    await expect(customizeDialog(page)).toHaveCount(0)
}

export async function cancelCustomize(page: Page): Promise<void> {
    await customizeDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(customizeDialog(page)).toHaveCount(0)
}
````

- [ ] **Step 2: Write the spec**

Create `tests/e2e/sidebar-shortcuts.spec.ts`:

````ts
import type { Page } from '@playwright/test'
import { expect, login, navigateToPackage, test } from '@tinycld/core/e2e-helpers'
import { DESKTOP, PHONE } from './account-register-helpers'
import { setLevelOf } from './books-access-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import { newActionItem, newActionTestId, openNewAction, openNewMenu } from './new-menu-helpers'
import {
    addShortcut,
    cancelCustomize,
    DEFAULT_SLUGS,
    dialogRow,
    expectShortcuts,
    openBooksAt,
    openCustomize,
    pressShortcut,
    saveShortcuts,
    showSidebar,
} from './sidebar-shortcuts-helpers'

// The Shortcuts and New sections of the Books sidebar (unit p1-sidebar-shortcuts), at the
// desktop width and at a phone width. On a phone the sidebar is the drawer, the Customize
// shortcuts dialog is a sheet, and the round New button opens the drawer: different code
// from the desktop path, so each flow runs at both widths.
//
// A user's shortcut list is one row of the database, and each user has their own. A test
// that writes the list takes core's `freshMember` fixture: a new member for that test only,
// signed in on its own page. So no two tests write the same list, the tests run on the
// normal parallel workers, and each starts from a user with no stored list (the defaults).
// A new member has the Books level Bookkeeper (core access "full"), and Books shares its
// shipped reports with each new user (server/report_shares.go). The reader test takes a
// `freshMember` too: the owner makes that member a reader, so the test changes no level
// that another test reads. The tests that sign in as the shared e2e user only read its
// list, which no test writes.
//
// Not covered by e2e:
// - the drag of a row (the same core SortableList as the dashboard's Edit mode, proven by
//   tests/e2e/dashboard.spec.ts; the Move up and Move down buttons write the same order);
// - the 30-shortcut limit, a refused write and a report or account that is gone (unit
//   tests of parts 1 and 2: useSidebarShortcuts, useCustomizeShortcuts, shortcut-rows).

const SIZES = [
    { name: 'desktop', size: DESKTOP },
    { name: 'phone', size: PHONE },
]

// One action of each New group, with the form it opens.
const NEW_GROUP_ACTIONS = [
    { group: 'customers', id: 'invoice', url: /\/a\/books\/invoices\/new/ },
    { group: 'vendors', id: 'bill', url: /\/a\/books\/bills\/new/ },
    { group: 'other', id: 'transfer', url: /\/a\/books\/transfers\/new/ },
]

async function backToDashboard(page: Page) {
    await page.goBack()
    await expect(page).toHaveURL(/\/a\/books\/dashboard/)
    await page.getByTestId('dashboard-screen').filter({ visible: true }).waitFor()
}

test.describe('sidebar-shortcuts: the Shortcuts section', () => {
    for (const { name, size } of SIZES) {
        test(`${name}: defaults, add one of each kind and open it, remove, reorder, and the list stays after a reload`, async ({
            freshMember,
        }) => {
            const { page } = freshMember
            await openBooksAt(page, size)
            // A user with no stored list has the defaults.
            await expectShortcuts(page, DEFAULT_SLUGS)

            // Add a screen, a form, a report and an account register.
            await openCustomize(page)
            const banking = await addShortcut(page, 'screen', 'Banking')
            const invoice = await addShortcut(page, 'new', 'New invoice')
            const trialBalance = await addShortcut(page, 'report', 'Trial Balance')
            const register = await addShortcut(page, 'register', ACCOUNT_LABELS.checking)
            expect([banking, invoice, trialBalance]).toEqual([
                'screen-banking',
                'new-invoice',
                'report-books-trial-balance',
            ])
            await saveShortcuts(page)
            const added = [...DEFAULT_SLUGS, banking, invoice, trialBalance, register]
            await expectShortcuts(page, added)

            // Each kind opens its target.
            await pressShortcut(page, banking)
            await expect(page).toHaveURL(/\/a\/books\/banking/)
            await pressShortcut(page, trialBalance)
            await expect(page).toHaveURL(/\/a\/books\/reports\/[a-z0-9]{15}(\?|$)/)
            await expect(page.getByTestId('report-title').filter({ visible: true })).toHaveText(
                'Trial Balance'
            )
            await pressShortcut(page, register)
            await expect(page).toHaveURL(/\/a\/books\/accounts\/[a-z0-9]{15}(\?|$)/)
            await pressShortcut(page, invoice)
            await expect(page).toHaveURL(/\/a\/books\/invoices\/new/)
            await page.goBack()
            await expect(page).toHaveURL(/\/a\/books\/accounts\/[a-z0-9]{15}(\?|$)/)

            // Remove Vendors, move Products to the top and Banking one place down.
            await openCustomize(page)
            await dialogRow(page, 'screen-vendors')
                .getByTestId(/-remove$/)
                .click()
            await expect(dialogRow(page, 'screen-vendors')).toHaveCount(0)
            await dialogRow(page, 'screen-products').getByTestId(/-up$/).click()
            await dialogRow(page, banking)
                .getByTestId(/-down$/)
                .click()
            await saveShortcuts(page)
            const changed = [
                'screen-products',
                'screen-customers',
                'report-books-profit-and-loss',
                'report-books-balance-sheet',
                invoice,
                banking,
                trialBalance,
                register,
            ]
            await expectShortcuts(page, changed)

            // The list is stored for the user: a reload shows the same list.
            await page.reload()
            await expect(page).toHaveURL(/\/a\/books\//)
            await expectShortcuts(page, changed)

            // Reset to defaults puts the default list back.
            await openCustomize(page)
            await page.getByTestId('books-shortcuts-reset').click()
            await saveShortcuts(page)
            await expectShortcuts(page, DEFAULT_SLUGS)
        })
    }
})

test.describe('sidebar-shortcuts: the New section', () => {
    for (const { name, size } of SIZES) {
        test(`${name}: an action of each group opens its form`, async ({ page }) => {
            await login(page)
            await openBooksAt(page, size)
            for (const action of NEW_GROUP_ACTIONS) {
                await openNewMenu(page)
                await expect(
                    page
                        .getByTestId(`books-sidebar-new-group-${action.group}`)
                        .filter({ visible: true })
                        .getByTestId(newActionTestId(action.id))
                ).toBeVisible()
                await newActionItem(page, action.id).click()
                await expect(page).toHaveURL(action.url)
                await backToDashboard(page)
            }
        })
    }

    // A sidebar row closes the drawer at once and leaves no timer (core SidebarItem, core
    // task 12c). So the round New button opens the section again directly after an action,
    // and the next action opens its form.
    test('phone: the round New button opens the section again right after an action', async ({
        page,
    }) => {
        await login(page)
        await openBooksAt(page, PHONE)
        await openNewAction(page, 'invoice')
        await expect(page).toHaveURL(/\/a\/books\/invoices\/new/)
        await backToDashboard(page)

        await openNewMenu(page)
        await newActionItem(page, 'transfer').click()
        await expect(page).toHaveURL(/\/a\/books\/transfers\/new/)
    })
})

test.describe('sidebar-shortcuts: reader', () => {
    test.use({ viewport: DESKTOP })

    test('a reader has no New section, no round New button and no form to add', async ({
        page,
        freshMember,
    }) => {
        // The owner makes this test's own member a reader, before the member opens Books.
        await login(page)
        await navigateToPackage(page, 'books')
        await setLevelOf(page, freshMember.user.email, 'read_only')
        const view = freshMember.page

        await openBooksAt(view, DESKTOP)
        await expect(view.getByTestId('books-shortcuts-customize')).toBeVisible()
        await expect(view.getByTestId('books-sidebar-new-toggle')).toHaveCount(0)
        await expect(view.getByTestId(newActionTestId('invoice'))).toHaveCount(0)

        // Add shortcut offers a reader screens, and no form.
        await openCustomize(view)
        await view.getByTestId('books-shortcuts-add').filter({ visible: true }).click()
        const search = view.getByTestId('books-shortcuts-add-search')
        await search.fill('Banking')
        await expect(view.getByTestId('books-shortcuts-add-option-screen:banking')).toBeVisible()
        await search.fill('New invoice')
        await expect(view.getByTestId('books-shortcuts-add-option-empty')).toBeVisible()
        await expect(view.locator('[data-testid^="books-shortcuts-add-option-new:"]')).toHaveCount(
            0
        )
        await view.keyboard.press('Escape')
        await expect(search).toHaveCount(0)
        await cancelCustomize(view)

        // The phone layout: no round New button, and the drawer holds no New section.
        await view.setViewportSize(PHONE)
        await expect(view.getByLabel('New', { exact: true })).toHaveCount(0)
        await showSidebar(view)
        const panel = view.getByTestId('mobile-drawer-panel')
        await expect(panel.getByTestId('books-shortcuts-customize')).toBeVisible()
        await expect(panel.getByTestId('books-sidebar-new-toggle')).toHaveCount(0)
    })
})
````

The phone flows open the drawer again directly after a row press (four shortcuts in a row, the New loop, the round New button test). They hold because of core task 12c: a sidebar item leaves no timer. When a drawer closes under a press in these flows, first confirm that task 12c is in the core checkout (`command grep -n setTimeout /Users/nas/tmp/tinycld/books/tinycld/core/components/sidebar-primitives/SidebarItem.tsx` prints nothing); when it is not, report `BLOCKED: core task 12c is not in the core checkout`. Never add a wait.

- [ ] **Step 3: Add the level helper and the drawer check**

Apply to `tests/e2e/books-access-helpers.ts`:

````diff
--- a/tests/e2e/books-access-helpers.ts
+++ b/tests/e2e/books-access-helpers.ts
@@ -83,10 +83,12 @@
 }
 
 // The page is the owner's, in Books. Opens Settings → Access when it is not open, sets the
-// collaborator's level, and waits until the level shows again after the rows remount.
-export async function setCollaboratorLevel(page: Page, level: Level): Promise<void> {
+// level of the person with `email`, and waits until the level shows again after the rows
+// remount. A test that makes a member of its own (core's `freshMember`) uses this: no other
+// test reads that member's level, so nothing is put back and no one-worker project is needed.
+export async function setLevelOf(page: Page, email: string, level: Level): Promise<void> {
     await openAccess(page)
-    const row = accessRow(page, TEST_COLLABORATOR_EMAIL)
+    const row = accessRow(page, email)
     const userId = await userIdOf(row)
     await shown(page, `books-settings-access-level-${userId}`).click()
     await shown(page, `books-settings-access-level-${userId}-${level}`).click()
@@ -97,6 +99,11 @@
     await expect(row.getByText(DESCRIPTIONS[level], { exact: true })).toBeVisible()
 }
 
+// The shared collaborator's level: see the note at the top of this file.
+export async function setCollaboratorLevel(page: Page, level: Level): Promise<void> {
+    await setLevelOf(page, TEST_COLLABORATOR_EMAIL, level)
+}
+
 // The page is the owner's, in Books. Opens Settings → Access when it is not open and reads
 // the collaborator's level from their row.
 export async function collaboratorLevel(page: Page): Promise<Level> {
````

Apply to `tests/e2e/mobile-drawer.spec.ts`:

````diff
--- a/tests/e2e/mobile-drawer.spec.ts
+++ b/tests/e2e/mobile-drawer.spec.ts
@@ -49,6 +49,12 @@
         await expectDrawerOpen(page)
 
         const panel = page.getByTestId('mobile-drawer-panel')
+        // The drawer is the whole Books sidebar: the Shortcuts, New and Reports sections,
+        // then the fixed navigation.
+        await expect(panel.getByTestId('books-shortcuts-customize')).toBeVisible()
+        await expect(panel.getByTestId('books-shortcut-screen-customers')).toBeVisible()
+        await expect(panel.getByTestId('books-sidebar-new-toggle')).toBeVisible()
+        await expect(panel.getByTestId('books-sidebar-reports-toggle')).toBeVisible()
         await expect(panel.getByTestId('books-nav-accounting-toggle')).toBeVisible()
 
         await page.mouse.click(PHONE.width - 20, PHONE.height / 2)
````

- [ ] **Step 4: Run the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tests/e2e/sidebar-shortcuts-helpers.ts tests/e2e/sidebar-shortcuts.spec.ts tests/e2e/mobile-drawer.spec.ts tests/e2e/books-access-helpers.ts`
Expected: no error.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: no error.

- [ ] **Step 5: Run the e2e files**

Run: `cd /Users/nas/tmp/tinycld/books && lsof -iTCP -sTCP:LISTEN -nP | grep -qE ':(7230|7231) ' && { echo PORTS-BUSY; exit 1; }; E2E_PORT=7230 E2E_PORT_2=7231 E2E_IMAP_PORT=1230 E2E_IMAP_PORT_2=1231 pnpm exec tinycld-pkg test:e2e books/tests/e2e/sidebar-shortcuts.spec.ts books/tests/e2e/mobile-drawer.spec.ts books/tests/e2e/dashboard.spec.ts`
Expected: all pass (6 tests of `sidebar-shortcuts.spec.ts`, the drawer test, the dashboard tests with their report links on the Books route). If the run cannot fit the runner's time, report `NEEDS-RUN` with this command. A failure is a defect of this unit: find the cause (a wrong id, a drawer that is not open, an element of a hidden stacked screen) and fix it at the source. Do not make a test serial and do not add a project to `playwright.config.ts`.

- [ ] **Step 6: Commit**

````bash
cd /Users/nas/tmp/tinycld/books/books
git add tests/e2e/sidebar-shortcuts-helpers.ts tests/e2e/sidebar-shortcuts.spec.ts tests/e2e/mobile-drawer.spec.ts tests/e2e/books-access-helpers.ts
git commit -m "books: e2e of the sidebar shortcuts and New section"
````

---

### Task 19: E2E of reports in Books and of settings in core Settings

**Files:**
- Create: `tests/e2e/reports-in-books.spec.ts`
- Create: `tests/e2e/settings-in-core.spec.ts`

**Interfaces:**
- Consumes: core's `test` and `expect` with the `freshMember` fixture; task 18's `openBooksAt`, `showSidebar`; task 15's `openReportsSection`; tasks 13 and 14's routes and test ids (`books-reports-screen` among them); task 16's `books-settings-panel` and rows `settings-org-books-<slug>`; core's report test ids (`report-title`, `report-table`, `report-empty`, `report-back`, `report-builder-title`) and helpers `pressToolbar`, `rowOf`; `tests/e2e/books-report-helpers.ts` (`browserToday`, `openBooksMenu`, `openEntriesFromSidebar`, `postEntryOn`, `pressFigure`, `sectionTopKey`), `createAccount`, `openChart`, `uniqueName`, `TRANSACTION_DETAIL_TITLE`.
- Produces: nothing for a later task.

The Books stack keeps a covered screen mounted and hidden, so after a drill two `report-title` elements exist: every locator of these specs that can match a covered screen is filtered to the visible one (`shown`). The drill test ends with Back after a reload: the stack then holds the one report, core opens `/a/books/reports`, and the test checks that this is the Books reports screen with the Books sidebar beside it, that core's hub is not on screen, and that a row of the screen opens the report on the Books route again.

The Save as test keeps a report named "Trial Balance copy …". In the shared e2e user's hub that row would also match the specs that open "Trial Balance" by its title (core's `hubRow` matches a part of the title), so the test takes core's `freshMember`: the copy belongs to a member of its own, and no other user reads it (a report is read by its owner, by a share, or when published). The other tests of the reports spec save no report (the posted entry has a unique name) and use the shared e2e user. The settings test saves the company settings, which is one row for the whole organization and not one for each user: a user of its own would not separate it. It keeps the existing rule of the config for that row (title ends in `(company settings)`); this part adds no project and no title rule.

- [ ] **Step 1: Write the reports spec**


Create `tests/e2e/reports-in-books.spec.ts`:

````ts
import type { Page } from '@playwright/test'
import { expect, login, pressToolbar, rowOf, test } from '@tinycld/core/e2e-helpers'
import { TRANSACTION_DETAIL_TITLE } from '~/tinycld/books/lib/report-drill-down-fixture'
import { createAccount, DESKTOP, isPhone, openChart, PHONE } from './account-register-helpers'
import {
    browserToday,
    openBooksMenu,
    openEntriesFromSidebar,
    openReportsSection,
    postEntryOn,
    pressFigure,
    sectionTopKey,
} from './books-report-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import { uniqueName } from './record-form-helpers'
import { openBooksAt, showSidebar } from './sidebar-shortcuts-helpers'

// Books' reports inside Books (unit p1-sidebar-shortcuts, added item (a)): the Reports
// section of the Books sidebar opens a report on the Books route (/a/books/reports/<id>),
// where the Books sidebar stays. Core's Reports hub stays for the full list (All reports).
// No test here writes the user's shortcut list; the report shortcut is in
// sidebar-shortcuts.spec.ts.
//
// The Save as test makes a report named "Trial Balance copy …" and keeps it. In the shared
// e2e user's hub that row would also match the specs that open "Trial Balance" by its title,
// so the test takes core's `freshMember`: a member of its own, whose reports no other user
// reads. The other tests save no report and use the shared e2e user.
//
// The phone runs: opening a report and All reports go through the drawer (different code).
// The drill, Save as and the builder run the same route code at every width and are run at
// the desktop width only; the phone drill itself is tests/e2e/report-drill-phone.spec.ts.
//
// Not covered by e2e: the note for a report of another package opened on the Books route
// (no other package's report is in the Books e2e database; tests/books-report-route.test.tsx
// holds its condition).

const BOOKS_REPORT_URL = /\/a\/books\/reports\/[a-z0-9]{15}(\?|$)/
const EXPENSE = { type: 'Expense', detailType: 'Advertising and marketing' }
const EXPENSES = 'Expenses'
const PL_TITLE = 'Profit and Loss'

function shown(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

// The report's row in the Reports section, by its exact title ("Profit and Loss by Month"
// holds "Profit and Loss").
function reportRow(page: Page, title: string) {
    return page
        .locator('[data-testid^="books-sidebar-report-"]')
        .filter({ visible: true })
        .filter({ has: page.getByText(title, { exact: true }) })
}

// Books must be open. Opens `title` from the Reports section of the Books sidebar.
async function openFromReportsSection(page: Page, title: string) {
    await showSidebar(page)
    await openReportsSection(page)
    await reportRow(page, title).click()
    await expect(page).toHaveURL(BOOKS_REPORT_URL)
    await expect(shown(page, 'report-title')).toHaveText(title)
}

function reportIdOf(page: Page): string {
    return new URL(page.url()).pathname.split('/').pop() ?? ''
}

test.describe('reports-in-books: the Reports section', () => {
    for (const size of [DESKTOP, PHONE]) {
        test(`a report opens inside Books and All reports opens the hub, at ${size.width}`, async ({
            page,
        }) => {
            await login(page)
            await openBooksAt(page, size)
            await openFromReportsSection(page, 'Trial Balance')
            await expect(shown(page, 'report-table').or(shown(page, 'report-empty'))).toBeVisible()

            // The Books sidebar is still the sidebar: on a phone, the drawer of this route.
            if (isPhone(page)) await openBooksMenu(page)
            const row = reportRow(page, 'Trial Balance')
            await expect(row).toBeVisible()
            await expect(shown(page, 'books-shortcuts-customize')).toBeVisible()
            await expect(shown(page, 'books-nav-settings')).toBeVisible()

            await shown(page, 'books-sidebar-reports-all').click()
            await expect(page).toHaveURL(/\/a\/reports\?package=books/)
            await expect(page.getByTestId('reports-hub')).toBeVisible()
        })
    }
})

test.describe('reports-in-books: the Books route', () => {
    test.use({ viewport: DESKTOP })

    test('a figure opens its report on the Books route, and Back returns to the statement', async ({
        page,
    }) => {
        await login(page)
        await openBooksAt(page, DESKTOP)
        // Named from sectionTopKey, the account sorts at the top of Expenses, so its row
        // mounts when the section opens.
        const expense = uniqueName(`${sectionTopKey()} Books route expense`)
        await openChart(page)
        await createAccount(page, expense, EXPENSE)
        await openEntriesFromSidebar(page)
        await postEntryOn(page, {
            date: await browserToday(page),
            memo: uniqueName('Books route entry'),
            lines: [
                { account: expense, debit: '41.00' },
                { account: ACCOUNT_LABELS.checking, credit: '41.00' },
            ],
        })

        await openFromReportsSection(page, PL_TITLE)
        const statementId = reportIdOf(page)
        await pressToolbar(page, 'report-fold-all', 'Collapse all')
        await expect(rowOf(page, EXPENSES)).toHaveAttribute('aria-expanded', 'false')
        await rowOf(page, EXPENSES).click()
        await expect(rowOf(page, expense)).toBeVisible()

        // 1280 px is under the side panel's width, so the figure opens a screen.
        await pressFigure(page, 'amount', expense)
        await expect(shown(page, 'report-title')).toHaveText(TRANSACTION_DETAIL_TITLE)
        await expect(page).toHaveURL(BOOKS_REPORT_URL)
        expect(reportIdOf(page)).not.toBe(statementId)
        await expect(shown(page, 'books-sidebar-reports-toggle')).toBeVisible()

        await expect(shown(page, 'report-back')).toHaveText(PL_TITLE)
        await shown(page, 'report-back').click()
        await expect(shown(page, 'report-title')).toHaveText(PL_TITLE)
        await expect(page).toHaveURL(BOOKS_REPORT_URL)
        expect(reportIdOf(page)).toBe(statementId)

        // After a reload the stack holds this report only: Back goes to the Books report
        // base, `/a/books/reports`. That is the Books reports screen: the user stays in
        // Books, with the Books sidebar, and core's hub does not open.
        await page.reload()
        await expect(shown(page, 'report-title')).toHaveText(PL_TITLE)
        await shown(page, 'report-back').click()
        await expect(page).toHaveURL(/\/a\/books\/reports(\?|$)/)
        await expect(shown(page, 'books-reports-screen')).toBeVisible()
        await expect(shown(page, 'books-reports-all')).toBeVisible()
        await expect(shown(page, 'books-sidebar-reports-toggle')).toBeVisible()
        await expect(page.getByTestId('reports-hub')).toHaveCount(0)

        // The screen lists the Books reports; a row opens the report on the Books route.
        await shown(page, 'books-reports-screen').getByText(PL_TITLE, { exact: true }).click()
        await expect(page).toHaveURL(BOOKS_REPORT_URL)
        await expect(shown(page, 'report-title')).toHaveText(PL_TITLE)
        expect(reportIdOf(page)).toBe(statementId)
    })

    test('Save as opens the copy on the Books route, and builder text stays when the reports list fails and recovers', async ({
        freshMember,
    }) => {
        const { page } = freshMember
        await openBooksAt(page, DESKTOP)
        await openFromReportsSection(page, 'Trial Balance')
        const shippedId = reportIdOf(page)

        const copyTitle = uniqueName('Trial Balance copy')
        await pressToolbar(page, 'report-save-as', 'Save as…')
        const prompt = page.getByRole('textbox', { name: 'Save as', exact: true })
        await prompt.fill(copyTitle)
        await prompt.press('Enter')
        await expect(shown(page, 'report-title')).toHaveText(copyTitle)
        await expect(page).toHaveURL(BOOKS_REPORT_URL)
        const copyId = reportIdOf(page)
        expect(copyId).not.toBe(shippedId)
        // The saved copy is a Books report: the section lists it.
        await expect(shown(page, `books-sidebar-report-${copyId}`)).toBeVisible()

        // Only the Books list read (it filters on `source`) fails; core's read of the one
        // report (by id) is answered. The list fails on the reload, before the builder opens.
        await page.route('**/api/collections/reports/records**', route => {
            const filter = new URL(route.request().url()).searchParams.get('filter') ?? ''
            const failing = filter.includes('source')
            return failing ? route.fulfill({ status: 400, json: {} }) : route.continue()
        })
        await page.reload()
        await expect(shown(page, 'report-title')).toHaveText(copyTitle)
        await expect(shown(page, 'books-sidebar-reports-error')).toBeVisible()

        await pressToolbar(page, 'report-edit-open', 'Edit report')
        const title = page.getByTestId('report-builder-title')
        const typed = uniqueName('Typed while the list failed')
        await title.fill(typed)

        // The list recovers: the report view under the builder is not rebuilt, so the
        // text is still there.
        await page.unrouteAll({ behavior: 'wait' })
        await shown(page, 'books-sidebar-reports-retry').click()
        await expect(shown(page, `books-sidebar-report-${copyId}`)).toBeVisible()
        await expect(shown(page, 'books-sidebar-reports-error')).toHaveCount(0)
        await expect(title).toHaveValue(typed)
    })
})
````

In the last test only the Books list read is failed: the request whose `filter` names `source` (the list of `useBooksReports`). Core's read of the one report filters by `id` and is answered, so core's `ReportScreen` stays as it is; the test proves that the Books route does not rebuild it when the Books read fails and recovers.

- [ ] **Step 2: Write the settings spec**

Create `tests/e2e/settings-in-core.spec.ts`:

````ts
import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP, PHONE } from './account-register-helpers'
import { uniqueName } from './record-form-helpers'

// The Books settings sections in core Settings (unit p1-sidebar-shortcuts, added item
// (b)): Settings lists them under Books, a section opened there saves, and the Books
// settings screen shows what it saved (one implementation behind two entry points).
//
// The test saves the Company section, which is on the one shared books_settings row, so
// its title ends in "(company settings)" and it runs in the one-worker
// `purchase-lines-setting` project (playwright.config.ts). It changes only the website,
// which no other test reads, and puts the old value back. The seeded business name is
// blank and the schema requires one, so like books-settings.spec.ts it leaves
// 'E2E Company Co' when the name was blank.
//
// Not covered by e2e: a user who is not a core admin (core shows package panels to core
// admins only; core's own specs hold that), and the panel's no-access and admin-only notes
// (tests/section-panel.test.tsx).

const SECTION_SLUGS = [
    'company',
    'accounting',
    'sales',
    'purchases',
    'numbering',
    'form-1099',
    'access',
]

function shown(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

async function expectSaved(page: Page) {
    const toast = page.getByText('Saved.', { exact: true })
    await expect(toast.first()).toBeVisible()
    // Wait for the toast to leave so the next save cannot be confused with this one.
    await expect(toast).toHaveCount(0)
}

// Core Settings, then the Books panel `slug`. The settings rail item exists only at the
// desktop width.
async function openCorePanel(page: Page, slug: string) {
    await page.getByTestId('nav-settings').click()
    const index = page.getByTestId('settings-index')
    await index.waitFor({ state: 'visible' })
    await index.getByTestId(`settings-org-books-${slug}`).click()
    await expect(page).toHaveURL(new RegExp(`/a/settings/books/${slug}$`))
    await expect(shown(page, 'books-settings-panel')).toBeVisible()
}

async function saveWebsite(page: Page, value: string) {
    const name = shown(page, 'books-settings-company-business-name')
    if ((await name.inputValue()) === '') await name.fill('E2E Company Co')
    await shown(page, 'books-settings-company-website').fill(value)
    const save = shown(page, 'books-settings-save')
    await save.scrollIntoViewIfNeeded()
    await save.click()
    await expectSaved(page)
}

test.describe('settings-in-core: Books sections in core Settings', () => {
    test.use({ viewport: DESKTOP })

    test('Settings lists the Books sections, one saves, and Books settings shows the value (company settings)', async ({
        page,
    }) => {
        await login(page)
        // Never press the rail during the redirect after the login: open a package first.
        await navigateToPackage(page, 'books')
        await page.getByTestId('nav-settings').click()
        const index = page.getByTestId('settings-index')
        await index.waitFor({ state: 'visible' })
        for (const slug of SECTION_SLUGS) {
            await expect(index.getByTestId(`settings-org-books-${slug}`)).toBeVisible()
        }
        await expect(index.getByTestId('settings-org-books-form-1099')).toContainText('1099s')

        await index.getByTestId('settings-org-books-company').click()
        await expect(page).toHaveURL(/\/a\/settings\/books\/company$/)
        const panel = shown(page, 'books-settings-panel')
        await expect(panel).toBeVisible()
        // The panel is the section alone: no Books settings shell, rail or back bar in it.
        await expect(page.getByTestId('books-settings')).toHaveCount(0)

        const website = shown(page, 'books-settings-company-website')
        await expect(website).toBeVisible()
        const original = await website.inputValue()
        const typed = `https://${uniqueName('core-settings').replace(/[^a-z0-9]/gi, '-')}.example`
        await saveWebsite(page, typed)

        // The Books settings screen reads the same row.
        await navigateToPackage(page, 'books')
        await shown(page, 'books-nav-settings').click()
        await expect(shown(page, 'books-settings')).toBeVisible()
        await expect(shown(page, 'books-settings-company-website')).toHaveValue(typed)

        // On a phone the panel fills the screen and scrolls: Save, the last control, is reached.
        await openCorePanel(page, 'company')
        await page.setViewportSize(PHONE)
        await expect(shown(page, 'books-settings-company-website')).toHaveValue(typed)
        await saveWebsite(page, original)
        await expect(shown(page, 'books-settings-company-website')).toHaveValue(original)
    })
})
````

- [ ] **Step 3: Run the lint and the typecheck**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tests/e2e/reports-in-books.spec.ts tests/e2e/settings-in-core.spec.ts`
Expected: no error.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg typecheck`
Expected: no error.

- [ ] **Step 4: Run the e2e files, with the specs task 15 changed**

Run: `cd /Users/nas/tmp/tinycld/books && lsof -iTCP -sTCP:LISTEN -nP | grep -qE ':(7230|7231) ' && { echo PORTS-BUSY; exit 1; }; E2E_PORT=7230 E2E_PORT_2=7231 E2E_IMAP_PORT=1230 E2E_IMAP_PORT_2=1231 pnpm exec tinycld-pkg test:e2e books/tests/e2e/reports-in-books.spec.ts books/tests/e2e/settings-in-core.spec.ts books/tests/e2e/books-settings.spec.ts books/tests/e2e/trial-balance.spec.ts books/tests/e2e/books-ap-aging.spec.ts books/tests/e2e/books-expenses-by-vendor.spec.ts books/tests/e2e/books-report-1099.spec.ts books/tests/e2e/books-vendor-balance.spec.ts books/tests/e2e/books-sales-tax-liability.spec.ts books/tests/e2e/reconcile-history.spec.ts books/tests/e2e/reconciliation-report.spec.ts`
Expected: all pass. `trial-balance.spec.ts` proves the moved door (`openBooksReports` through "All reports"); `books-settings.spec.ts` proves the Books settings shell with `SectionPanel` in it. If the run cannot fit the runner's time, report `NEEDS-RUN` with this command. A failure is diagnosed and fixed at its source; when the source is core's report view or core Settings, STOP and report it.

- [ ] **Step 5: Commit**

````bash
cd /Users/nas/tmp/tinycld/books/books
git add tests/e2e/reports-in-books.spec.ts tests/e2e/settings-in-core.spec.ts
git commit -m "books: e2e of reports in Books and settings in Settings"
````

---

### Task 20: Help and the spec record

**Files:**
- Create: `help/sidebar-shortcuts.md`
- Modify: `help/navigating-books.md`, `help/reports.md`, `help/settings.md`
- Modify: `docs/specs/books-shell-design.md`
- Test: `tests/help-sidebar-shortcuts.test.ts`

**Interfaces:**
- Consumes: `tests/help-topic.ts` (`readHelpTopic`, `sectionOf`, `paragraphWith`), part 1's `DEFAULT_SHORTCUTS` and `MAX_SHORTCUTS` (`lib/sidebar-shortcuts.ts`).
- Produces: the help topic `books:sidebar-shortcuts`; the recorded layout and decisions in the shell spec.

The other help topics say "choose New in the sidebar (the round + button on a phone) and pick Invoice, under Customers". That is still true with the New section, so they do not change.

- [ ] **Step 1: Write the failing test**


Create `tests/help-sidebar-shortcuts.test.ts`:

````ts
import { describe, expect, it } from 'vitest'
import manifest from '../manifest'
import { DEFAULT_SHORTCUTS, MAX_SHORTCUTS } from '../tinycld/books/lib/sidebar-shortcuts'
import { paragraphWith, readHelpTopic, sectionOf } from './help-topic'

const topic = readHelpTopic('sidebar-shortcuts')

describe('help/sidebar-shortcuts.md', () => {
    it('is a topic of the Books help directory with a title and a summary', () => {
        expect(manifest.help.directory).toBe('help')
        expect(topic.exists).toBe(true)
        expect(topic.frontmatter).toMatch(/^title:\s*\S+/m)
        expect(topic.frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('names the default shortcuts, as many as the app gives', () => {
        const line = paragraphWith(topic.body, /At first the list holds/) ?? ''
        for (const name of ['Customers', 'Vendors', 'Products and services']) {
            expect(line).toContain(name)
        }
        expect(line).toContain('Profit and Loss')
        expect(line).toContain('Balance Sheet')
        expect(DEFAULT_SHORTCUTS).toHaveLength(5)
    })

    it('says how to add, remove, reorder, reset and save', () => {
        const section = sectionOf(topic.body, 'Shortcuts')
        expect(section).toContain('Customize shortcuts')
        expect(section).toContain('Add shortcut')
        expect(section).toMatch(/To remove a shortcut,/)
        expect(section).toMatch(/drag a row by its handle, or press the up and down arrows/)
        expect(section).toContain('Reset to defaults')
        expect(section).toMatch(/Press Save to keep your changes/)
    })

    it('states the limit the app holds', () => {
        expect(topic.body).toContain(`at most ${MAX_SHORTCUTS} shortcuts`)
    })

    it('says the list is per person, and what a reader and a missing target get', () => {
        const section = sectionOf(topic.body, 'Shortcuts')
        expect(section).toMatch(/each person has their own/)
        expect(section).toMatch(/read-only access, Add shortcut offers no forms/)
        expect(section).toContain('Not available')
    })

    it('covers New on a wide screen and on a phone, and for a reader', () => {
        const section = sectionOf(topic.body, 'New')
        expect(section).toMatch(/Customers, Vendors or Other/)
        expect(section).toMatch(/round \+ button/)
        expect(section).toMatch(/read-only access, New and the round \+ button are hidden/)
    })

    it('covers the Reports part: reports open inside Books, All reports opens Reports', () => {
        const section = sectionOf(topic.body, 'Reports')
        expect(section).toMatch(/opens inside Books/)
        expect(section).toContain('All reports')
        expect(section).toMatch(/back link, Books shows the list of the Books reports/)
        expect(section).toContain('(help://books:reports)')
    })

    it('says the phone sidebar is the Books menu', () => {
        expect(topic.body).toMatch(/On a phone, the sidebar is the Books menu/)
    })
})

describe('the topics that point at the sidebar', () => {
    it('navigating-books links the shortcuts topic and names the Reports part and All reports', () => {
        const { body } = readHelpTopic('navigating-books')
        expect(body).toContain('(help://books:sidebar-shortcuts)')
        expect(body).toMatch(/open Reports in the sidebar and press the report/)
        expect(body).toContain('All reports')
        expect(body).not.toContain('choose Reports in the sidebar: it opens Reports')
    })

    it('reports says a report opens inside Books and All reports opens the full list', () => {
        const { body } = readHelpTopic('reports')
        expect(body).toMatch(/The report opens inside Books/)
        expect(body).toMatch(/press All reports at the end of the list/)
        expect(body).toContain('(help://books:sidebar-shortcuts)')
    })

    it('settings names both places the sections open from', () => {
        const { body } = readHelpTopic('settings')
        const line = paragraphWith(body, /Books settings open from two places/) ?? ''
        expect(line).toMatch(/Settings in the Books sidebar/)
        expect(line).toMatch(/the Books group of the app's Settings/)
        expect(line).toMatch(/organization owner or admin/)
    })
})
````

- [ ] **Step 2: Run the test to see it fail**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/help-sidebar-shortcuts.test.ts`
Expected: FAIL: the topic file does not exist; the three topics do not hold the new sentences.

- [ ] **Step 3: Write the topic**

Create `help/sidebar-shortcuts.md`:

````markdown
---
title: Sidebar and shortcuts
summary: Pin the screens, forms, reports and account registers you use most at the top of the Books sidebar, and find New and Reports under them.
tags: [sidebar, shortcuts, customize, pin, new, reports, navigation]
order: 12
---

The Books sidebar has four parts, from the top: Shortcuts, New, Reports and Go to. On a phone, the sidebar is the Books menu: swipe in from the left edge of the screen to open it.

## Shortcuts

Shortcuts is your own list of the places you open most. To open one, press it. At first the list holds Customers, Vendors, Products and services, Profit and Loss, and Balance Sheet.

To change the list, press Customize shortcuts, the pencil beside the Shortcuts heading. In the dialog:

- To add a shortcut, press Add shortcut, type a few letters and pick from the list. You can add a Books screen, a form (for example New invoice), a Books report, also one that you saved, and the register of an account.
- To remove a shortcut, press the × on its row.
- To change the order, drag a row by its handle, or press the up and down arrows on the row.
- To get the first list back, press Reset to defaults.

Press Save to keep your changes, or Cancel to drop them. Nothing changes in the sidebar until you press Save.

The list holds at most 30 shortcuts. When it is full, remove one to add another.

The list is yours: each person has their own, and Books shows it on every device you sign in on. If you have read-only access, Add shortcut offers no forms.

A shortcut to a report or an account that was deleted, or that you can no longer open, is not shown in the sidebar. In the dialog its row reads Not available; remove it there.

## New

To start a transaction, open New in the sidebar and pick an action under Customers, Vendors or Other. The arrow beside the New heading folds the part and opens it again; Books remembers how you left it. On a phone, press the round + button: the Books menu opens with New open. If you have read-only access, New and the round + button are hidden.

## Reports

To open a Books report, open Reports in the sidebar and press the report. The reports that come with Books are listed first, then the Books reports that you saved or that are shared with you. The report opens inside Books, so the sidebar stays beside it. A report that you open from a figure of another report, and the copy that Save as makes, also open inside Books. When you open a Books report from a link and press its back link, Books shows the list of the Books reports.

To search the reports, to make a new one or to share one, press All reports at the end of the part. It opens Reports with only Books reports shown. See [Reports](help://books:reports).

## Go to

Go to holds every part of Books in a fixed order: the Dashboard, Banking, Sales, Expenses, Lists, the Accounting group, Taxes and Settings. See [Moving around Books](help://books:navigating-books).
````

- [ ] **Step 4: Update the three topics that point at the sidebar**

Apply to `help/navigating-books.md`:

````diff
--- a/help/navigating-books.md
+++ b/help/navigating-books.md
@@ -1,11 +1,11 @@
 ---
 title: Moving around Books
-summary: Use the Dashboard, the sidebar, the New menu and the Lists hub.
+summary: Use the Dashboard, the sidebar with its shortcuts, New and the Lists hub.
 ---
 
 The first time you open Books, it opens on the Dashboard, the first entry in the sidebar. When you come back to Books from another part of the app, it opens where you left it. On a phone, Books opens where you left it. To go to the Dashboard, choose Dashboard in the sidebar. The Dashboard shows your unpaid invoices and what was paid in the last 30 days. To hide every amount on it, turn on Hide amounts; Books keeps that choice for you on every device. To read what each widget counts and to arrange the widgets, see [Dashboard](help://books:dashboard).
 
-To open a list, choose Lists in the sidebar and pick a card. On a phone, the sidebar is the Books menu: swipe in from the left edge of the screen to open it, then choose Lists. To get back to Lists on a phone, choose All lists at the top of the Chart of Accounts, Customers, Vendors or Products and services list. To start a transaction, choose New (the round + button on a phone) and pick an action. If you have read-only access, the menu is hidden. The Accounting group in the sidebar folds with its arrow. To change company details, the close date, numbering or access, choose Settings in the sidebar; see [Settings](help://books:settings). To work with accounts, see [Chart of Accounts](help://books:chart-of-accounts).
+To open a list, choose Lists in the sidebar and pick a card. On a phone, the sidebar is the Books menu: swipe in from the left edge of the screen to open it, then choose Lists. To get back to Lists on a phone, choose All lists at the top of the Chart of Accounts, Customers, Vendors or Products and services list. To start a transaction, open New in the sidebar (the round + button on a phone) and pick an action. If you have read-only access, New is hidden. The Shortcuts part at the top of the sidebar is your own list of the screens, forms, reports and registers you open most; to change it, see [Sidebar and shortcuts](help://books:sidebar-shortcuts). The New, Reports and Accounting parts of the sidebar each fold with their arrow. To change company details, the close date, numbering or access, choose Settings in the sidebar; see [Settings](help://books:settings). To work with accounts, see [Chart of Accounts](help://books:chart-of-accounts).
 
 To find an account, a journal entry, a customer, a vendor, a product or service, or an invoice (drafts included) from anywhere in the app, use the app search. An invoice is found by its number, its customer's name, its memo or its message, and you can mix them, for example the customer's name and the invoice number. It matches words that start with what you type, and it ignores case and accents.
 
@@ -17,7 +17,7 @@
 
 To compare a bank or credit card account with its bank statement, choose Reconcile in the Accounting group of the sidebar; see [Reconcile an account](help://books:reconcile).
 
-To see Books reports, choose Reports in the sidebar: it opens Reports with only Books reports shown; see [Reports](help://books:reports).
+To open a Books report, open Reports in the sidebar and press the report: it opens inside Books. To search every Books report, press All reports at the end of that part: it opens Reports with only Books reports shown; see [Reports](help://books:reports).
 
 To find, filter and act on your invoices, estimates, sales receipts, payments, credit memos and refund receipts, choose Sales in the sidebar; see [Sales lists](help://books:sales-lists).
 
````

Apply to `help/reports.md`:

````diff
--- a/help/reports.md
+++ b/help/reports.md
@@ -9,7 +9,7 @@
 
 ## Open Books reports
 
-To open Books reports, choose Reports in the Books sidebar. On a phone, swipe in from the left edge of the screen to open the Books menu, then choose Reports. Reports opens with only Books reports shown, under the line "Showing reports from Books". Press a report to open it.
+To open a Books report, choose Reports in the Books sidebar, then press the report. On a phone, swipe in from the left edge of the screen to open the Books menu, then choose Reports. The report opens inside Books. To search the reports, to make a new one or to share one, press All reports at the end of the list: Reports opens with only Books reports shown, under the line "Showing reports from Books". Press a report there to open it. To keep a report one press away, add it to your shortcuts; see [Sidebar and shortcuts](help://books:sidebar-shortcuts).
 
 To go back to the Books reports, press Reports at the top of the report. To see the reports of every package, press Show all reports.
 
````

Apply to `help/settings.md`:

````diff
--- a/help/settings.md
+++ b/help/settings.md
@@ -5,6 +5,8 @@
 order: 20
 ---
 
+Books settings open from two places, and both show the same sections: Settings in the Books sidebar, and, for an organization owner or admin, the Books group of the app's Settings. A Books admin who is not an organization owner or admin uses Settings in the Books sidebar.
+
 To close the books through a date, open Settings, choose Accounting, turn on Close the books and enter the date. People can no longer post entries dated on or before that date. If you move the date earlier or turn the switch off, Books asks you to confirm that closed periods will reopen.
 
 To let someone post into a closed period, open Settings, choose Accounting and press Grant an override under Close the books. Pick the person, give a reason of at least 3 characters and choose how long it lasts. Only a person with Bookkeeper or Admin access can receive an override. The override ends by itself when its time is over. To end it early, press Revoke on its row. Past overrides stay under Show past overrides, without actions. A person who holds an override sees it in Settings with the reason.
````

- [ ] **Step 5: Record the layout and the decisions in the shell spec**

Apply to `docs/specs/books-shell-design.md`:

````diff
--- a/docs/specs/books-shell-design.md
+++ b/docs/specs/books-shell-design.md
@@ -1,28 +1,46 @@
 # Books shell, sidebar, and Lists hub
 
 ## Goal
-Give Books one navigable frame: a left sidebar, a global + New menu, and a Lists hub.
+Give Books one navigable frame: a left sidebar that holds the user's shortcuts, the New actions, the Books reports and the fixed navigation, and a Lists hub.
 
 ## Where it lives
 `books/tinycld/books/{sidebar.tsx, screens/_layout.tsx, screens/index.tsx, screens/lists.tsx}`. Route `/a/books/lists`. `/a/books` redirects to `/a/books/lists`.
 
 ## Behavior
-- The sidebar, the + New menu and the Lists hub draw only registry entries whose `available` flag is true; the unit that builds an entry's screen sets its flag.
+- The sidebar, the New section and the Lists hub draw only registry entries whose `available` flag is true; the unit that builds an entry's screen sets its flag.
 - Registry entries for phase 1 exist now with `available: false`, except Lists: Chart of Accounts, Journal Entries, the Accounts list, and the Journal entry action.
 - A sidebar group with no available entries is not drawn.
 - The Accounting group folds and unfolds; its state persists across sessions in a Zustand store.
 - The active destination is highlighted with the `active-indicator` token.
-- + New sits at the top of the sidebar on web and tablet, and as a FAB on phones.
-- + New opens three columns (Customers, Vendors, Other) on web and tablet, and a bottom sheet with the same groups stacked on phones.
-- A + New column with no available actions is not drawn, and + New itself is not drawn when no action is available.
-- Users below bookkeeper level see no + New (`useBooksAccess`).
+- The New actions are the New section of the sidebar: three groups (Customers, Vendors, Other) under a heading that folds. On a phone the sidebar is the drawer, and a round New button (FAB) opens the drawer with the New section open.
+- A New group with no available actions is not drawn, and the New section itself is not drawn when no action is available.
+- Users below bookkeeper level see no New section and no round New button (`useBooksAccess`).
+- The sidebar layout, the shortcuts and the decisions of 2026-11-23 are in "Sidebar layout" below.
 - The Lists hub shows one card per available list entry.
 - The Lists hub shows an empty state when no list entry is available.
 - `/a/books` redirects to `/a/books/lists`.
-- The sidebar, + New menu and Lists hub entries are one typed constant each in `lib/shell-nav.ts`; later units append entries.
+- The sidebar, New section and Lists hub entries are one typed constant each in `lib/shell-nav.ts`; later units append entries.
 
+## Sidebar layout
+Recorded 2026-11-23 (unit p1-sidebar-shortcuts). The layout follows QuickBooks Desktop's left icon bar: "My Shortcuts" on top, the fixed list of centers under it. The same component is the desktop sidebar and the phone drawer; native gets the same.
+
+From the top:
+1. **Shortcuts.** The user's own list, with a pencil button, Customize shortcuts. A shortcut is `{ kind, ref }` with kind `screen` (a sidebar or Lists entry), `new` (a New action), `report` (a Books report: the shipped key of a shipped one, the row id of a saved one) or `register` (an account id). A user with no stored list gets the defaults: Customers, Vendors, Products and services, Profit and Loss, Balance Sheet. An empty stored list shows "No shortcuts", not the defaults. A shortcut whose target is gone or not readable draws no row. The list holds at most 30.
+2. **New.** The New actions in their three groups. Folds; the state persists. Hidden for a reader.
+3. **Reports.** The Books reports the user can read, the shipped ones first, then "All reports". Folds; closed at first, because Books ships more reports than fit above the navigation.
+4. **Go to.** The fixed navigation: Dashboard, Banking, Sales, Expenses, Lists, the Accounting group (folds), Taxes, Settings. It has no Reports entry.
+
+Customize shortcuts is a dialog (a sheet on a phone): Add shortcut (one searchable list of screens, forms, reports and registers; no form for a reader), Remove, Move up, Move down, drag, Reset to defaults. It edits a draft and writes one time on Save. A draft equal to the defaults deletes the stored row.
+
+Decisions:
+- **The New popover is removed.** Its entries are the New section. The `NewFab` component stays, on phones only, and opens the drawer with the New section open: core's drawer has no visible control that opens it. It is hidden on forms, on record pages and on a report.
+- **A sidebar row closes the phone drawer at once.** Core's `SidebarItem` closed it with a timer 500 ms after the press, and that timer also closed a drawer the round New button had opened again inside that time. The fix is in core (`closesDrawer` closes with no timer); Books rows use `closesDrawer` and have no code of their own for it.
+- **Books reports open inside Books.** Route `/a/books/reports/<id>` draws core's `ReportScreen` with `basePath="books/reports"`, so drill links, Back and Save as stay on the Books route and the Books sidebar stays. Every Books link to a report (`shippedReportHref`) builds this route. The route never unmounts `ReportScreen` for a loading or failed read: Edit runs the builder on the same route and holds unsaved state. A report of another package opened on this route shows a note with a link to core's route. `/a/books/reports` is the Books reports screen (the same list as the Reports section, with "All reports" last): Back from a Books report with no history opens it, so Back never leaves Books.
+- **Core's Reports hub stays; only its entry in core's main navigation is removed** (decision of the human, 2026-11-23). "All reports" in the Reports section opens it filtered to Books (`/a/reports?package=books`).
+- **Books settings are also panels of core Settings** (decision of the human, 2026-11-23): the seven sections are in the manifest list `settings`, so an organization owner or admin finds them under Books in Settings. Both entry points draw `SectionPanel`; the Books sidebar keeps its Settings entry, which a Books admin who is not an organization admin needs.
+
 ## Data
-No collections read. Access level from `useBooksAccess`. Persisted fold state in a Zustand store (`books-ui-store`). Package files that Metro loads import each other relatively (`../lib/x`), never with `~/tinycld/books/...`.
+`books_sidebar_shortcuts`: one row for each user (`user`, `items` as a JSON list), read with `useMyLiveQuery`; a user reads and writes only their own row. The Reports section and the report shortcuts read core's `reports` collection, filtered to sources that start with `books.`. Access level from `useBooksAccess`. Persisted fold states (Accounting, New, Reports) in a Zustand store (`books-ui-store`). Package files that Metro loads import each other relatively (`../lib/x`), never with `~/tinycld/books/...`.
 
 ## Cut
 - Bookmarks, Payroll, Time, Projects, My accountant, Live bookkeeping, Banking services, Commerce, Apps, Menu settings: outside the v0 scope.
@@ -37,4 +55,4 @@
 Grouping by counterparty: `Popover` columns / `ui/bottom-drawer`. Orientation: `SidebarItem` active state and `SidebarHeading`.
 
 ## Non-goals
-Dashboard, search in the menu, drag-reorder of the sidebar, per-user menu customization.
+Dashboard, search in the menu, reorder of the fixed navigation, shortcuts to records (one customer, one invoice), shortcuts shared between users.
````

- [ ] **Step 6: Generate the help registry and run every help test**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run packages:generate`
Expected: ends with no error.

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH vitest run tests/help-`
Expected: PASS, no failed test (the new file and every other help test).

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH biome check tests/help-sidebar-shortcuts.test.ts`
Expected: no error.

- [ ] **Step 7: Commit**

````bash
cd /Users/nas/tmp/tinycld/books/books
git add help/sidebar-shortcuts.md help/navigating-books.md help/reports.md help/settings.md docs/specs/books-shell-design.md tests/help-sidebar-shortcuts.test.ts
git commit -m "books: help and spec record for the sidebar shortcuts"
````

---

## Coverage of the unit (parts 1 to 3)

| Item of `covers` (or added by the human) | Where |
|---|---|
| Sidebar reorganized after QuickBooks Desktop, layout recorded | part 2 tasks 8b, 9; part 3 task 14; recorded by task 20 (`docs/specs/books-shell-design.md`, "Sidebar layout") |
| Per-user shortcuts (pin, remove, reorder) in a Books collection read with `useMyLiveQuery` | part 1 (collection, rules, `useSidebarShortcuts`); part 2 tasks 10, 11 (dialog, Add shortcut) |
| Default shortcuts | part 1 (`DEFAULT_SHORTCUTS`); part 2 task 8b; e2e task 18 |
| New popover entries as a collapsible New section; popover and NewFab decision recorded | part 2 tasks 9, 9b; recorded by task 20 ("Decisions") |
| Phone layout and native get the same | one sidebar component for the sidebar and the drawer, no web-only API (parts 2, 3); the drawer closes at once on a row press (core task 12c); phone e2e in tasks 18, 19 |
| Help topic update | task 20 |
| E2E at desktop and phone widths | tasks 18, 19 (and part 2 task 9b for the moved New door); parallel workers, each list-writing test with a user of its own |
| Added (a): Books reports open in the Books sidebar's frame | part 2 task 12 (core), part 3 tasks 13, 14, 15, 19; Back with no history stays in Books (`/a/books/reports`, task 13; e2e task 19) |
| Added (b): Books settings in core Settings | part 3 tasks 16, 19 |
| Core Reports hub kept, its nav entry removed | part 2 task 12b (core); "All reports" in task 14 |
