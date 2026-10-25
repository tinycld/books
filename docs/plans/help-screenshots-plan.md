# Help Screenshot Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm exec tinycld-pkg help:screenshots [--topic <id>]` regenerates a member's help images (light and dark), and Books ships the first screenshot set and the `help/screenshots.ts` that drives it.

**Architecture:** A new verb in `@tinycld/package-scripts` (core repo, nested `tinycld/package-scripts/`) runs Playwright with a shipped config and a shipped generic spec. The config extends the member's own `playwright.config.ts`, so the webServer, ports and browser setup are the same as `test:e2e`. The spec loads `<member>/help/screenshots.ts`, runs each `Shot.setup` once per colour scheme, and writes `help/images/<name>.png` and `<name>.dark.png`. Pure logic (argument parsing, topic selection, file names) lives in `src/help-screenshots.ts` and is unit-tested. Books adds `help/screenshots.ts` and image references in its help topics.

**Tech Stack:** TypeScript, tsx, Playwright, vitest, `@tinycld/core/e2e-helpers`.

**Spec:** `~/code/tinycld/docs/superpowers/specs/2026-10-21-books-design.md` ("Help and docs"); contract: `tinycld/docs/packages.md` section "Help screenshots (contract; not yet implemented)". Image resolution (`images/x.png`, `x.dark.png`) already shipped in unit p0b-help-images.

## Global Constraints

- Core names no package. Core code and tests use fictional slugs; only the Books task names `books`.
- Web and native parity: the command only writes files the renderer already consumes on both platforms.
- `setup` drives the real UI; no raw PocketBase writes. The command never seeds data (it runs against the seeded e2e server).
- No `any`, no `biome-ignore`, no `console.*` in runtime code (the CLI files are exempt as build tooling). 4-space indent, single quotes, ES5 trailing commas, no semicolons.
- Output names: `help/images/<name>.png` (light) and `help/images/<name>.dark.png`; `<name>` is `<topic-id>-<n>` and a shot name that is not a plain `[a-z0-9-]+` token fails the run.
- Core branch `books/p1-help-screenshots` in `~/tmp/tinycld/books-purchases/tinycld`; Books branch of the same name in `.../books`. Core PR merges first.
- Set `E2E_PORT=7210 E2E_PORT_2=7211` before every e2e command; check the ports are free first.
- Run `pnpm` only at the workspace root `~/tmp/tinycld/books-purchases`; inside a member use `pnpm exec tinycld-pkg ...`. No Claude mention in commits.

## Review Focus

1. A topic id in `--topic` that has no entry in `screenshots.ts` must fail with a message naming the known ids, not write nothing and exit 0.
2. A `screenshots.ts` that is missing, or has an entry with zero shots, must fail loudly.
3. Two shots resolving to the same file name must fail before any browser starts.
4. A failing `setup` must not leave a half-written or stale PNG that looks fresh (write only after `setup` and the screenshot succeed).
5. `--topic` must not be forwarded to Playwright as an unknown flag.

---

### Task 1: Pure helpers and the `help:screenshots` runner (core)

**Files:**
- Create: `tinycld/package-scripts/src/help-screenshots.ts`
- Create: `tinycld/package-scripts/tests/help-screenshots.test.ts`
- Modify: `tinycld/package-scripts/src/targets.ts` (the `Verb` union)
- Modify: `tinycld/package-scripts/src/runners.ts`
- Modify: `tinycld/package-scripts/src/cli.ts`
- Modify: `tinycld/package-scripts/tests/runners.test.ts`

**Interfaces:**
- Produces (`help-screenshots.ts`):
  - `export interface Shot { name: string; setup: (page: Page) => Promise<void>; target?: string }` (`Page` is a type import from `@playwright/test`)
  - `export type ScreenshotPlan = Record<string, Shot[]>`
  - `export function parseTopicFlag(args: string[]): { topic?: string; rest: string[] }`
  - `export function planFiles(plan: ScreenshotPlan, topic?: string): { topicId: string; shot: Shot; light: string; dark: string }[]`, where `light` is `images/<name>.png` and `dark` is `images/<name>.dark.png` (paths relative to `help/`). Throws `Error` for an unknown topic (message lists known ids), a topic with no shots, a shot name that is not `/^[a-z0-9]+(-[a-z0-9]+)*$/`, a name that does not start with `<topic-id>-`, and a duplicate name.
- Produces (`runners.ts`): `export function buildHelpScreenshotsCommand(pkg: CurrentPackage, appDir: string, opts: { topic?: string; passthrough?: string[] }): Command` returning `{ bin: 'playwright', args: ['test', '--config', <package-scripts>/src/help-screenshots.config.ts, ...passthrough], cwd: pkg.dir }` and carrying env `HELP_SCREENSHOTS_MEMBER=<pkg.dir>` and, when set, `HELP_SCREENSHOTS_TOPIC=<topic>`. `Command` gains an optional `env?: Record<string, string>`.

- [ ] **Step 1: Write the failing tests**

`tests/help-screenshots.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { type ScreenshotPlan, parseTopicFlag, planFiles } from '../src/help-screenshots'

const noop = async () => {}
const plan: ScreenshotPlan = {
    'alpha-topic': [{ name: 'alpha-topic-1', setup: noop }, { name: 'alpha-topic-2', setup: noop }],
    'beta-topic': [{ name: 'beta-topic-1', setup: noop }],
}

describe('parseTopicFlag', () => {
    it('extracts --topic and leaves the rest', () => {
        expect(parseTopicFlag(['--topic', 'alpha-topic', '--x'])).toEqual({ topic: 'alpha-topic', rest: ['--x'] })
    })
    it('accepts --topic=id', () => {
        expect(parseTopicFlag(['--topic=beta-topic'])).toEqual({ topic: 'beta-topic', rest: [] })
    })
    it('returns no topic when absent', () => {
        expect(parseTopicFlag([])).toEqual({ rest: [] })
    })
    it('throws when --topic has no value', () => {
        expect(() => parseTopicFlag(['--topic'])).toThrow(/--topic needs a topic id/)
    })
})

describe('planFiles', () => {
    it('lists light and dark files for every shot', () => {
        const files = planFiles(plan)
        expect(files.map(f => f.light)).toEqual([
            'images/alpha-topic-1.png',
            'images/alpha-topic-2.png',
            'images/beta-topic-1.png',
        ])
        expect(files[0].dark).toBe('images/alpha-topic-1.dark.png')
    })
    it('narrows to one topic', () => {
        expect(planFiles(plan, 'beta-topic')).toHaveLength(1)
    })
    it('fails for an unknown topic and names the known ones', () => {
        expect(() => planFiles(plan, 'nope')).toThrow(/Unknown topic "nope".*alpha-topic.*beta-topic/)
    })
    it('fails for a topic with no shots', () => {
        expect(() => planFiles({ empty: [] })).toThrow(/Topic "empty" has no shots/)
    })
    it('fails for a name that is not a plain token', () => {
        expect(() => planFiles({ t: [{ name: 't-../x', setup: noop }] })).toThrow(/Invalid shot name/)
    })
    it('fails when the name does not start with the topic id', () => {
        expect(() => planFiles({ t: [{ name: 'other-1', setup: noop }] })).toThrow(/must start with "t-"/)
    })
    it('fails on duplicate names across topics', () => {
        expect(() =>
            planFiles({ 'a': [{ name: 'a-1', setup: noop }], 'a-1': [{ name: 'a-1-1', setup: noop }, { name: 'a-1', setup: noop }] })
        ).toThrow(/Duplicate shot name "a-1"/)
    })
})
```

Add to `tests/runners.test.ts` (match the file's existing import style and `pkg` fixture):

```ts
describe('buildHelpScreenshotsCommand', () => {
    it('runs playwright with the shipped config and passes the member through env', () => {
        const cmd = buildHelpScreenshotsCommand(pkg, '/app', { topic: 'alpha-topic' })
        expect(cmd.bin).toBe('playwright')
        expect(cmd.args.slice(0, 2)).toEqual(['test', '--config'])
        expect(cmd.args[2]).toMatch(/help-screenshots\.config\.ts$/)
        expect(cmd.args).not.toContain('--topic')
        expect(cmd.env).toEqual({ HELP_SCREENSHOTS_MEMBER: pkg.dir, HELP_SCREENSHOTS_TOPIC: 'alpha-topic' })
    })
    it('omits the topic env when no topic is given', () => {
        const cmd = buildHelpScreenshotsCommand(pkg, '/app', {})
        expect(cmd.env).toEqual({ HELP_SCREENSHOTS_MEMBER: pkg.dir })
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `~/tmp/tinycld/books-purchases/tinycld/package-scripts`): `pnpm exec vitest run tests/help-screenshots.test.ts tests/runners.test.ts`
Expected: FAIL (modules/exports missing).

- [ ] **Step 3: Implement**

`src/help-screenshots.ts`:

```ts
import type { Page } from '@playwright/test'

export interface Shot {
    name: string
    setup: (page: Page) => Promise<void>
    target?: string
}

export type ScreenshotPlan = Record<string, Shot[]>

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function parseTopicFlag(args: string[]): { topic?: string; rest: string[] } {
    const rest: string[] = []
    let topic: string | undefined
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === '--topic') {
            const value = args[i + 1]
            if (!value || value.startsWith('--')) throw new Error('--topic needs a topic id')
            topic = value
            i++
        } else if (arg.startsWith('--topic=')) {
            topic = arg.slice('--topic='.length)
        } else {
            rest.push(arg)
        }
    }
    return topic ? { topic, rest } : { rest }
}

export function planFiles(plan: ScreenshotPlan, topic?: string) {
    const known = Object.keys(plan)
    if (topic && !known.includes(topic)) {
        throw new Error(`Unknown topic "${topic}". Known topics: ${known.join(', ')}`)
    }
    const seen = new Set<string>()
    const files: { topicId: string; shot: Shot; light: string; dark: string }[] = []
    for (const topicId of known) {
        const shots = plan[topicId]
        if (shots.length === 0) throw new Error(`Topic "${topicId}" has no shots`)
        for (const shot of shots) {
            if (!NAME.test(shot.name)) throw new Error(`Invalid shot name "${shot.name}"`)
            if (!shot.name.startsWith(`${topicId}-`)) {
                throw new Error(`Shot "${shot.name}" must start with "${topicId}-"`)
            }
            if (seen.has(shot.name)) throw new Error(`Duplicate shot name "${shot.name}"`)
            seen.add(shot.name)
            if (topic && topicId !== topic) continue
            files.push({
                topicId,
                shot,
                light: `images/${shot.name}.png`,
                dark: `images/${shot.name}.dark.png`,
            })
        }
    }
    return files
}
```

`targets.ts`: `export type Verb = 'typecheck' | 'test' | 'test:e2e' | 'check' | 'help:screenshots'`.

`runners.ts`: add `env?: Record<string, string>` to `Command`; add

```ts
export function buildHelpScreenshotsCommand(
    pkg: CurrentPackage,
    _appDir: string,
    opts: { topic?: string; passthrough?: string[] }
): Command {
    const config = path.join(import.meta.dirname, 'help-screenshots.config.ts')
    const env: Record<string, string> = { HELP_SCREENSHOTS_MEMBER: pkg.dir }
    if (opts.topic) env.HELP_SCREENSHOTS_TOPIC = opts.topic
    return {
        bin: 'playwright',
        args: ['test', '--config', config, ...(opts.passthrough ?? [])],
        cwd: pkg.dir,
        env,
    }
}
```

`cli.ts`: in `commandsFor` add a case `'help:screenshots'` that calls `parseTopicFlag(passthrough)` and returns `[buildHelpScreenshotsCommand(pkg, appDir, { topic, passthrough: rest })]`; add the verb to the error and usage strings; `--all` with this verb is rejected with `help:screenshots runs one package at a time`. In `spawn.ts`, merge `cmd.env` over `process.env` when spawning (read the file first and keep its style).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run tests/help-screenshots.test.ts tests/runners.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (`git add` the files above; message `feat(package-scripts): help:screenshots verb, pure helpers`), then push.

---

### Task 2: Playwright config and generic spec (core)

**Files:**
- Create: `tinycld/package-scripts/src/help-screenshots.config.ts`
- Create: `tinycld/package-scripts/src/help-screenshots.spec.ts`
- Modify: `tinycld/docs/packages.md` (drop "contract; not yet implemented", document the shipped behaviour)

**Interfaces:**
- Consumes: `planFiles`, `ScreenshotPlan` (Task 1); env `HELP_SCREENSHOTS_MEMBER`, `HELP_SCREENSHOTS_TOPIC`.
- Produces: writes `<member>/help/images/*.png`.

- [ ] **Step 1: Write the config**

```ts
import path from 'node:path'
import { defineConfig } from '@playwright/test'

const member = process.env.HELP_SCREENSHOTS_MEMBER
if (!member) throw new Error('HELP_SCREENSHOTS_MEMBER is not set; run through `tinycld-pkg help:screenshots`')

// The member's own config carries the webServer, ports and browser setup; only
// the test dir and match change, so screenshots run against the same server as e2e.
const memberConfig = (await import(path.join(member, 'playwright.config.ts'))).default

export default defineConfig({
    ...memberConfig,
    testDir: import.meta.dirname,
    testMatch: 'help-screenshots.spec.ts',
    fullyParallel: false,
    workers: 1,
    retries: 0,
})
```

`workers: 1` and `retries: 0` here are not a flake workaround: the command writes files in a fixed order and a retry would re-run `setup` against changed state. Say so in a comment.

- [ ] **Step 2: Write the spec**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { login } from '@tinycld/core/e2e-helpers'
import { planFiles, type ScreenshotPlan } from './help-screenshots'

const member = process.env.HELP_SCREENSHOTS_MEMBER ?? ''
const topic = process.env.HELP_SCREENSHOTS_TOPIC
const helpDir = path.join(member, 'help')
const imagesDir = path.join(helpDir, 'images')

async function loadPlan(): Promise<ScreenshotPlan> {
    const file = path.join(helpDir, 'screenshots.ts')
    if (!fs.existsSync(file)) throw new Error(`${file} does not exist`)
    return (await import(file)).default
}

const files = planFiles(await loadPlan(), topic)

for (const scheme of ['light', 'dark'] as const) {
    test.describe(scheme, () => {
        test.use({ colorScheme: scheme, viewport: { width: 1280, height: 800 } })

        for (const { shot, light, dark } of files) {
            test(`${shot.name}`, async ({ page }) => {
                await login(page)
                await shot.setup(page)
                const out = path.join(helpDir, scheme === 'light' ? light : dark)
                const buffer = shot.target
                    ? await page.locator(shot.target).screenshot()
                    : await page.screenshot()
                fs.mkdirSync(imagesDir, { recursive: true })
                fs.writeFileSync(out, buffer)
                expect(fs.existsSync(out)).toBe(true)
            })
        }
    })
}
```

The file is written only after `setup` and the screenshot both succeed (Review Focus 4). `planFiles` throws at collection time for bad plans (Review Focus 1-3), which fails the run before any browser starts.

- [ ] **Step 3: Verify the failure paths** (from `~/tmp/tinycld/books-purchases/books`, with `E2E_PORT=7210 E2E_PORT_2=7211`, once Task 3 exists):
  - `pnpm exec tinycld-pkg help:screenshots --topic nope` exits non-zero and prints `Unknown topic "nope". Known topics: ...`.
  - Temporarily rename `help/screenshots.ts`: exits non-zero with `does not exist`. Restore it.

- [ ] **Step 4: Update `docs/packages.md`**: retitle the section to `Help screenshots`, delete "(contract; not yet implemented)", add: the command writes only after a shot succeeds, unknown topic and bad plans fail, the viewport is 1280x800, and light/dark come from the browser colour scheme.

- [ ] **Step 5: Run `pnpm exec tinycld-pkg check` in `tinycld/package-scripts`'s owning member (the app shell, `~/tmp/tinycld/books-purchases/tinycld`). Fix anything red at the source. Commit `feat(package-scripts): help screenshot playwright runner`, push, open the core PR (`gh pr create`, short body).**

---

### Task 3: Books screenshot plan, images and help references (books)

**Depends on:** Task 2 on the core branch (the workspace links core by path, so the verb is available on the same branch).

**Files:**
- Create: `books/help/screenshots.ts`
- Create: `books/help/images/chart-of-accounts-1.png`, `chart-of-accounts-1.dark.png`, `account-register-1.png`, `account-register-1.dark.png` (generated by the command, committed)
- Modify: `books/help/chart-of-accounts.md`, `books/help/account-register.md` (one image reference each)
- Modify: `books/README.md` (a "Regenerating help images" paragraph)
- Test: `books/tests/e2e/help-screenshots.spec.ts`

**Interfaces:**
- Consumes: `Shot`, `ScreenshotPlan` shape (Task 1) via structural typing; import the types as `import type { ScreenshotPlan } from '@tinycld/package-scripts/help-screenshots'` only if the package exports it; otherwise declare `satisfies` against a local type-free object (no import from core internals by relative path).
- Produces: the first Books image set and the pattern later phases extend: add topic entries to `help/screenshots.ts` and run the command.

- [ ] **Step 1: Write the e2e check first.** `tests/e2e/help-screenshots.spec.ts` logs in, navigates to Books, opens Help (`openHelp('books:chart-of-accounts')` route via the help hub), and asserts the topic renders an `img` whose `naturalWidth > 0`, in light and again after `page.emulateMedia({ colorScheme: 'dark' })` that the `src` differs from light. Run it: it fails because no image is referenced yet.
- [ ] **Step 2: Write `help/screenshots.ts`.** Default export, one entry per topic that needs a picture (screens that are not obvious): `chart-of-accounts` (shot `chart-of-accounts-1`: open Accounting > Chart of Accounts using the same `books-nav-accounts` / `books-nav-accounting-toggle` steps as `tests/e2e/chart-of-accounts.spec.ts`, target the account table) and `account-register` (shot `account-register-1`: open the Business Checking register from the chart, target the register table). `setup` uses only `navigateToPackage` / UI clicks. Other topics (navigating-books, settings, setup-wizard) stay without images: their screens are obvious or run only once.
- [ ] **Step 3: Generate.** `E2E_PORT=7210 E2E_PORT_2=7211 pnpm exec tinycld-pkg help:screenshots` from `books/`. Check the four PNGs exist, are non-empty, and that a light/dark pair differ. Look at each image; no seeded personal data other than the demo seed.
- [ ] **Step 4: Reference the images.** In each topic add `![<alt text>](images/<name>.png)` after the lead paragraph, with alt text that describes the screen. Run `cd ~/tmp/tinycld/books-purchases/tinycld && pnpm run packages:generate` (the generator fails on a missing image).
- [ ] **Step 5: README paragraph** explaining the command, that images are committed, and how to add a topic.
- [ ] **Step 6: Run the e2e spec, then `pnpm exec tinycld-pkg check` in `books/`.** Both green. Also run `help-screenshots` e2e at a phone viewport (`{ width: 390, height: 844 }`, navigate first, then `setViewportSize`) and assert the same image visible.
- [ ] **Step 7: Commit** `feat(books): help screenshots and first image set`, push, open the Books PR (base `main`; body: unit id, covers, deferrals none, "Merge bottom up with a merge commit.").

---

## Self-review

- Spec coverage: "Help topics and Playwright screenshot generation per phase" -> Tasks 1-3; light/dark -> Task 2 spec; seeded data, no raw writes -> constraints and Task 3 setups.
- Names consistent: `planFiles`, `parseTopicFlag`, `ScreenshotPlan`, `buildHelpScreenshotsCommand`, env names.
- Per-phase reuse: later phases add entries to `help/screenshots.ts` and rerun; no code change needed.
