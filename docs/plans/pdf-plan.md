# Books PDF Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Books renders a branded, paginated US Letter PDF on the server from one HTML template, serves it through a session-only `GET /api/books/pdf/...` route, and Books Settings has a "Preview PDF" button that downloads a sample invoice with the real organization branding and company details.

**Architecture:** Three repos, in order. (1) omnidoc fork PR (`github.com/nathanstitt/omnidoc`): repeat `<thead>` on every page a table spans, draw accented Latin with the right glyphs, per-rune glyph fallback (later families in the list, bundled Greek and Cyrillic, a caller-supplied fonts directory, installed fallback fonts, each with a glyph check), and margin boxes that inherit the root font; tag `v1.2.0`. (2) Core checkpoint 0 (`tinycld`, branch `books/p2-pdf`): optional `brand_color` on `org_branding` (new appended migration), a picker in Organization branding settings, an exported Go helper `branding.Load` for server renderers, `docfonts.Dir()` (the `TINYCLD_FONTS_DIR` fonts directory), and the omnidoc bump; the core PR merges before any Books task. (3) Books (`books/p2-pdf`): Go display formatters pinned to the TS ones by shared JSON vectors, a document model with a formatted view, one `html/template` page, the omnidoc renderer, a document-kind registry with one kind (`sample`), the route, a client download helper, the Settings button, a help topic and e2e.

**Tech Stack:** Go 1.27 (PocketBase 0.40 fork, `html/template`, omnidoc v1.2.0), TypeScript (React Native + web, pbtsdb, react-hook-form + zod, expo-file-system 58 / expo-sharing 58), vitest, Playwright.

**Spec:** Run manifest unit `p2-pdf` in `/Users/nas/code/tinycld/docs/superpowers/plans/2026-10-21-books-run-manifest.yaml`; design spec `/Users/nas/code/tinycld/docs/superpowers/specs/2026-10-21-books-design.md` (:33 "PDF for invoices, estimates, statements, reports (server-rendered, one template with org logo and brand color)"; :64 transaction layout); research `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-pdf/research.md`; earlier-unit facts `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-pdf/memories.md`; probe `/Users/nas/tmp/tinycld/auto-helix-books/staging/p2-pdf/probe/main.go`.

## HUMAN DECISION

Decided by the human on 2026-11-06 (quoted from research.md):

1. "Engine: omnidoc (github.com/nathanstitt/omnidoc, core dep v1.1.2, core/server/go.mod:40) HTML->PDF. Fix its gaps in omnidoc first (vendor fork PR, new tag), then bump core."
2. "Brand color: new optional field on core `org_branding` + picker in Organization branding settings (core/components/settings/OrgBrandingSection.tsx) + help (core/help/organization-branding.md). Core checkpoint 0; core PR merges before any Books checkpoint."
3. "Scope: engine + sample preview. Go renderer, document model, template, Go formatters, document-kind registry + GET /api/books/pdf/... route, client download helper, "Preview PDF" in Books Settings that renders a sample invoice with the org branding. E2E + help topic."
4. "Paper: Letter only."

Choices this plan makes inside those decisions (not product questions):

- **Margin-box serif is a real omnidoc gap.** Probed: `html { font-family: sans-serif }` does NOT make the footer sans, and neither does `@page { font-family }`; only a `font-family` inside the margin-box rule works. `marginBoxBaseStyle()` (`pkg/internal/layout/css/marginbox.go:386`) hard-codes serif. Task 5 fixes it (margin boxes inherit the root element's font and color).
- **`<thead>` repeat is a bug, not a missing feature.** omnidoc already clones the header onto each continuation (`repeatHeaderOnTail`, `tablepage.go:136`), but `shiftFragmentExtras` (`block.go:1706`) does not move `Fragment.HeaderBottom` when a table that is not at the top of the page moves into page space, so the guard at `tablepage.go:137` returns early. Task 1 is a one-line fix plus tests. `<tfoot>` repeat is out of scope (no code exists; Books does not use `<tfoot>`); Task 5 records it in omnidoc's `docs/BACKLOG.md`.
- **Glyph fallback boundary.** omnidoc bundles only TeX Gyre (Latin), Inconsolata, Noto Hebrew and Noto Naskh Arabic, and falls back per rune only to those two script faces and to the first installed emoji font (without checking the glyph). In scope: (a) accented Latin draws the right glyph (today é, ñ, ü draw the TeX Gyre small-cap glyphs: Task 2); (b) Greek and Cyrillic from the Go fonts already in `golang.org/x/image` (Task 3); (c) CSS per-character fallback: later families in the run's `font-family` list, then the bundled script faces, then every font file in a caller-supplied directory (new option `WithFallbackFontDir`), then a fixed list of common installed fallback families (Noto, DejaVu, platform CJK/Indic/symbol fonts), each checked for the glyph (Task 4). Books passes the directory named by the core env var `TINYCLD_FONTS_DIR` (core helper `docfonts.Dir()`, Task 6; Books renderer Task 10). Result: a user-typed name in Latin, Greek, Cyrillic, Hebrew or Arabic always prints; Chinese, Japanese, Korean, Devanagari, Thai and symbols such as ✓ print when the fonts directory or the server's installed fonts have them, else they draw the `.notdef` box and Books logs a warning. Bundling CJK fonts (15+ MB) in omnidoc is out of scope; providing the font files for the directory is the tracked follow-up F1 (see "Follow-ups").
- **Fonts directory config: env var `TINYCLD_FONTS_DIR`.** Verified: core reads server-operator paths from `TINYCLD_*` env vars (`TINYCLD_STATE_DIR` in `coreserver/state_paths.go:18`, `TINYCLD_TYPES_DIR` in `coreserver/static.go:207`). `syscfg`/`system_settings` holds service credentials an admin edits in the app, which is wrong for a server filesystem path. A new core package `tinycld.org/core/docfonts` reads the env var, so every server renderer (Books now, others later) shares one setting; the package names no feature package.
- **omnidoc's existing `WithSystemFontProvider`/`DirFontProvider` is not enough.** Verified (`pkg/omnidoc/fonts.go:35-70`, `html_backend.go:157,305-311`): the provider answers `@font-face local()` names and family-name lookups by file base name, and setting one REPLACES the OS font provider. A directory of `NotoSansCJKsc-Regular.otf`-style files never matches a family name in the fallback list, and setting the provider would turn off installed fonts. So Task 4 adds `WithFallbackFontDir(dir)`: every font in the directory joins per-character fallback (with the glyph check), and installed fonts stay on. Arabic letter joining with the bundled Naskh face looks wrong in the probe; out of scope, recorded in omnidoc `docs/BACKLOG.md` (Task 5).
- **OAuth: session only.** The route is not added to `oauthPackage()` `EndpointPrefixes`, so core's grant middleware default-denies it to every token, like `/api/books/balances/rebuild`. Reason: the only caller is the app's own download button; a token-holder can already read the records a PDF prints, and an endpoint that renders server-side for a token is a cost surface no CLI command needs yet. A later unit that wants `tinycld books invoice pdf` adds `{Method: "GET", Prefix: "/api/books/pdf/", Scopes: []string{"books:read"}}` with its own test. Pinned in Task 11.
- **No keyboard shortcut for "Preview PDF".** The data-entry rule (memory p3-transfer) covers data-entry forms (entries, transfers, bills, invoices, expenses). The Settings Company form is not one, and its Save has no shortcut either.
- **Renderer runs omnidoc in system-font mode** (the default, not `WithBundledFonts`) so a server with CJK/Indic fonts installed prints those names; the template uses the generic `sans-serif`, which always resolves to bundled TeX Gyre Heros, so Latin output is the same on every host.

## Behavior changes the reviewer will see

1. Every omnidoc user in core (`textextract`, `thumbnails`) gets the v1.2.0 fixes: accented Latin draws normal glyphs instead of small caps, and margin boxes take the root font. Core's own tests run after the bump (Task 6).
2. `org_branding.brand_color` is publicly readable, like the logo (list/view rules stay `''`; `rlstest/accessguard.go:33-34` already allowlists them).
3. The PDF prints the logo uncropped, at most 200 × 64 px (the stored `logo_crop` frames a circular avatar). Accepted by the human, 2026-11-06.
4. Books gains one route, `GET /api/books/pdf/{kind}` and `GET /api/books/pdf/{kind}/{id}`. It returns `application/pdf` with `Content-Disposition: attachment; filename="<name>.pdf"` and `Cache-Control: no-store`.
5. A server with `TINYCLD_FONTS_DIR` set to a directory of font files prints characters from those fonts when the bundled fonts lack them. Unset (the default), nothing changes.

## Global Constraints

- Workspace: `/Users/nas/tmp/tinycld/books` (members `tinycld` with core at `tinycld/core`, `books`, `boards`, `calendar`, `mail`). Books is on branch `books/p2-pdf` (from 51bbda7). Core is at `tinycld/` on `main` (40a3b22).
- **Implementers never edit `/Users/nas/tmp/tinycld/books/tinycld/` (core) except in the core checkpoint 0 tasks (Tasks 6 and 7), which run on core branch `books/p2-pdf`.** Task 6 adds a core migration, so the driver takes the `exclusive` claim for Tasks 6–7 and holds it until the core PR merges. No Books task starts before the core PR is merged.
- omnidoc work (Tasks 1–5) happens only in the clone `/Users/nas/tmp/tinycld/omnidoc` on branch `tinycld-pdf-gaps`, PR against `nathanstitt/omnidoc` `main`. Do not edit the module cache (`/Users/nas/code/vendor/go/pkg/mod/...`). omnidoc rules (its `CONTRIBUTING.md:45`, `CLAUDE.md:13`): update `FEATURES.md` in the same PR; open work goes in `docs/BACKLOG.md`. omnidoc CI runs gofmt, `go vet ./...`, govulncheck, `go test -race ./...`.
- Core must not name a package (CLAUDE.md "Core must not name a package"): no `books`, `invoice` code path, Books collection or `/api/books` in core code, tests or help. Core help says "documents the apps print, such as PDF files". `pnpm run check:core-isolation` must stay green; never add to its allowlist.
- Core migration `2020000001_create_org_branding.js` is released (present in tags v0.10.0, v0.10.1, v0.10.2): never edit it. The new field goes in a NEW migration `2090000012_org_branding_brand_color.js` (the highest today is `2090000011_rule_runs_record.js`). After it, run `cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run packages:generate` (memory p5-report-sharing: links the migration and regenerates `pbSchema.ts`).
- Books is unreleased; this plan adds no Books migration.
- Default brand color when unset: `mailer.BrandColor` (`#0d9488`, `core/server/mailer/template.go:12`), exported as `branding.DefaultColor`.
- Paper: US Letter only (`@page { size: Letter }`).
- Data rules (CLAUDE.md): pbtsdb only (`useLiveQuery`/`useMutation`), every Books `useLiveQuery` passes an explicit `queryKey`, no `useEffect`, no `any`, no `biome-ignore`, forms through zod + `zodResolver`, no raw hex in UI theming (the brand color itself is user data and is drawn as a style value, which is allowed), logging through `log` (`@tinycld/core/lib/logger`) and Go `logging.ForPackage`.
- `useMutation` from `@tinycld/core/lib/mutations`; RN 0.88 `onPress={() => void handleSubmit(fn)()}` (memory p5-report-builder).
- The PDF route is a file download, not a data endpoint (master plan :19 "PDF and file downloads are not data endpoints").
- Exact local commands:
  - Go (Books): `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run '<re>' -count=1`
  - Go (core): `cd /Users/nas/tmp/tinycld/books/tinycld/core/server && go test ./<pkg>/ -run '<re>' -count=1`
  - Go (omnidoc): `cd /Users/nas/tmp/tinycld/omnidoc && go test ./<pkg>/ -run '<re>' -count=1`
  - Books one vitest file: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/<file>`
  - Books biome on your files: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/biome check --write <files>`
  - Books check: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg check` (never `pnpm exec` in books: it triggers a workspace install)
  - Core one vitest file: `cd /Users/nas/tmp/tinycld/books/tinycld && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run <file>` (probed with `vitest list`)
  - Core checks: `cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run checks && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg check`
  - E2E (always with the ports): `cd /Users/nas/tmp/tinycld/books/books && E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- -g "pdf-preview:"` (Books) and `cd /Users/nas/tmp/tinycld/books/tinycld && E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- tests/e2e/org-brand-color.spec.ts` (core). Both filters were probed with `--list`.
- From the workspace root, plain `grep` skips member dirs (gitignored): use `command grep`. Quote shell globs (zsh).
- Use the Edit tool for multi-line edits (macOS: BSD `sed` differs from GNU).
- Playwright specs are ESM (no `__dirname`); read layout with `expect.poll`; `page.unrouteAll({ behavior: 'wait' })`, never `page.unroute`, while a handler may run; never `page.goto` for in-app moves.
- Test front-end behavior with e2e. Unit tests here are for Go, pure TS helpers, the zod schema and the vector/drift files only.
- Any red check is diagnosed at its root and fixed at the source; never a re-run, a longer timeout, a skip or a forced serial run.
- Commit messages never mention Claude, an assistant or a session.

## Review Focus

1. **A light brand color (yellow `#ffff00`, white `#ffffff`)**: the table header text must stay readable, not white on yellow. Pinned in Task 9 (`TestPDFView_PicksReadableTextOnTheBrandColor`).
2. **HTML in a user-typed name** (`<script>alert(1)</script> & "Co"` as a customer or business name): printed literally, never interpreted, and the PDF still renders. Pinned in Task 10 (`TestRenderPDF_EscapesHTMLInNames`).
3. **Names in accented Latin, Greek, Cyrillic and Hebrew** (`Zoë Ñandú Łódź`, `Ελληνικά ά`, `Москва`, `שלום`): no `.notdef` boxes and no small-cap glyphs. Pinned in omnidoc Tasks 2–3 and in Books Task 10 (`TestRenderPDF_PrintsNonLatinNamesWithoutMissingGlyphs`).
4. **A long document (300 lines)**: the column header repeats on every page and the footer reads "Page N of N" on the last page. Pinned in omnidoc Task 1 and Books Task 10 (`TestRenderPDF_LongDocumentRepeatsTheHeaderOnEveryPage`).
5. **A disabled user whose token is still valid, and a user without Books access**: the route answers 403 and renders nothing. Pinned in Task 11 (`TestPDFRoute_RefusesAnonymousNoAccessAndDisabled`).

Also pinned (not in the five): webp logo and missing logo (Task 10 `TestRenderPDF_EmbedsPngAndWebpLogos`, `TestRenderPDF_NoLogoPrintsTheNameOnly`), non-USD currency (Tasks 8–9), unreadable logo file in storage (Task 6 `TestLoad_UnreadableLogoFileDegrades`), a record the reader may not view (Task 11).

---

## File map

omnidoc (`/Users/nas/tmp/tinycld/omnidoc`):
- Modify `pkg/internal/layout/css/block.go` (`shiftFragmentExtras`), `pkg/internal/layout/css/tablepage_test.go`, `pkg/omnidoc/pagination_test.go`.
- Modify `pkg/internal/font/family.go` (`Face.aglGIDs`, `gidForRune`, constructors), `pkg/internal/font/sfnt.go:65`, `pkg/internal/font/family_test.go`.
- Modify `pkg/internal/font/standard/standard.go` (Go fonts, `ScriptFallback`), `pkg/internal/font/standard/standard_test.go`, `pkg/internal/font/standard/fonts/README.md`.
- Modify `pkg/internal/layout/font/cache.go` (`ResolveFallback` replaces `ResolveScriptFallback`/`resolveEmojiFallback`; `SetFallbackDir`), create `pkg/internal/layout/font/fallback_test.go`.
- Modify `pkg/omnidoc/html_backend.go` (`WithFallbackFontDir`, `openConfig.fallbackFontDir`), `pkg/omnidoc/fonts_test.go`.
- Modify `pkg/internal/layout/inline/shape.go:485,580`.
- Modify `pkg/internal/layout/css/marginbox.go`, `pkg/internal/layout/css/block.go` (Engine field), `pkg/internal/layout/css/paginate.go`, `pkg/internal/layout/css/pagemodel.go`; create test in `pkg/omnidoc/pagedmedia_test.go`.
- Modify `FEATURES.md`, `docs/BACKLOG.md`.

Core (`/Users/nas/tmp/tinycld/books/tinycld`):
- Create `core/server/pb_migrations/2090000012_org_branding_brand_color.js`.
- Create `core/server/branding/branding.go`, `core/server/branding/branding_test.go`.
- Create `core/server/docfonts/docfonts.go`, `core/server/docfonts/docfonts_test.go`.
- Modify `core/server/go.mod`, `core/server/go.sum` (omnidoc v1.2.0).
- Create `core/lib/brand-color.ts`, `core/lib/__tests__/brand-color.test.ts`, `core/components/settings/BrandColorSection.tsx`.
- Modify `core/components/settings/OrgBrandingSection.tsx`, `core/help/organization-branding.md`.
- Create `tests/e2e/org-brand-color.spec.ts`.

Books (`/Users/nas/tmp/tinycld/books/books`):
- Create `server/display_format.go`, `server/display_format_test.go`, `server/currency_symbols.json`, `server/testdata/display_format_vectors.json`, `tests/display-format.test.ts`.
- Create `server/pdf_document.go`, `server/pdf_document_test.go`.
- Create `server/pdf_template.html`, `server/pdf_render.go`, `server/pdf_render_test.go`.
- Create `server/pdf_kinds.go`, `server/pdf_sample.go`, `server/pdf_routes.go`, `server/pdf_routes_test.go`.
- Modify `server/go.mod` (omnidoc v1.2.0, `golang.org/x/image` for a test font), `server/register.go`, `server/registrations_test.go`.
- Create `tinycld/books/lib/pdf-download.ts`, `tinycld/books/hooks/usePdfDownload.ts`, `tinycld/books/hooks/useDocumentPreview.ts`, `tinycld/books/components/settings/DocumentPreviewCard.tsx`, `tests/pdf-download.test.ts`.
- Modify `tinycld/books/components/settings/CompanySection.tsx`.
- Create `help/documents.md`, `tests/help-documents.test.ts`; modify `help/settings.md`, `tests/help-settings.test.ts`.
- Create `tests/e2e/pdf-preview.spec.ts`.

---

## Phase A — omnidoc fork (repo `nathanstitt/omnidoc`)

Line numbers below are from v1.1.2 (module cache `/Users/nas/code/vendor/go/pkg/mod/github.com/nathanstitt/omnidoc@v1.1.2`). If `main` has moved, find the code by the function name.

### Task 1: omnidoc — repeat `<thead>` when the table is not at the top of the page

**Files:**
- Modify: `pkg/internal/layout/css/block.go` (`shiftFragmentExtras`, ~line 1706)
- Test: `pkg/internal/layout/css/tablepage_test.go`, `pkg/omnidoc/pagination_test.go`
- Modify: `FEATURES.md:217`

**Interfaces:**
- Consumes: `pagedTableText(t, tableHTML string, pageH float64) []string` and `longTable(n int, withHead bool) string` (`tablepage_test.go:208,240`).
- Produces: `Fragment.HeaderBottom` moves with its fragment in `shiftFragmentExtras`, so `repeatHeaderOnTail` (`tablepage.go:136`) repeats the header for a table anywhere on the page. Later Books tasks rely on: a table whose `<thead>` is `display: table-header-group` repeats it on every page.

- [ ] **Step 1: Clone and branch**

```bash
git clone https://github.com/nathanstitt/omnidoc /Users/nas/tmp/tinycld/omnidoc
cd /Users/nas/tmp/tinycld/omnidoc
git checkout -b tinycld-pdf-gaps origin/main
git log --oneline v1.1.2..HEAD
go test ./pkg/internal/layout/css/ -run 'TestTableHeader' -count=1
```
Expected: clone succeeds; the log lists any commits after v1.1.2 (note them in the PR); the existing header tests pass.

- [ ] **Step 2: Write the failing tests**

Append to `pkg/internal/layout/css/tablepage_test.go`:

```go
// A table below other content lays out in its own frame and is then moved into
// page space. Its HeaderBottom must move with it, or splitTableForPage sees the
// header above the table's top and never repeats it.
func TestTableHeaderRepeatsWhenTheTableIsNotFirst(t *testing.T) {
	pages := pagedTableText(t, "<p>intro</p>"+longTable(40, true), 300)
	if len(pages) < 3 {
		t.Fatalf("want at least 3 pages, got %d", len(pages))
	}
	for i, txt := range pages {
		if !strings.Contains(txt, "HEADER") {
			t.Errorf("page %d is missing the repeated header", i)
		}
	}
}
```

Append to `pkg/omnidoc/pagination_test.go` (add imports `bytes`, `context`, `fmt`, `strings` if the file lacks them):

```go
// Through the public API: an HTML table under a heading, written to PDF and read
// back, carries its header text once per page.
func TestHTMLTableHeaderRepeatsOnEveryPDFPage(t *testing.T) {
	var rows strings.Builder
	for i := 0; i < 120; i++ {
		fmt.Fprintf(&rows, "<tr><td>row %d</td></tr>", i)
	}
	src := `<!doctype html><html><head><style>@page { size: Letter; margin: 0.5in }</style></head><body>` +
		`<h1>Title above the table</h1><table><thead><tr><th>COLHEAD</th></tr></thead><tbody>` +
		rows.String() + `</tbody></table></body></html>`
	doc, err := OpenHTMLBytes([]byte(src), WithDefaultPaged(), WithBundledFonts())
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	var pdf bytes.Buffer
	if err := doc.WritePDF(context.Background(), &pdf, PDFOptions{}); err != nil {
		t.Fatalf("write pdf: %v", err)
	}
	back, err := OpenBytes(pdf.Bytes())
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	var text bytes.Buffer
	if err := back.WriteText(context.Background(), &text, MarkdownOptions{}); err != nil {
		t.Fatalf("text: %v", err)
	}
	pages := back.PageCount()
	if pages < 3 {
		t.Fatalf("want at least 3 pages, got %d", pages)
	}
	if got := strings.Count(text.String(), "COLHEAD"); got != pages {
		t.Errorf("header appears %d times over %d pages", got, pages)
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/omnidoc && go test ./pkg/internal/layout/css/ ./pkg/omnidoc/ -run 'TestTableHeaderRepeatsWhenTheTableIsNotFirst|TestHTMLTableHeaderRepeatsOnEveryPDFPage' -count=1`
Expected: FAIL — "page 0 is missing the repeated header" (pages 1–3 have no header), and "header appears 1 times over N pages".

- [ ] **Step 4: Fix `shiftFragmentExtras`**

In `pkg/internal/layout/css/block.go`, inside `func shiftFragmentExtras(f *Fragment, dx, dy float64)`, add before the loop over `f.Collapsed`:

```go
	// HeaderBottom is a Y in the same frame as f.Y; a table moved into page space
	// must carry it along, or splitTableForPage's `HeaderBottom <= Y` guard sees
	// the header above the table and skips the repeat.
	if f.HeaderBottom != 0 {
		f.HeaderBottom += dy
	}
```

- [ ] **Step 5: Run the tests and the layout + golden suites**

Run: `cd /Users/nas/tmp/tinycld/omnidoc && go test ./pkg/internal/layout/... ./pkg/omnidoc/ -count=1`
Expected: PASS, goldens included (the subagent probe confirmed no golden changes for this fix).

- [ ] **Step 6: Update FEATURES.md**

Edit the "Repeated `<thead>`" entry (`FEATURES.md:217`) so it reads: "Repeated `<thead>`: a table split across pages repeats its header group on every page it spans, wherever the table starts on the page. `<tfoot>` is drawn once, at the end of the table."

- [ ] **Step 7: Commit**

```bash
cd /Users/nas/tmp/tinycld/omnidoc
gofmt -l ./pkg
git add pkg/internal/layout/css/block.go pkg/internal/layout/css/tablepage_test.go pkg/omnidoc/pagination_test.go FEATURES.md
git commit -m "fix(layout): repeat thead when the table does not start the page"
```

### Task 2: omnidoc — accented Latin draws the plain glyph, not the small cap

**Files:**
- Modify: `pkg/internal/font/family.go` (`Face` struct ~line 65, `LoadStandard` ~line 159, `LoadScriptFallback` ~line 184, `gidForRune` ~line 226)
- Modify: `pkg/internal/font/sfnt.go:65`
- Test: `pkg/internal/font/family_test.go`

**Interfaces:**
- Consumes: `glyphsnames.GlyphToRune(glyph string) (rune, bool)` from `github.com/benoitkugler/textlayout/fonts/glyphsnames` (already a module dependency); `prog.nameToGID() map[string]fonts.GID`.
- Produces: `func aglRuneGIDs(names map[string]fonts.GID) map[rune]fonts.GID`; `Face.gidForRune` resolves é to the glyph named `eacute`, never `eacute.sc`.

- [ ] **Step 1: Write the failing test**

Append to `pkg/internal/font/family_test.go`:

```go
// The bundled TeX Gyre programs map accented code points to their small-cap
// alternates in the built-in cmap; a name route must win, so "Zoë" does not
// print as "Zoᴇ̈" in a small-cap e.
func TestStandardFacesMapAccentedLatinToPlainGlyphs(t *testing.T) {
	want := map[rune]string{
		'é': "eacute", 'ñ': "ntilde", 'ü': "udieresis", 'Å': "Aring",
		'ł': "lslash", 'Ł': "Lslash", 'č': "ccaron", 'ő': "ohungarumlaut",
	}
	for _, family := range []string{"sans-serif", "serif"} {
		for _, style := range []Style{{}, {Bold: true}, {Italic: true}} {
			face, ok := LoadStandard(family, style)
			if !ok {
				t.Fatalf("LoadStandard(%q, %+v) failed", family, style)
			}
			for r, name := range want {
				gid, ok := face.GID(r)
				if !ok {
					t.Errorf("%s %+v: no glyph for %q", family, style, r)
					continue
				}
				if got := face.GlyphName(gid); got != name {
					t.Errorf("%s %+v: %q drew glyph %q, want %q", family, style, r, got, name)
				}
			}
		}
	}
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/nas/tmp/tinycld/omnidoc && go test ./pkg/internal/font/ -run TestStandardFacesMapAccentedLatinToPlainGlyphs -count=1`
Expected: FAIL — `'é' drew glyph "eacute.sc", want "eacute"` (and the same for the others).

- [ ] **Step 3: Add the AGL route**

In `pkg/internal/font/family.go`, add a field to `Face` after `names`:

```go
	aglGIDs map[rune]fonts.GID // rune → GID by plain Adobe Glyph List name (no ".sc"/".alt" suffix)
```

Add the helper (imports `strings` and `github.com/benoitkugler/textlayout/fonts/glyphsnames`):

```go
// aglRuneGIDs maps each rune to the glyph whose plain Adobe Glyph List name
// spells it ("eacute" → é, "uni0151" → ő). A suffixed name ("eacute.sc",
// "a.alt") is an alternate and is skipped, so a rune never resolves to a
// small-cap or stylistic variant. Two plain names for one rune keep the lower
// GID, so the choice does not depend on map order.
func aglRuneGIDs(names map[string]fonts.GID) map[rune]fonts.GID {
	out := make(map[rune]fonts.GID, len(names))
	for name, gid := range names {
		if gid == 0 || strings.ContainsRune(name, '.') {
			continue
		}
		r, ok := glyphsnames.GlyphToRune(name)
		if !ok || r == 0 {
			continue
		}
		if prev, seen := out[r]; !seen || gid < prev {
			out[r] = gid
		}
	}
	return out
}
```

In `gidForRune`, between the `runeToGlyphName` block and the `f.prog.gidForRune` fallback, add:

```go
	if gid, ok := f.aglGIDs[r]; ok {
		return gid, true
	}
```

In each of the three constructors that set `names: prog.nameToGID()` (`family.go` `LoadStandard` and `LoadScriptFallback`, `sfnt.go:65`), compute the names once and set both fields:

```go
	names := prog.nameToGID()
	// ...
		names:    names,
		aglGIDs:  aglRuneGIDs(names),
```

(In `sfnt.go:65` the literal is `&Face{prog: prog, names: prog.nameToGID(), ...}`: change it to `names := prog.nameToGID()` on the line before and `names: names, aglGIDs: aglRuneGIDs(names)` in the literal.)

- [ ] **Step 4: Run the test and the full suite**

Run: `cd /Users/nas/tmp/tinycld/omnidoc && go test ./pkg/internal/font/ -run TestStandardFacesMapAccentedLatinToPlainGlyphs -count=1 && go test ./... -count=1`
Expected: the new test PASSES. If a golden test fails, the golden contained an accented letter drawn as a small cap: open each failing golden's new PNG (`pkg/omnidoc/testdata/golden/*.png`), confirm the only change is the accented letters now drawing as normal lowercase, then regenerate with `go test ./pkg/omnidoc -run '<that golden test>' -update` (see `docs/TESTING.md:40-50`) and run `go test ./... -count=1` again. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nas/tmp/tinycld/omnidoc
git add pkg/internal/font/family.go pkg/internal/font/sfnt.go pkg/internal/font/family_test.go pkg/omnidoc/testdata/golden
git commit -m "fix(font): resolve accented Latin by plain glyph name, not the small-cap alternate"
```

### Task 3: omnidoc — bundled Greek and Cyrillic fallback from the Go fonts

**Files:**
- Modify: `pkg/internal/font/standard/standard.go` (new `greekCyrillic` family; `ScriptFallback` ~line 186)
- Modify: `pkg/internal/layout/font/cache.go` (`fallbackScriptOf` ~line 220)
- Modify: `pkg/internal/font/standard/fonts/README.md`
- Test: `pkg/internal/font/standard/standard_test.go`, `pkg/omnidoc/fonts_test.go`

**Interfaces:**
- Consumes: `goregular.TTF`, `gobold.TTF`, `goitalic.TTF`, `gobolditalic.TTF` from `golang.org/x/image/font/gofont/...` (module already required, v0.45.0).
- Produces: `standard.ScriptFallback(r, bold, italic)` returns a `Go-*` substitute for U+0370–03FF and U+0400–04FF; `fallbackScriptOf` names them `"greek-cyrillic"`.

- [ ] **Step 1: Write the failing tests**

Append to `pkg/internal/font/standard/standard_test.go`:

```go
// Cyrillic is not in TeX Gyre at all and accented Greek is missing, so both
// fall back to the bundled Go fonts, in the requested style.
func TestScriptFallbackCoversGreekAndCyrillic(t *testing.T) {
	cases := []struct {
		r            rune
		bold, italic bool
		want         string
	}{
		{'Ж', false, false, "Go-Regular"},
		{'ж', true, false, "Go-Bold"},
		{'ά', false, true, "Go-Italic"},
		{'Ω', true, true, "Go-BoldItalic"},
	}
	for _, c := range cases {
		sub, ok := ScriptFallback(c.r, c.bold, c.italic)
		if !ok {
			t.Errorf("ScriptFallback(%q) found no face", c.r)
			continue
		}
		if sub.Name != c.want || sub.Kind != KindTrueType || len(sub.Data) == 0 {
			t.Errorf("ScriptFallback(%q, bold=%v, italic=%v) = %s, want %s", c.r, c.bold, c.italic, sub.Name, c.want)
		}
	}
}
```

Append to `pkg/omnidoc/fonts_test.go` (add imports `bytes`, `context`, `fmt`, `strings` if missing):

```go
// Names in Greek, Cyrillic, Hebrew and accented Latin print with the bundled
// fonts alone: no rune reaches the .notdef path.
func TestBundledFontsPrintGreekCyrillicHebrewAndAccentedLatin(t *testing.T) {
	var logs []string
	src := `<!doctype html><html style="font-family: sans-serif"><body>` +
		`<p>Zoë Ñandú Łódź</p><p>Ελληνικά ά</p><p>Москва Київ</p><p>שלום</p></body></html>`
	doc, err := OpenHTMLBytes([]byte(src), WithDefaultPaged(), WithBundledFonts(),
		WithLogf(func(f string, a ...any) { logs = append(logs, fmt.Sprintf(f, a...)) }))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	var pdf bytes.Buffer
	if err := doc.WritePDF(context.Background(), &pdf, PDFOptions{}); err != nil {
		t.Fatalf("write: %v", err)
	}
	for _, l := range logs {
		if strings.Contains(l, "no glyph for") {
			t.Errorf("missing glyph: %s", l)
		}
	}
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/omnidoc && go test ./pkg/internal/font/standard/ ./pkg/omnidoc/ -run 'TestScriptFallbackCoversGreekAndCyrillic|TestBundledFontsPrintGreekCyrillicHebrewAndAccentedLatin' -count=1`
Expected: FAIL — "ScriptFallback('Ж') found no face"; "missing glyph: layout: no glyph for U+041C ...".

- [ ] **Step 3: Add the family and the script ranges**

In `pkg/internal/font/standard/standard.go`, add imports:

```go
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/gobolditalic"
	"golang.org/x/image/font/gofont/goitalic"
	"golang.org/x/image/font/gofont/goregular"
```

Add to the `var (...)` block after `arabic`:

```go
	// greekCyrillic covers Greek and Cyrillic, which the TeX Gyre substitutes
	// cover only in part (accented Greek is missing) or not at all (Cyrillic).
	// The Go fonts carry the WGL4 set in four styles under a BSD licence and
	// already ship in golang.org/x/image, so they add no download.
	greekCyrillic = family{
		regular:    Substitute{Name: "Go-Regular", Data: goregular.TTF, Kind: KindTrueType},
		bold:       Substitute{Name: "Go-Bold", Data: gobold.TTF, Kind: KindTrueType},
		italic:     Substitute{Name: "Go-Italic", Data: goitalic.TTF, Kind: KindTrueType},
		boldItalic: Substitute{Name: "Go-BoldItalic", Data: gobolditalic.TTF, Kind: KindTrueType},
	}
```

In `ScriptFallback`, add a case before the closing `}` of the switch, and change the doc comment's "It resolves ONLY the right-to-left scripts" sentence to "It resolves Hebrew, Arabic, Greek and Cyrillic":

```go
	case r >= 0x0370 && r <= 0x03FF, // Greek and Coptic
		r >= 0x0400 && r <= 0x04FF: // Cyrillic
		return greekCyrillic.pick(bold, italic), true
```

In `pkg/internal/layout/font/cache.go` `fallbackScriptOf`, add before `}`:

```go
	case r >= 0x0370 && r <= 0x03FF, r >= 0x0400 && r <= 0x04FF:
		return "greek-cyrillic", true
```

Append to `pkg/internal/font/standard/fonts/README.md`: "Greek and Cyrillic fall back to the Go fonts (Go-Regular, Go-Bold, Go-Italic, Go-BoldItalic) embedded from `golang.org/x/image/font/gofont`, BSD-3-Clause, © Bigelow & Holmes Inc. and The Go Authors."

- [ ] **Step 4: Run the tests and the suite**

Run: `cd /Users/nas/tmp/tinycld/omnidoc && go test ./pkg/internal/font/standard/ ./pkg/omnidoc/ -run 'TestScriptFallbackCoversGreekAndCyrillic|TestBundledFontsPrintGreekCyrillicHebrewAndAccentedLatin' -count=1 && go test ./... -count=1`
Expected: PASS. A golden that contained Cyrillic or accented Greek changes from boxes to letters: review and `-update` it as in Task 2 Step 4.

- [ ] **Step 5: Commit**

```bash
cd /Users/nas/tmp/tinycld/omnidoc
git add pkg/internal/font/standard pkg/internal/layout/font/cache.go pkg/omnidoc/fonts_test.go pkg/omnidoc/testdata/golden
git commit -m "feat(font): bundled Greek and Cyrillic fallback from the Go fonts"
```

### Task 4: omnidoc — per-rune fallback through the family list, a supplied fonts directory and installed fonts

**Files:**
- Modify: `pkg/internal/layout/font/cache.go` (replace `ResolveScriptFallback` ~line 120 and `resolveEmojiFallback` ~line 167; constructors `NewFaceCache` ~line 50 and `NewFaceCacheWithFonts` ~line 64; new `SetFallbackDir`)
- Modify: `pkg/internal/layout/inline/shape.go:485` and `:580`
- Modify: `pkg/omnidoc/html_backend.go` (`openConfig` ~line 38, new `WithFallbackFontDir` after `WithBundledFonts` ~line 166, `htmlDocument` after `NewFaceCacheWithFonts` ~line 312)
- Create: `pkg/internal/layout/font/fallback_test.go`
- Test: `pkg/omnidoc/fonts_test.go`
- Modify: `FEATURES.md:671`

**Interfaces:**
- Consumes: `splitFamilyList`, `normalizeFamily`, `resolveFontFace`, `resolveProvider`, `isEmojiRune`, `emojiFallbackFamilies`, `fallbackScriptOf` (cache.go); `fontExts` (`system.go`); `pkgfont.LoadStandard`, `pkgfont.LoadScriptFallback`, `pkgfont.LoadSFNT`, `(*pkgfont.Face).GID`.
- Produces: `func (c *FaceCache) ResolveFallback(r rune, family string, style pkgfont.Style) (*pkgfont.Face, bool)`; `func (c *FaceCache) SetFallbackDir(dir string)`; `var systemFallbackFamilies []string`; public `func WithFallbackFontDir(dir string) HTMLOption`. `ResolveScriptFallback` and `resolveEmojiFallback` are deleted (only `shape.go` called the former; no test does). Books Task 10 relies on `omnidoc.WithFallbackFontDir`.
- Fallback order: (1) the run's family list, (2) bundled script face, (3) the supplied directory's fonts in file-name order (works in bundled mode too: the caller chose these files), (4) installed fallback families (system mode only).

- [ ] **Step 1: Write the failing tests**

Create `pkg/internal/layout/font/fallback_test.go`:

```go
package font

import (
	"bytes"
	"testing"

	"golang.org/x/image/font/gofont/gobold"

	pkgfont "github.com/nathanstitt/omnidoc/pkg/internal/font"
	"github.com/nathanstitt/omnidoc/pkg/internal/font/standard"
)

// fakeFonts is an installed-font provider serving fixed programs by family name
// and counting lookups.
type fakeFonts struct {
	byFamily map[string][]byte
	calls    int
}

func (f *fakeFonts) LoadLocal(string) ([]byte, bool) { return nil, false }

func (f *fakeFonts) LoadStyled(family string, _, _ bool) ([]byte, bool) {
	f.calls++
	b, ok := f.byFamily[family]
	return b, ok
}

func programOf(t *testing.T, face *pkgfont.Face) []byte {
	t.Helper()
	data, _ := face.ProgramBytes()
	return data
}

// firstRuneMissingFromSans returns the first candidate the bundled sans lacks
// and Go Bold has, so the test does not depend on one font's exact coverage.
func firstRuneMissingFromSans(t *testing.T, candidates ...rune) rune {
	t.Helper()
	sans, ok := pkgfont.LoadStandard("sans-serif", pkgfont.Style{})
	if !ok {
		t.Fatal("no bundled sans")
	}
	bold, err := pkgfont.LoadSFNT(gobold.TTF)
	if err != nil {
		t.Fatalf("load Go Bold: %v", err)
	}
	for _, r := range candidates {
		if gid, ok := sans.GID(r); ok && gid != 0 {
			continue
		}
		if gid, ok := bold.GID(r); ok && gid != 0 {
			return r
		}
	}
	t.Fatalf("every candidate %q is in the bundled sans or missing from Go Bold", candidates)
	return 0
}

// CSS Fonts 4 §5.3: a character the first family lacks is looked up in the
// next family of the list before any system fallback.
func TestResolveFallback_TriesLaterFamiliesInTheList(t *testing.T) {
	fonts := &fakeFonts{byFamily: map[string][]byte{"Test Family": gobold.TTF}}
	c := NewFaceCacheWithFonts(nil, nil, fonts, nil)
	face, ok := c.ResolveFallback('Ж', "sans-serif, Test Family", pkgfont.Style{})
	if !ok {
		t.Fatal("no fallback for Ж")
	}
	if !bytes.Equal(programOf(t, face), gobold.TTF) {
		t.Error("Ж did not come from the list's second family")
	}
}

// A rune no bundled face covers comes from an installed fallback family.
func TestResolveFallback_UsesInstalledFallbackFamiliesLast(t *testing.T) {
	r := firstRuneMissingFromSans(t, 0x2500, 0x2591, 0x25B2)
	fonts := &fakeFonts{byFamily: map[string][]byte{"DejaVu Sans": gobold.TTF}}
	c := NewFaceCacheWithFonts(nil, nil, fonts, nil)
	face, ok := c.ResolveFallback(r, "sans-serif", pkgfont.Style{})
	if !ok {
		t.Fatalf("no fallback for %q", r)
	}
	if !bytes.Equal(programOf(t, face), gobold.TTF) {
		t.Errorf("%q did not come from the installed DejaVu Sans", r)
	}
}

// The first installed emoji font is used only if it has the glyph; otherwise
// the search goes on (the ✓-as-tofu bug: Apple Color Emoji has no U+2713).
func TestResolveFallback_SkipsAnInstalledEmojiFontWithoutTheGlyph(t *testing.T) {
	r := firstRuneMissingFromSans(t, 0x2660, 0x263A, 0x266A)
	hebrew, ok := standard.ScriptFallback('א', false, false)
	if !ok {
		t.Fatal("no bundled Hebrew")
	}
	fonts := &fakeFonts{byFamily: map[string][]byte{
		"Apple Color Emoji": hebrew.Data,
		"Symbola":           gobold.TTF,
	}}
	c := NewFaceCacheWithFonts(nil, nil, fonts, nil)
	face, ok := c.ResolveFallback(r, "sans-serif", pkgfont.Style{})
	if !ok {
		t.Fatalf("no fallback for %q", r)
	}
	if !bytes.Equal(programOf(t, face), gobold.TTF) {
		t.Errorf("%q came from a font without the glyph", r)
	}
}

// Bundled-only mode has no installed fonts: an uncovered rune is a clean miss.
func TestResolveFallback_BundledOnlyMissesCleanly(t *testing.T) {
	r := firstRuneMissingFromSans(t, 0x2500, 0x2591, 0x25B2)
	if face, ok := NewFaceCache().ResolveFallback(r, "sans-serif", pkgfont.Style{}); ok {
		t.Errorf("got face %v for %q with no installed fonts", face, r)
	}
}

// The answer is cached per rune, list and style: a document with the same
// missing rune a thousand times asks the provider once.
func TestResolveFallback_CachesTheAnswer(t *testing.T) {
	r := firstRuneMissingFromSans(t, 0x2500, 0x2591, 0x25B2)
	fonts := &fakeFonts{byFamily: map[string][]byte{"DejaVu Sans": gobold.TTF}}
	c := NewFaceCacheWithFonts(nil, nil, fonts, nil)
	c.ResolveFallback(r, "sans-serif", pkgfont.Style{})
	before := fonts.calls
	c.ResolveFallback(r, "sans-serif", pkgfont.Style{})
	if fonts.calls != before {
		t.Errorf("second lookup asked the provider %d more times", fonts.calls-before)
	}
}

// fontDir writes files into a temp dir and returns it.
func fontDir(t *testing.T, files map[string][]byte) string {
	t.Helper()
	dir := t.TempDir()
	for name, data := range files {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	return dir
}

// A caller-supplied directory covers what the bundle lacks, by glyph, whatever
// the files are called, and even with no system provider (bundled mode).
func TestResolveFallback_UsesTheSuppliedFontDirectory(t *testing.T) {
	r := firstRuneMissingFromSans(t, 0x2500, 0x2591, 0x25B2)
	c := NewFaceCache()
	c.SetFallbackDir(fontDir(t, map[string][]byte{"SomeVendorFont-Regular.ttf": gobold.TTF}))
	face, ok := c.ResolveFallback(r, "sans-serif", pkgfont.Style{})
	if !ok {
		t.Fatalf("no fallback for %q from the directory", r)
	}
	if !bytes.Equal(programOf(t, face), gobold.TTF) {
		t.Errorf("%q did not come from the directory's font", r)
	}
}

// Files that are not fonts, or that do not parse, are logged and skipped; the
// directory's good fonts still serve.
func TestResolveFallback_FontDirectorySkipsWhatIsNotAFont(t *testing.T) {
	r := firstRuneMissingFromSans(t, 0x2500, 0x2591, 0x25B2)
	var logs []string
	c := NewFaceCacheWithFonts(nil, nil, nil, func(f string, a ...any) { logs = append(logs, fmt.Sprintf(f, a...)) })
	c.SetFallbackDir(fontDir(t, map[string][]byte{
		"a-broken.ttf": []byte("not a font"),
		"notes.txt":    []byte("hello"),
		"z-good.ttf":   gobold.TTF,
	}))
	if _, ok := c.ResolveFallback(r, "sans-serif", pkgfont.Style{}); !ok {
		t.Fatalf("no fallback for %q", r)
	}
	if !slices.ContainsFunc(logs, func(l string) bool { return strings.Contains(l, "a-broken.ttf") }) {
		t.Errorf("the broken font was not logged: %q", logs)
	}
}

// A directory that does not exist is a logged miss, not a failure.
func TestResolveFallback_MissingFontDirectoryIsAMiss(t *testing.T) {
	r := firstRuneMissingFromSans(t, 0x2500, 0x2591, 0x25B2)
	c := NewFaceCache()
	c.SetFallbackDir(filepath.Join(t.TempDir(), "absent"))
	if _, ok := c.ResolveFallback(r, "sans-serif", pkgfont.Style{}); ok {
		t.Errorf("found %q with no fonts at all", r)
	}
}
```

Add `fmt`, `os`, `path/filepath`, `slices`, `strings` to that file's imports.

Append to `pkg/omnidoc/fonts_test.go` (imports `os`, `path/filepath`, `golang.org/x/image/font/gofont/gobold` added as needed):

```go
// Through the public API, in hermetic bundled mode: box-drawing characters the
// bundle lacks draw as .notdef without a fonts directory, and from the
// directory's font with one.
func TestWithFallbackFontDirCoversWhatTheBundleLacks(t *testing.T) {
	src := []byte(`<!doctype html><html style="font-family: sans-serif"><body><p>Box ─░▲</p></body></html>`)
	missing := func(opts ...HTMLOption) int {
		var n int
		opts = append(opts, WithDefaultPaged(), WithBundledFonts(), WithLogf(func(f string, a ...any) {
			if strings.Contains(fmt.Sprintf(f, a...), "no glyph for") {
				n++
			}
		}))
		doc, err := OpenHTMLBytes(src, opts...)
		if err != nil {
			t.Fatalf("open: %v", err)
		}
		var pdf bytes.Buffer
		if err := doc.WritePDF(context.Background(), &pdf, PDFOptions{}); err != nil {
			t.Fatalf("write: %v", err)
		}
		return n
	}
	if missing() == 0 {
		t.Fatal("precondition: the bundle already covers ─░▲, pick other characters")
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Extra.ttf"), gobold.TTF, 0o644); err != nil {
		t.Fatalf("write font: %v", err)
	}
	if n := missing(WithFallbackFontDir(dir)); n != 0 {
		t.Errorf("%d characters still missing with the fonts directory", n)
	}
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/omnidoc && go test ./pkg/internal/layout/font/ ./pkg/omnidoc/ -run 'TestResolveFallback|TestWithFallbackFontDir' -count=1`
Expected: FAIL to compile — `c.ResolveFallback undefined`, `c.SetFallbackDir undefined`, `undefined: WithFallbackFontDir`.

- [ ] **Step 3: Implement `ResolveFallback`**

In `pkg/internal/layout/font/cache.go`:

1. Add fields to `FaceCache` after `faces`:

```go
	fallbacks map[fallbackKey]cacheEntry
	// fallbackDir is a caller-supplied directory whose fonts join per-character
	// fallback; its faces load once, on the first rune that needs them.
	fallbackDir string
	dirFaces    []*pkgfont.Face
	dirLoaded   bool
```

and initialize `fallbacks: map[fallbackKey]cacheEntry{}` in both `NewFaceCache` and `NewFaceCacheWithFonts`, next to where `faces` is initialized.
2. Delete `ResolveScriptFallback` and `resolveEmojiFallback`. Keep `emojiFallbackFamilies`, `isEmojiRune`, `fallbackScriptOf`.
3. Add (imports `os`, `path/filepath`, `slices`; `strings` is already imported):

```go
// fallbackKey caches one rune's fallback for a run's font-family list and style.
type fallbackKey struct {
	r      rune
	family string
	style  pkgfont.Style
}

// systemFallbackFamilies are installed families tried, in order, for a rune no
// family in the list and no bundled face covers. The list names the common
// Linux packages (Noto, DejaVu) and the macOS and Windows fonts for CJK, Indic,
// Thai and symbols; each is used only if it has the glyph.
var systemFallbackFamilies = []string{
	"Noto Sans", "Noto Sans CJK SC", "Noto Sans CJK JP", "Noto Sans CJK KR", "Noto Sans CJK TC",
	"Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans Tamil", "Noto Sans Thai",
	"Noto Sans Symbols", "Noto Sans Symbols 2", "DejaVu Sans",
	"PingFang SC", "Hiragino Sans", "Apple SD Gothic Neo", "Kohinoor Devanagari", "Thonburi", "Apple Symbols",
	"Microsoft YaHei", "Yu Gothic", "Malgun Gothic", "Nirmala UI", "Leelawadee UI", "Segoe UI Symbol",
	"Arial Unicode MS",
}

// SetFallbackDir names a directory whose font files (.ttf, .otf, .woff, .woff2)
// join per-character fallback after the bundled script faces. "" turns it off.
// Call it before layout.
func (c *FaceCache) SetFallbackDir(dir string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.fallbackDir, c.dirFaces, c.dirLoaded = dir, nil, false
}

// dirFallbackFaces loads the fallback directory's fonts once, in file-name
// order, logging and skipping a file that cannot be read or parsed. Lazy, so a
// document that never misses a glyph never parses a (possibly huge) CJK font.
// Caller holds c.mu.
func (c *FaceCache) dirFallbackFaces() []*pkgfont.Face {
	if c.dirLoaded || c.fallbackDir == "" {
		return c.dirFaces
	}
	c.dirLoaded = true
	entries, err := os.ReadDir(c.fallbackDir)
	if err != nil {
		c.logf("font: fallback directory %q: %v", c.fallbackDir, err)
		return nil
	}
	for _, e := range entries {
		if e.IsDir() || !slices.Contains(fontExts, strings.ToLower(filepath.Ext(e.Name()))) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(c.fallbackDir, e.Name()))
		if err != nil {
			c.logf("font: fallback directory %q: %s: %v", c.fallbackDir, e.Name(), err)
			continue
		}
		face, err := pkgfont.LoadSFNT(data)
		if err != nil {
			c.logf("font: fallback directory %q: %s: %v", c.fallbackDir, e.Name(), err)
			continue
		}
		c.dirFaces = append(c.dirFaces, face)
	}
	return c.dirFaces
}

// ResolveFallback returns a face with a glyph for r, for a rune the run's own
// face cannot map. The order follows CSS Fonts 4 §5.3 (per-character fallback):
//  1. each family of the run's font-family list (@font-face, installed, bundled);
//  2. the bundled script face (Hebrew, Arabic, Greek, Cyrillic);
//  3. the fonts in the caller-supplied fallback directory (SetFallbackDir);
//  4. installed fallback families, emoji fonts first for an emoji rune. With no
//     system provider (bundled mode) this step finds nothing.
//
// Every candidate is checked for the glyph, so an installed emoji font without
// U+2713 no longer wins by being first. Answers, misses included, are cached
// per (rune, list, style).
func (c *FaceCache) ResolveFallback(r rune, family string, style pkgfont.Style) (*pkgfont.Face, bool) {
	key := fallbackKey{r: r, family: normalizeFamily(family), style: style}
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, found := c.fallbacks[key]; found {
		return e.face, e.ok
	}
	face, ok := c.findFallback(r, family, style)
	c.fallbacks[key] = cacheEntry{face: face, ok: ok}
	return face, ok
}

// findFallback walks the fallback order for r. Caller holds c.mu.
func (c *FaceCache) findFallback(r rune, family string, style pkgfont.Style) (*pkgfont.Face, bool) {
	for _, name := range splitFamilyList(family) {
		if face, ok := c.singleFamily(name, style); ok && hasGlyph(face, r) {
			return face, true
		}
	}
	if face, ok := c.bundledScriptFace(r, style); ok && hasGlyph(face, r) {
		return face, true
	}
	for _, face := range c.dirFallbackFaces() {
		if hasGlyph(face, r) {
			return face, true
		}
	}
	candidates := systemFallbackFamilies
	if isEmojiRune(r) {
		candidates = append(slices.Clone(emojiFallbackFamilies), systemFallbackFamilies...)
	}
	for _, name := range candidates {
		if face, ok := c.installedFamily(name, style); ok && hasGlyph(face, r) {
			return face, true
		}
	}
	return nil, false
}

func hasGlyph(face *pkgfont.Face, r rune) bool {
	gid, ok := face.GID(r)
	return ok && gid != 0
}

// singleFamily resolves one family name with no terminal serif substitution
// (resolveList's last resort would claim every rune the serif has). Cached.
// Caller holds c.mu.
func (c *FaceCache) singleFamily(name string, style pkgfont.Style) (*pkgfont.Face, bool) {
	key := faceKey{family: "\x00single:" + normalizeFamily(name), style: style}
	if e, found := c.faces[key]; found {
		return e.face, e.ok
	}
	face, ok := c.resolveFontFace(name, style)
	if !ok {
		face, ok = c.resolveProvider(name, style)
	}
	if !ok {
		face, ok = pkgfont.LoadStandard(name, style)
	}
	c.faces[key] = cacheEntry{face: face, ok: ok}
	return face, ok
}

// installedFamily resolves a family only through the system provider. Cached,
// because a CJK program is megabytes and decoding it per rune would dominate.
// Caller holds c.mu.
func (c *FaceCache) installedFamily(name string, style pkgfont.Style) (*pkgfont.Face, bool) {
	key := faceKey{family: "\x00installed:" + normalizeFamily(name), style: style}
	if e, found := c.faces[key]; found {
		return e.face, e.ok
	}
	face, ok := c.resolveProvider(name, style)
	c.faces[key] = cacheEntry{face: face, ok: ok}
	return face, ok
}

// bundledScriptFace is the bundled face for r's script. Cached under the
// script, so the program is parsed once per (script, style). Caller holds c.mu.
func (c *FaceCache) bundledScriptFace(r rune, style pkgfont.Style) (*pkgfont.Face, bool) {
	script, ok := fallbackScriptOf(r)
	if !ok {
		return nil, false
	}
	key := faceKey{family: "\x00fallback:" + script, style: style}
	if e, found := c.faces[key]; found {
		return e.face, e.ok
	}
	face, ok := pkgfont.LoadScriptFallback(r, style)
	c.faces[key] = cacheEntry{face: face, ok: ok}
	return face, ok
}
```

4. In `pkg/internal/layout/inline/shape.go`, the run being shaped is `r` (see `faces.Resolve(r.Family, style)` at ~line 388). Replace both calls:
   - ~line 485: `faces.ResolveScriptFallback(rn, style)` → `faces.ResolveFallback(rn, r.Family, style)`
   - ~line 580: `faces.ResolveScriptFallback(rn, style)` → `faces.ResolveFallback(rn, r.Family, style)`
   Update the comment above the ~580 call to say the fallback tries the rest of the family list, then a bundled script face, then the supplied fonts directory, then installed fallback fonts.

5. In `pkg/omnidoc/html_backend.go`, add `fallbackFontDir string` to `openConfig` (after `bundledFonts`), the option after `WithBundledFonts`:

```go
// WithFallbackFontDir adds every font file in dir (.ttf, .otf, .woff, .woff2)
// to per-character fallback: a character no family in the font-family list and
// no bundled face can draw is looked up in these fonts, in file-name order,
// before any installed font. Unlike WithSystemFontProvider it leaves installed
// fonts on, matches by glyph rather than by family name, and also applies in
// bundled mode (the caller chose these files). "" is ignored.
func WithFallbackFontDir(dir string) HTMLOption {
	return func(c *openConfig) { c.fallbackFontDir = dir }
}
```

and in `htmlDocument`, right after `faces := layoutfont.NewFaceCacheWithFonts(...)`:

```go
	if cfg.fallbackFontDir != "" {
		faces.SetFallbackDir(cfg.fallbackFontDir)
	}
```

- [ ] **Step 4: Run the tests and the suite**

Run: `cd /Users/nas/tmp/tinycld/omnidoc && go test ./pkg/internal/layout/font/ ./pkg/omnidoc/ -run 'TestResolveFallback|TestWithFallbackFontDir' -count=1 && go vet ./... && go test -race ./... -count=1`
Expected: PASS. If an emoji test in `pkg/omnidoc` (e.g. `colorfont_test.go`) changes result, the emoji path now also requires the glyph: read the test; it must still pass for a real emoji (the colour font has the glyph). A failure there is a bug in `findFallback`, not a test to change.

- [ ] **Step 5: Update FEATURES.md**

Replace the "per-rune script fallback" entry (`FEATURES.md:671`) with: "Per-character font fallback (CSS Fonts 4 §5.3): a character the run's face lacks is looked up in each later family of the `font-family` list, then the bundled script faces (Hebrew, Arabic, Greek, Cyrillic), then the fonts of a caller-supplied directory (`WithFallbackFontDir`), then installed fallback families (Noto, DejaVu and the platform CJK, Indic, Thai and symbol fonts; emoji fonts first for emoji). Each candidate must have the glyph. Bundled mode (`WithBundledFonts`) skips installed fonts but keeps the supplied directory."

- [ ] **Step 6: Commit**

```bash
cd /Users/nas/tmp/tinycld/omnidoc
git add pkg/internal/layout/font pkg/internal/layout/inline/shape.go pkg/omnidoc/html_backend.go pkg/omnidoc/fonts_test.go FEATURES.md
git commit -m "feat(font): per-character fallback through the family list, a fonts directory and installed fonts"
```

### Task 5: omnidoc — margin boxes inherit the root font; PR and tag v1.2.0

**Files:**
- Modify: `pkg/internal/layout/css/block.go` (`Engine` struct, line 21), `pkg/internal/layout/css/marginbox.go` (two `marginBoxBaseStyle()` call sites ~lines 339 and 343; new helpers), `pkg/internal/layout/css/paginate.go` (`LayoutPaged`, line 29), `pkg/internal/layout/css/pagemodel.go` (`LayoutPagedDoc`, line 139)
- Test: `pkg/omnidoc/pagedmedia_test.go`
- Modify: `FEATURES.md`, `docs/BACKLOG.md`

**Interfaces:**
- Consumes: `root *cssbox.Box` (its `Style gcss.ComputedStyle` has `FontFamily`, `FontSizePt`, `Bold`, `Italic`, `Color`).
- Produces: `func marginBaseFrom(root gcss.ComputedStyle) gcss.ComputedStyle`; `Engine.marginBase`; margin-box text uses the root element's font and color unless its own declarations set them. Tag `v1.2.0` on `nathanstitt/omnidoc`.

- [ ] **Step 1: Write the failing test**

Append to `pkg/omnidoc/pagedmedia_test.go` (add imports `bytes`, `context` if missing):

```go
// CSS Paged Media: the page context inherits from the root element, so a
// footer takes the document's font. With html { font-family: sans-serif } the
// PDF must embed only the sans face; a serif footer would add TeX Gyre Termes.
func TestMarginBoxInheritsTheRootFont(t *testing.T) {
	src := `<!doctype html><html style="font-family: sans-serif"><head><style>
		@page { size: Letter; margin: 0.5in; @bottom-right { content: "Page " counter(page) " of " counter(pages) } }
	</style></head><body><p>Body text</p></body></html>`
	doc, err := OpenHTMLBytes([]byte(src), WithDefaultPaged(), WithBundledFonts())
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	var pdf bytes.Buffer
	if err := doc.WritePDF(context.Background(), &pdf, PDFOptions{}); err != nil {
		t.Fatalf("write: %v", err)
	}
	if !bytes.Contains(pdf.Bytes(), []byte("TeXGyreHeros")) {
		t.Fatal("the sans face is not embedded")
	}
	if bytes.Contains(pdf.Bytes(), []byte("TeXGyreTermes")) {
		t.Error("the footer used the serif face, not the root's sans-serif")
	}
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/nas/tmp/tinycld/omnidoc && go test ./pkg/omnidoc/ -run TestMarginBoxInheritsTheRootFont -count=1`
Expected: FAIL — "the footer used the serif face".

- [ ] **Step 3: Implement the inherited base**

In `pkg/internal/layout/css/block.go`, add to `Engine` (after `logf`):

```go
	// marginBase is the style @page margin boxes inherit (the root element's
	// font and color), set at the start of a paged layout. Zero means "not set".
	marginBase gcss.ComputedStyle
```

In `pkg/internal/layout/css/marginbox.go`, below `marginBoxBaseStyle`, add:

```go
// marginBaseFrom is the style a margin box inherits. CSS Paged Media puts the
// page context under the root element, so a footer takes the document's font,
// size and color unless its own declarations set them. A root with no font
// keeps the UA default (serif, 11pt, black). @page-level declarations are not
// applied: UsedPage does not carry them.
func marginBaseFrom(root gcss.ComputedStyle) gcss.ComputedStyle {
	base := marginBoxBaseStyle()
	if root.FontFamily != "" {
		base.FontFamily = root.FontFamily
	}
	if root.FontSizePt > 0 {
		base.FontSizePt = root.FontSizePt
	}
	base.Bold, base.Italic = root.Bold, root.Italic
	if root.Color.A != 0 {
		base.Color = root.Color
	}
	return base
}

// marginStyle is the base a margin box's declarations cascade over.
func (e *Engine) marginStyle() gcss.ComputedStyle {
	if e.marginBase.FontFamily == "" {
		return marginBoxBaseStyle()
	}
	return e.marginBase
}
```

Replace both `gcss.Stylesheet{}.ComputeMarginBox(..., marginBoxBaseStyle())` calls in `marginbox.go` (in `appendMarginBoxes` ~line 339 and `appendMarginText` ~line 343) with `gcss.Stylesheet{}.ComputeMarginBox(..., e.marginStyle())`. Update the `appendMarginText` doc comment: the base is the root element's font, not "serif, 11pt, black".

At the top of `func (e *Engine) LayoutPaged(ctx context.Context, root *cssbox.Box, viewportW, pageH float64)` (`paginate.go:29`) and of `func (e *Engine) LayoutPagedDoc(ctx context.Context, root *cssbox.Box, cfg PagedConfig)` (`pagemodel.go:139`), add:

```go
	if root != nil {
		e.marginBase = marginBaseFrom(root.Style)
	}
```

(If `ComputedStyle.Color` is not a `color.RGBA`, use the alpha check its type offers; the field is built as `color.RGBA{0, 0, 0, 255}` in `marginBoxBaseStyle`. If the test still fails because `root` is not the `<html>` box, take the style from the first child box whose element is `html`; check with a `t.Logf` of `root.Style.FontFamily` first.)

- [ ] **Step 4: Run the test and the suite**

Run: `cd /Users/nas/tmp/tinycld/omnidoc && go test ./pkg/omnidoc/ -run TestMarginBoxInheritsTheRootFont -count=1 && go test ./... -count=1`
Expected: PASS. A paged-media golden whose root sets a font and whose footer has no font of its own changes its footer face: review the PNG (only the footer text face changes) and `-update` it as in Task 2 Step 4.

- [ ] **Step 5: FEATURES.md and BACKLOG.md**

In `FEATURES.md`, in the @page margin-box entry, add: "Margin boxes inherit font family, size, weight, style and color from the root element; their own declarations override. `@page`-level font declarations are not applied." Append to `docs/BACKLOG.md`:

```markdown
- Repeat `<tfoot>` (table-footer-group) at the bottom of every page a table spans: needs a `FooterTop` like `HeaderBottom` and a reservation in `splitTableForPage`.
- Apply `@page`-level declarations (font, color) to margin boxes: `UsedPage` does not carry them yet.
- Arabic text in the bundled Noto Naskh face shows unjoined letter forms in a probe (2026-11-06); a system Arabic font joins correctly.
- `@page { size: A6 }` is ignored: `css/pagesize.go` has no `a6` entry.
- `WithFallbackFontDir` parses the directory's fonts once per document (lazily, on the first missing glyph). A server rendering many documents with CJK text would gain from a process-wide cache of parsed faces keyed by path and modification time.
```

(The follow-up "provide CJK/Indic font files for the directory" is the tinycld side's job, not omnidoc's, so it is not in omnidoc's BACKLOG; see this plan's "Follow-ups".)

- [ ] **Step 6: Full local CI, commit, push, PR**

```bash
cd /Users/nas/tmp/tinycld/omnidoc
test -z "$(gofmt -l .)" && go vet ./... && go build ./... && go test -race -p 2 ./... -count=1
git add pkg/internal/layout/css pkg/omnidoc/pagedmedia_test.go pkg/omnidoc/testdata/golden FEATURES.md docs/BACKLOG.md
git commit -m "fix(layout): margin boxes inherit the root element's font and color"
git push -u origin tinycld-pdf-gaps
gh pr create --repo nathanstitt/omnidoc --base main --head tinycld-pdf-gaps \
  --title "Repeat thead mid-page, accented Latin glyphs, per-character font fallback, inherited margin-box font" \
  --body "Fixes found while rendering invoices: thead not repeated when a table does not start the page (HeaderBottom not shifted); accented Latin drawn with TeX Gyre small-cap glyphs; per-character fallback through the family list, bundled Greek/Cyrillic (Go fonts), a caller-supplied fonts directory (new WithFallbackFontDir) and installed fonts, each with a glyph check (fixes ✓ as tofu with Apple Color Emoji); margin boxes inherit the root font. FEATURES.md and BACKLOG.md updated."
```
Expected: local checks pass; PR URL printed. omnidoc CI (Ubuntu race, macOS, Windows) must go green; a red job is diagnosed and fixed on this branch.

- [ ] **Step 7: Merge and tag**

The driver asks the human to merge the PR (it is the human's repo). After the merge:

```bash
cd /Users/nas/tmp/tinycld/omnidoc
git checkout main && git pull --ff-only
git tag -a v1.2.0 -m "v1.2.0: thead repeat fix, accented Latin glyphs, per-character font fallback with WithFallbackFontDir, inherited margin-box font"
git push origin v1.2.0
GOPROXY=https://proxy.golang.org GOFLAGS=-mod=mod go list -m github.com/nathanstitt/omnidoc@v1.2.0
```
Expected: the last command prints `github.com/nathanstitt/omnidoc v1.2.0`.

---

## Phase B — Core checkpoint 0 (repo `tinycld`, branch `books/p2-pdf`, exclusive claim)

### Task 6: core — `brand_color` field, `branding.Load`, `docfonts.Dir`, omnidoc v1.2.0

**Files:**
- Create: `core/server/pb_migrations/2090000012_org_branding_brand_color.js`
- Create: `core/server/branding/branding.go`, `core/server/branding/branding_test.go`
- Create: `core/server/docfonts/docfonts.go`, `core/server/docfonts/docfonts_test.go`
- Modify: `core/server/go.mod`, `core/server/go.sum`

**Interfaces:**
- Consumes: `mailer.BrandColor` (`core/server/mailer/template.go:12`); `rlstest.NewMigratedApp(t, rlstest.MigrationsDir(t, "../pb_migrations"))`; `logging.ForPackage`.
- Produces (Go, package `tinycld.org/core/branding`):
  - `const DefaultColor = mailer.BrandColor`
  - `type Org struct { Name string; Logo []byte; LogoType string; Color string }`
  - `func Load(app core.App) Org` — never fails; `Color` is lowercase `#rrggbb`; `LogoType` is `image/png`, `image/jpeg` or `image/webp`, `""` with `Logo == nil`.
- Produces (schema): `org_branding.brand_color` text, max 7, pattern `^#[0-9a-fA-F]{6}$`, optional; generated TS type gains `brand_color: string`.
- Produces (Go, package `tinycld.org/core/docfonts`): `const EnvVar = "TINYCLD_FONTS_DIR"`; `func Dir() string` — the directory of extra font files server renderers pass to omnidoc's `WithFallbackFontDir`, `""` when unset or not a directory (logged once per call when set but unusable).

- [ ] **Step 1: Branch core**

```bash
cd /Users/nas/tmp/tinycld/books/tinycld
git checkout main && git pull --ff-only && git checkout -b books/p2-pdf
```

- [ ] **Step 2: Write the failing Go tests**

Create `core/server/branding/branding_test.go`:

```go
package branding

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"tinycld.org/core/rlstest"
)

// A 1x1 lossless WebP.
const webpBase64 = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="

func newApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app := rlstest.NewMigratedApp(t, rlstest.MigrationsDir(t, "../pb_migrations"))
	app.Settings().Meta.AppName = "Acme Incorporated"
	return app
}

func pngBytes(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(1, 1, color.RGBA{200, 0, 0, 255})
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return b.Bytes()
}

func saveBranding(t *testing.T, app core.App, fields map[string]any, logo []byte, logoName string) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("org_branding")
	if err != nil {
		t.Fatalf("find org_branding: %v", err)
	}
	r := core.NewRecord(col)
	for k, v := range fields {
		r.Set(k, v)
	}
	if logo != nil {
		f, err := filesystem.NewFileFromBytes(logo, logoName)
		if err != nil {
			t.Fatalf("file: %v", err)
		}
		r.Set("logo", f)
	}
	if err := app.Save(r); err != nil {
		t.Fatalf("save branding: %v", err)
	}
	return r
}

func TestLoad_NoBrandingRowGivesTheNameAndTheDefaultColor(t *testing.T) {
	org := Load(newApp(t))
	if org.Name != "Acme Incorporated" || org.Color != DefaultColor || org.Logo != nil || org.LogoType != "" {
		t.Fatalf("Load = %+v", org)
	}
	if DefaultColor != "#0d9488" {
		t.Errorf("DefaultColor = %q, want the email accent #0d9488", DefaultColor)
	}
}

func TestLoad_ReadsTheColorAndAPngLogo(t *testing.T) {
	app := newApp(t)
	logo := pngBytes(t)
	saveBranding(t, app, map[string]any{"brand_color": "#1E40AF"}, logo, "logo.png")
	org := Load(app)
	if org.Color != "#1e40af" {
		t.Errorf("Color = %q, want #1e40af", org.Color)
	}
	if org.LogoType != "image/png" || !bytes.Equal(org.Logo, logo) {
		t.Errorf("logo = %s, %d bytes", org.LogoType, len(org.Logo))
	}
}

func TestLoad_ReadsAWebpLogo(t *testing.T) {
	app := newApp(t)
	logo, _ := base64.StdEncoding.DecodeString(webpBase64)
	saveBranding(t, app, map[string]any{}, logo, "logo.webp")
	if org := Load(app); org.LogoType != "image/webp" || len(org.Logo) == 0 || org.Color != DefaultColor {
		t.Errorf("Load = %s, %d bytes, %s", org.LogoType, len(org.Logo), org.Color)
	}
}

// The row names a logo but its file is gone from storage: print without it.
func TestLoad_UnreadableLogoFileDegrades(t *testing.T) {
	app := newApp(t)
	r := saveBranding(t, app, map[string]any{"brand_color": "#1e40af"}, pngBytes(t), "logo.png")
	fsys, err := app.NewFilesystem()
	if err != nil {
		t.Fatalf("filesystem: %v", err)
	}
	if err := fsys.Delete(r.BaseFilesPath() + "/" + r.GetString("logo")); err != nil {
		t.Fatalf("delete logo file: %v", err)
	}
	fsys.Close()
	org := Load(app)
	if org.Logo != nil || org.LogoType != "" || org.Color != "#1e40af" {
		t.Errorf("Load = %s, %d bytes, %s", org.LogoType, len(org.Logo), org.Color)
	}
}

// A color that bypassed validation (a raw SQL write) never reaches a renderer.
func TestLoad_IgnoresAStoredColorThatIsNotHex(t *testing.T) {
	app := newApp(t)
	col, _ := app.FindCollectionByNameOrId("org_branding")
	r := core.NewRecord(col)
	r.Set("brand_color", "red;}")
	if err := app.SaveNoValidate(r); err != nil {
		t.Fatalf("save: %v", err)
	}
	if org := Load(app); org.Color != DefaultColor {
		t.Errorf("Color = %q, want the default", org.Color)
	}
}

func TestBrandColorField_AcceptsHexOrEmptyOnly(t *testing.T) {
	app := newApp(t)
	col, _ := app.FindCollectionByNameOrId("org_branding")
	for value, ok := range map[string]bool{
		"": true, "#0d9488": true, "#ABCDEF": true,
		"red": false, "#12345": false, "#1234567": false, "0d9488": false, "#12345g": false,
	} {
		r := core.NewRecord(col)
		r.Set("brand_color", value)
		err := app.Save(r)
		if ok && err != nil {
			t.Errorf("brand_color %q refused: %v", value, err)
		}
		if !ok && err == nil {
			t.Errorf("brand_color %q accepted", value)
		}
	}
}
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld/core/server && go test ./branding/ -count=1`
Expected: FAIL to compile — `undefined: Load`, `undefined: DefaultColor`.

- [ ] **Step 4: Write the migration**

Create `core/server/pb_migrations/2090000012_org_branding_brand_color.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
// org_branding.brand_color: the color documents the apps print use for their
// heading, rules and table header. Optional: empty means the default (the
// email accent, mailer.BrandColor). Public read like the logo, for the same
// reason (the row's rules are unchanged). A new migration because
// 2020000001_create_org_branding.js is released.
migrate(
    app => {
        const col = app.findCollectionByNameOrId('org_branding')
        col.fields.add(
            new TextField({
                id: 'ob_brand_color',
                name: 'brand_color',
                max: 7,
                pattern: '^#[0-9a-fA-F]{6}$',
            })
        )
        app.save(col)
    },
    app => {
        const col = app.findCollectionByNameOrId('org_branding')
        col.fields.removeById('ob_brand_color')
        app.save(col)
    }
)
```

- [ ] **Step 5: Write the package**

Create `core/server/branding/branding.go`:

```go
// Package branding gives server renderers (printed documents, PDF files) the
// organization's identity: its name, logo and brand color. It reads the one
// org_branding row the Organization branding settings write.
package branding

import (
	"database/sql"
	"errors"
	"io"
	"regexp"
	"strings"

	"github.com/gabriel-vasile/mimetype"
	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/logging"
	"tinycld.org/core/mailer"
)

// DefaultColor is the brand color when none is set: the accent of the
// transactional emails, so a deployment's documents and emails agree.
const DefaultColor = mailer.BrandColor

// maxLogoBytes is the org_branding logo field's maxSize (2 MB).
const maxLogoBytes = 2 << 20

var (
	log      = logging.ForPackage("branding")
	hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	// logoTypes are the logo field's allowed types, the images a renderer can embed.
	logoTypes = []string{"image/png", "image/jpeg", "image/webp"}
)

// Org is the organization's identity as a renderer prints it.
type Org struct {
	// Name is the organization name (Settings().Meta.AppName).
	Name string
	// Logo is the uploaded logo, nil when none is set or it cannot be read.
	Logo []byte
	// LogoType is Logo's MIME type (image/png, image/jpeg or image/webp); "" when Logo is nil.
	LogoType string
	// Color is the brand color as lowercase #rrggbb, DefaultColor when none is set.
	Color string
}

// Load reads the organization's branding. It never fails: with no branding
// row, no logo, or a logo file that cannot be read, a document prints with the
// name and the default color, as /api/org-info answers "no logo" in the same
// cases. A logo the row names but storage cannot serve is logged.
func Load(app core.App) Org {
	org := Org{Name: app.Settings().Meta.AppName, Color: DefaultColor}
	record, err := app.FindFirstRecordByFilter("org_branding", "id != ''")
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			log.Warn("read org_branding", "error", err)
		}
		return org
	}
	if c := record.GetString("brand_color"); hexColor.MatchString(c) {
		org.Color = strings.ToLower(c)
	}
	if name := record.GetString("logo"); name != "" {
		org.Logo, org.LogoType = readLogo(app, record, name)
	}
	return org
}

// readLogo returns the logo's bytes and sniffed type, or nil and "" when the
// file cannot be read or is not one of logoTypes.
func readLogo(app core.App, record *core.Record, name string) ([]byte, string) {
	fsys, err := app.NewFilesystem()
	if err != nil {
		log.Warn("open file storage for the logo", "error", err)
		return nil, ""
	}
	defer fsys.Close()
	r, err := fsys.GetReader(record.BaseFilesPath() + "/" + name)
	if err != nil {
		log.Warn("read the logo file", "file", name, "error", err)
		return nil, ""
	}
	defer r.Close()
	data, err := io.ReadAll(io.LimitReader(r, maxLogoBytes+1))
	if err != nil || len(data) > maxLogoBytes {
		log.Warn("read the logo file", "file", name, "error", err, "bytes", len(data))
		return nil, ""
	}
	kind := mimetype.Detect(data)
	for _, t := range logoTypes {
		if kind.Is(t) {
			return data, t
		}
	}
	log.Warn("the logo is not an image a document can embed", "file", name, "type", kind.String())
	return nil, ""
}
```

- [ ] **Step 6: Run the tests**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld/core/server && go vet ./branding/ && go test ./branding/ -count=1`
Expected: PASS.

- [ ] **Step 7: The fonts directory setting (test first)**

Create `core/server/docfonts/docfonts_test.go`:

```go
package docfonts

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDir_UnsetIsEmpty(t *testing.T) {
	t.Setenv(EnvVar, "")
	if got := Dir(); got != "" {
		t.Errorf("Dir() = %q", got)
	}
}

func TestDir_ReturnsAnExistingDirectory(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(EnvVar, dir)
	if got := Dir(); got != dir {
		t.Errorf("Dir() = %q, want %q", got, dir)
	}
}

// A path that is missing or is a file is ignored, so a typo in the setting
// degrades to "no extra fonts" instead of failing every render.
func TestDir_IgnoresAMissingPathOrAFile(t *testing.T) {
	t.Setenv(EnvVar, filepath.Join(t.TempDir(), "absent"))
	if got := Dir(); got != "" {
		t.Errorf("missing dir: Dir() = %q", got)
	}
	file := filepath.Join(t.TempDir(), "font.ttf")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv(EnvVar, file)
	if got := Dir(); got != "" {
		t.Errorf("file: Dir() = %q", got)
	}
}
```

Run: `cd /Users/nas/tmp/tinycld/books/tinycld/core/server && go test ./docfonts/ -count=1`
Expected: FAIL to compile — `undefined: Dir`, `undefined: EnvVar`.

Create `core/server/docfonts/docfonts.go`:

```go
// Package docfonts names the directory of extra font files that server
// renderers (printed documents, PDF files) use for characters their bundled
// fonts lack, such as Chinese, Japanese, Korean or Devanagari. The server
// operator sets it with the TINYCLD_FONTS_DIR environment variable, as other
// server paths are set (TINYCLD_STATE_DIR, TINYCLD_TYPES_DIR). Unset means the
// renderers use their bundled fonts and the fonts installed on the machine.
package docfonts

import (
	"os"

	"tinycld.org/core/logging"
)

// EnvVar names the fonts directory.
const EnvVar = "TINYCLD_FONTS_DIR"

var log = logging.ForPackage("docfonts")

// Dir returns the fonts directory, or "" when EnvVar is unset or does not name
// a directory. A set but unusable path is logged, because the operator meant it.
func Dir() string {
	dir := os.Getenv(EnvVar)
	if dir == "" {
		return ""
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		log.Warn("the fonts directory is not a directory; using bundled and installed fonts only", "env", EnvVar, "path", dir, "error", err)
		return ""
	}
	return dir
}
```

Run: `cd /Users/nas/tmp/tinycld/books/tinycld/core/server && go vet ./docfonts/ && go test ./docfonts/ -count=1`
Expected: PASS.

- [ ] **Step 8: Bump omnidoc and run its users' tests**

```bash
cd /Users/nas/tmp/tinycld/books/tinycld/core/server
go get github.com/nathanstitt/omnidoc@v1.2.0 && go mod tidy
command grep -n "nathanstitt/omnidoc" go.mod
go build ./... && go test ./textextract/ ./thumbnails/ ./coreserver/ ./branding/ ./docfonts/ -count=1
cd /Users/nas/tmp/tinycld/books/tinycld/server && go build ./...
cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run packages:generate
command grep -n "brand_color" core/types/pbSchema.ts
```
Expected: go.mod shows `github.com/nathanstitt/omnidoc v1.2.0`; builds and tests pass; `pbSchema.ts` (generated, gitignored) has `brand_color: string` in `OrgBranding`.

- [ ] **Step 9: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/tinycld
git add core/server/pb_migrations/2090000012_org_branding_brand_color.js core/server/branding core/server/docfonts core/server/go.mod core/server/go.sum
git commit -m "feat(core): org brand color, branding.Load and docfonts.Dir for server renderers; omnidoc v1.2.0"
```

### Task 7: core — brand color picker, help, e2e; open and merge the core PR

**Files:**
- Create: `core/lib/brand-color.ts`, `core/lib/__tests__/brand-color.test.ts`
- Create: `core/components/settings/BrandColorSection.tsx`
- Modify: `core/components/settings/OrgBrandingSection.tsx` (`OrgBrandingSection`, line 219)
- Modify: `core/help/organization-branding.md`
- Create: `tests/e2e/org-brand-color.spec.ts`

**Interfaces:**
- Consumes: `useOrgBranding()` → `{ branding, brandingCollection }` (`core/lib/use-org-branding.ts`); `ColorPickerGrid`, `COLOR_PALETTE` (`@tinycld/core/ui/color-picker`); `TextInput`, `useForm`, `useWatch`, `zodResolver`, `z` (`@tinycld/core/ui/form`); `mutation`, `useMutation` (`@tinycld/core/lib/mutations`); `handleMutationErrorsWithForm` (`@tinycld/core/lib/errors`); `newRecordId` (`pbtsdb/core`).
- Produces: `DEFAULT_BRAND_COLOR`, `brandColorSchema`, `type BrandColorValues`, `swatchColor(value: string): string` (`core/lib/brand-color.ts`); `BrandColorSection({ isVisible }: { isVisible: boolean })`. Test ids: `brand-color-input`, `brand-color-swatch`, `brand-color-save`; Clear row label "Use default".

- [ ] **Step 1: Write the failing schema test**

Create `core/lib/__tests__/brand-color.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { brandColorSchema, DEFAULT_BRAND_COLOR, swatchColor } from '../brand-color'

describe('brandColorSchema', () => {
    it.each(['', '#0d9488', '#ABCDEF', '  #1e40af  '])('accepts %j', value => {
        expect(brandColorSchema.safeParse({ brand_color: value }).success).toBe(true)
    })

    it.each(['red', '#12345', '#1234567', '0d9488', '#12345g'])('refuses %j with the format hint', value => {
        const result = brandColorSchema.safeParse({ brand_color: value })
        expect(result.success).toBe(false)
        expect(result.error?.issues[0]?.message).toBe('Enter # and six hex digits, like #0d9488')
    })
})

describe('swatchColor', () => {
    it('shows a valid typed color and the default otherwise', () => {
        expect(swatchColor('#1e40af')).toBe('#1e40af')
        expect(swatchColor('#12')).toBe(DEFAULT_BRAND_COLOR)
        expect(swatchColor('')).toBe(DEFAULT_BRAND_COLOR)
    })
})

// The server prints with mailer.BrandColor when no color is set; the preview must agree.
it('matches the server default', () => {
    const source = readFileSync(path.resolve(__dirname, '../../server/mailer/template.go'), 'utf8')
    expect(source).toContain(`const BrandColor = "${DEFAULT_BRAND_COLOR}"`)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run core/lib/__tests__/brand-color.test.ts`
Expected: FAIL — cannot resolve `../brand-color`.

- [ ] **Step 3: Write the schema module**

Create `core/lib/brand-color.ts`:

```ts
import { z } from '@tinycld/core/ui/form'

// The color documents print with when none is set: the server's
// branding.DefaultColor (mailer.BrandColor). A data value, not a theme color.
export const DEFAULT_BRAND_COLOR = '#0d9488'

// The org_branding.brand_color pattern (2090000012_org_branding_brand_color.js).
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export const brandColorSchema = z.object({
    brand_color: z
        .string()
        .trim()
        .refine(value => value === '' || HEX_COLOR.test(value), {
            message: 'Enter # and six hex digits, like #0d9488',
        }),
})

export type BrandColorValues = z.infer<typeof brandColorSchema>

// The color the preview swatch shows: the typed color once it is valid, else the default.
export function swatchColor(value: string): string {
    const trimmed = value.trim()
    return HEX_COLOR.test(trimmed) ? trimmed : DEFAULT_BRAND_COLOR
}
```

- [ ] **Step 4: Run the test**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run core/lib/__tests__/brand-color.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing e2e**

Create `tests/e2e/org-brand-color.spec.ts`:

```ts
import { expect, type Page, test } from '@playwright/test'
import { login } from './helpers'

// The brand color is set through the real Organization branding screen; no raw
// PocketBase writes. The e2e database is shared, so every test leaves the color
// empty (the default) when it ends.

// Via the user menu, as avatar.spec.ts does: the rail's Settings link can leave the
// previous package's screen mounted underneath. Scope to the "Organization" group.
async function openBranding(page: Page) {
    await page.getByLabel('User menu').click()
    await page.getByRole('menu').getByText('Settings', { exact: true }).click()
    const orgGroup = page.getByText('Organization', { exact: true }).locator('..')
    await orgGroup.getByText('Branding', { exact: true }).click()
    await expect(page.getByTestId('brand-color-input')).toBeVisible()
}

async function saveColor(page: Page) {
    await page.getByTestId('brand-color-save').click()
    await expect(page.getByTestId('brand-color-save')).toBeDisabled()
}

test.describe('org-brand-color:', () => {
    test('refuses a color that is not # and six hex digits', async ({ page }) => {
        await login(page)
        await openBranding(page)
        await page.getByTestId('brand-color-input').fill('#12zz45')
        await page.getByTestId('brand-color-save').click()
        await expect(page.getByText('Enter # and six hex digits, like #0d9488')).toBeVisible()
    })

    test('a typed color persists, a swatch fills it, and Use default clears it', async ({ page }) => {
        await login(page)
        await openBranding(page)
        const input = page.getByTestId('brand-color-input')

        await input.fill('#1e40af')
        await saveColor(page)
        await page.reload()
        await expect(page.getByTestId('brand-color-input')).toHaveValue('#1e40af')

        await page.getByLabel('Red berry', { exact: true }).click()
        await expect(input).toHaveValue('#980000')

        await page.getByLabel('Use default', { exact: true }).click()
        await expect(input).toHaveValue('')
        await saveColor(page)
        await page.reload()
        await expect(page.getByTestId('brand-color-input')).toHaveValue('')
    })
})
```

(The Organization page is the same component at every width, so no phone run.)

- [ ] **Step 6: Run it to verify it fails**

Run: `cd /Users/nas/tmp/tinycld/books/tinycld && E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- tests/e2e/org-brand-color.spec.ts`
Expected: FAIL — `brand-color-input` not found.

- [ ] **Step 7: Write the section**

Create `core/components/settings/BrandColorSection.tsx`:

```tsx
import { type BrandColorValues, brandColorSchema, swatchColor } from '@tinycld/core/lib/brand-color'
import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { mutation, useMutation } from '@tinycld/core/lib/mutations'
import { useOrgBranding } from '@tinycld/core/lib/use-org-branding'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { COLOR_PALETTE, ColorPickerGrid } from '@tinycld/core/ui/color-picker'
import { TextInput, useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { Text, View } from 'react-native'

const HINT =
    'Used on documents the apps print, such as PDF files: the heading, the rules and the table header. Leave empty to use the default.'

// The form edits the one branding row. When no row exists yet (no logo was ever
// uploaded) the first save creates it, as the first logo upload does.
function useBrandColorEditor() {
    const { branding, brandingCollection } = useOrgBranding()
    const form = useForm<BrandColorValues>({
        resolver: zodResolver(brandColorSchema),
        values: { brand_color: branding?.brand_color ?? '' },
        resetOptions: { keepDirtyValues: true },
    })
    const { control, setValue, setError, getValues, handleSubmit, formState } = form
    const value = useWatch({ control, name: 'brand_color' })

    const save = useMutation({
        mutationFn: mutation(function* (brandColor: string) {
            if (branding) {
                yield brandingCollection.update(branding.id, draft => {
                    draft.brand_color = brandColor
                })
                return
            }
            yield brandingCollection.insert({
                id: newRecordId(),
                logo: '',
                logo_crop: '',
                brand_color: brandColor,
            })
        }),
        onError: handleMutationErrorsWithForm({ setError, getValues, operation: 'settings.brand_color' }),
    })

    const pick = (hex: string) => setValue('brand_color', hex, { shouldDirty: true, shouldValidate: true })
    const submit = () => void handleSubmit(values => save.mutate(values.brand_color))()

    return {
        control,
        value,
        swatch: swatchColor(value),
        pick,
        submit,
        canSave: formState.isDirty && !save.isPending,
    }
}

export function BrandColorSection({ isVisible }: { isVisible: boolean }) {
    const editor = useBrandColorEditor()
    if (!isVisible) return null
    return (
        <View className="gap-3">
            <Text className="text-foreground text-xl font-bold">Brand color</Text>
            <View className="rounded-xl border border-border bg-surface-secondary p-4 gap-3">
                <Text className="text-[13px] text-muted-foreground">{HINT}</Text>
                <View className="flex-row items-center gap-3">
                    <View
                        testID="brand-color-swatch"
                        className="h-9 w-9 rounded-lg border border-border"
                        style={{ backgroundColor: editor.swatch }}
                    />
                    <View className="flex-1">
                        <TextInput
                            control={editor.control}
                            name="brand_color"
                            label="Color"
                            placeholder="#0d9488"
                            autoCapitalize="none"
                            autoCorrect={false}
                            testID="brand-color-input"
                        />
                    </View>
                </View>
                <ColorPickerGrid
                    selected={editor.value}
                    onSelect={editor.pick}
                    palette={COLOR_PALETTE}
                    showClear
                    clearLabel="Use default"
                />
                <View className="flex-row">
                    <Button testID="brand-color-save" isDisabled={!editor.canSave} onPress={editor.submit}>
                        <ButtonText>Save</ButtonText>
                    </Button>
                </View>
            </View>
        </View>
    )
}
```

In `core/components/settings/OrgBrandingSection.tsx`, import it and render it in the section variant only (the setup wizard's `field` variant stays logo-only):

```tsx
import { BrandColorSection } from '@tinycld/core/components/settings/BrandColorSection'
// ...
export function OrgBrandingSection({ variant = 'section' }: { variant?: BrandingVariant }) {
    const editor = useOrgBrandingEditor()

    return (
        <View className="gap-6">
            <BrandingBody editor={editor} variant={variant} />
            <BrandColorSection isVisible={variant === 'section'} />
            <CropperDialog editor={editor} />
        </View>
    )
}
```

(If `Button` has no `isDisabled` prop in core, use the prop `core/ui/button` exports for disabling — Books Settings uses `isDisabled` on the same `Button`.)

- [ ] **Step 8: Update the help topic**

In `core/help/organization-branding.md`, change `summary:` to `Upload a logo and pick a brand color that identify your organization.`, add `brand color` to `tags`, and append before the last paragraph:

```markdown
## Brand color

Open **Settings → Branding**. Under **Brand color**, choose a swatch or type a
color as # and six hex digits, such as #1e40af, then choose **Save**. Documents
that the apps print, such as PDF files, use this color for the heading, the rules
and the table header. Choose **Use default** and **Save** to go back to the
default teal (#0d9488).
```

- [ ] **Step 9: Run the e2e, the unit test and the core checks**

```bash
cd /Users/nas/tmp/tinycld/books/tinycld
E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- tests/e2e/org-brand-color.spec.ts tests/e2e/avatar.spec.ts
/Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run core/lib/__tests__/brand-color.test.ts
pnpm run checks && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg check
```
Expected: PASS (`avatar.spec.ts` shares the settings screens and must stay green; `check:core-isolation` is part of `checks`).

- [ ] **Step 10: Commit, push, PR, merge**

```bash
cd /Users/nas/tmp/tinycld/books/tinycld
git add core/lib/brand-color.ts core/lib/__tests__/brand-color.test.ts core/components/settings/BrandColorSection.tsx core/components/settings/OrgBrandingSection.tsx core/help/organization-branding.md tests/e2e/org-brand-color.spec.ts
git commit -m "feat(core): brand color picker in Organization branding"
git push -u origin books/p2-pdf
gh pr create --repo tinycld/tinycld --base main --head books/p2-pdf \
  --title "Org brand color, branding.Load and docfonts.Dir for server renderers, omnidoc v1.2.0" \
  --body "Adds optional org_branding.brand_color (new migration 2090000012) with a picker and help, an exported Go helper branding.Load (name, logo bytes and type, color; default mailer.BrandColor) for server-rendered documents, docfonts.Dir (TINYCLD_FONTS_DIR: extra font files for characters the bundled fonts lack), and bumps omnidoc to v1.2.0 (thead repeat, accented Latin glyphs, per-character font fallback, margin-box font)."
```
Expected: PR opens; CI green (a red check is diagnosed and fixed at its source). The driver merges it (or asks the human) and releases the `exclusive` claim. Then: `cd /Users/nas/tmp/tinycld/books/tinycld && git checkout main && git pull --ff-only && pnpm run packages:generate`. Books tasks start only now.

---

## Phase C — Books (branch `books/p2-pdf`)

### Task 8: Go display formatters pinned to the TS ones by shared vectors

**Files:**
- Create: `server/display_format.go`, `server/display_format_test.go`, `server/currency_symbols.json`, `server/testdata/display_format_vectors.json`
- Create: `tests/display-format.test.ts`

**Interfaces:**
- Consumes: `parseDay` (`server/dates.go:13`); TS `formatMoney` (`lib/money.ts`), `formatDay` (`lib/register-range.ts:103`), `ratePercentText` (`lib/sales-tax.ts:27`), `formatAddressLines` (`lib/address.ts`).
- Produces (Go): `formatMoney(cents int64, currency string) string`; `formatDay(day string) string` (returns `day` unchanged when it does not parse); `ratePercentText(ppm int64) string`; `type postalAddress struct { Line1, Line2, City, Region, PostalCode, Country string }` (json tags `line1 … country`); `formatAddressLines(a *postalAddress) []string`.

- [ ] **Step 1: Write the vectors and the symbol table**

Create `server/testdata/display_format_vectors.json` (values produced by Node 24 / ICU 78 `Intl` through the TS functions):

```json
{
    "money": [
        { "cents": 0, "currency": "USD", "text": "$0.00" },
        { "cents": 5, "currency": "USD", "text": "$0.05" },
        { "cents": -5, "currency": "USD", "text": "-$0.05" },
        { "cents": 123456, "currency": "USD", "text": "$1,234.56" },
        { "cents": -123456789, "currency": "USD", "text": "-$1,234,567.89" },
        { "cents": 9007199254740991, "currency": "USD", "text": "$90,071,992,547,409.91" },
        { "cents": -9007199254740991, "currency": "USD", "text": "-$90,071,992,547,409.91" },
        { "cents": 100000, "currency": "EUR", "text": "€1,000.00" },
        { "cents": -250, "currency": "GBP", "text": "-£2.50" },
        { "cents": 250, "currency": "CHF", "text": "CHF 2.50" },
        { "cents": -250, "currency": "CHF", "text": "-CHF 2.50" },
        { "cents": 99, "currency": "JPY", "text": "¥0.99" },
        { "cents": 123456, "currency": "CAD", "text": "CA$1,234.56" },
        { "cents": 1, "currency": "XAF", "text": "FCFA 0.01" },
        { "cents": 100, "currency": "XOF", "text": "F CFA 1.00" },
        { "cents": 100, "currency": "XCG", "text": "Cg. 1.00" },
        { "cents": 100000, "currency": "XYZ", "text": "XYZ 1,000.00" },
        { "cents": -100000, "currency": "INR", "text": "-₹1,000.00" }
    ],
    "day": [
        { "day": "2026-11-05", "text": "Nov 5, 2026" },
        { "day": "2026-09-30", "text": "Sep 30, 2026" },
        { "day": "1900-01-01", "text": "Jan 1, 1900" },
        { "day": "2026-05-01", "text": "May 1, 2026" },
        { "day": "2026-06-15", "text": "Jun 15, 2026" },
        { "day": "2026-07-04", "text": "Jul 4, 2026" },
        { "day": "2024-02-29", "text": "Feb 29, 2024" },
        { "day": "9999-12-31", "text": "Dec 31, 9999" }
    ],
    "percent": [
        { "ppm": 0, "text": "0%" },
        { "ppm": 1, "text": "0.0001%" },
        { "ppm": 10000, "text": "1%" },
        { "ppm": 62500, "text": "6.25%" },
        { "ppm": 88750, "text": "8.875%" },
        { "ppm": 105000, "text": "10.5%" },
        { "ppm": 1000000, "text": "100%" }
    ],
    "address": [
        {
            "address": { "line1": "123 Main St", "line2": "Suite 4", "city": "Springfield", "region": "IL", "postal_code": "62701", "country": "USA" },
            "lines": ["123 Main St", "Suite 4", "Springfield, IL 62701", "USA"]
        },
        {
            "address": { "line1": "10 Downing St", "line2": "", "city": "London", "region": "", "postal_code": "SW1A 2AA", "country": "United Kingdom" },
            "lines": ["10 Downing St", "London SW1A 2AA", "United Kingdom"]
        },
        {
            "address": { "line1": "", "line2": "", "city": "", "region": "", "postal_code": "75001", "country": "" },
            "lines": ["75001"]
        },
        {
            "address": { "line1": "", "line2": "", "city": "", "region": "CA", "postal_code": "", "country": "" },
            "lines": ["CA"]
        },
        {
            "address": { "line1": "", "line2": "", "city": "", "region": "", "postal_code": "", "country": "" },
            "lines": []
        },
        { "address": null, "lines": [] }
    ]
}
```

Create `server/currency_symbols.json` (the en-US prefixes that are not "CODE + no-break space"; generated from `Intl.supportedValuesOf('currency')`):

```json
{
    "AUD": "A$",
    "BRL": "R$",
    "CAD": "CA$",
    "CNY": "CN¥",
    "EUR": "€",
    "GBP": "£",
    "HKD": "HK$",
    "ILS": "₪",
    "INR": "₹",
    "JPY": "¥",
    "KRW": "₩",
    "MXN": "MX$",
    "NZD": "NZ$",
    "PHP": "₱",
    "TWD": "NT$",
    "USD": "$",
    "VND": "₫",
    "XAF": "FCFA ",
    "XCD": "EC$",
    "XCG": "Cg. ",
    "XOF": "F CFA ",
    "XPF": "CFPF "
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/display-format.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type CustomerAddress, formatAddressLines } from '../tinycld/books/lib/address'
import { formatMoney } from '../tinycld/books/lib/money'
import { formatDay } from '../tinycld/books/lib/register-range'
import { ratePercentText } from '../tinycld/books/lib/sales-tax'

type Vectors = {
    money: { cents: number; currency: string; text: string }[]
    day: { day: string; text: string }[]
    percent: { ppm: number; text: string }[]
    address: { address: CustomerAddress | null; lines: string[] }[]
}

const serverDir = join(__dirname, '..', 'server')
// server/display_format_test.go runs the same file, so a PDF prints what the screens show.
const vectors: Vectors = JSON.parse(
    readFileSync(join(serverDir, 'testdata', 'display_format_vectors.json'), 'utf8')
)
const symbols: Record<string, string> = JSON.parse(
    readFileSync(join(serverDir, 'currency_symbols.json'), 'utf8')
)

function intlPrefix(currency: string): string {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(1)
    const integer = parts.findIndex(part => part.type === 'integer')
    return parts
        .slice(0, integer)
        .map(part => part.value)
        .join('')
}

describe('display format vectors', () => {
    // it.each over an empty section passes, so an emptied section must fail here.
    it.each(['money', 'day', 'percent', 'address'] as const)('has rows in %s', section => {
        expect(vectors[section].length).toBeGreaterThan(0)
    })

    it.each(vectors.money)('formatMoney($cents, $currency)', ({ cents, currency, text }) => {
        expect(formatMoney(cents, currency)).toBe(text)
    })

    it.each(vectors.day)('formatDay($day)', ({ day, text }) => {
        expect(formatDay(day)).toBe(text)
    })

    it.each(vectors.percent)('ratePercentText($ppm)', ({ ppm, text }) => {
        expect(ratePercentText(ppm)).toBe(text)
    })

    it.each(vectors.address)('formatAddressLines %#', ({ address, lines }) => {
        expect(formatAddressLines(address)).toEqual(lines)
    })
})

describe('server/currency_symbols.json', () => {
    // The Go formatter prints "CODE + no-break space" for every currency not listed.
    it.each(Intl.supportedValuesOf('currency'))('%s matches Intl', code => {
        expect(symbols[code] ?? `${code} `).toBe(intlPrefix(code))
    })

    it('lists only currencies Intl knows', () => {
        const known = new Set(Intl.supportedValuesOf('currency'))
        expect(Object.keys(symbols).filter(code => !known.has(code))).toEqual([])
    })
})
```

Create `server/display_format_test.go`:

```go
package books

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

// displayVectors is testdata/display_format_vectors.json, which
// tests/display-format.test.ts also runs against the TS formatters.
type displayVectors struct {
	Money []struct {
		Cents    int64  `json:"cents"`
		Currency string `json:"currency"`
		Text     string `json:"text"`
	} `json:"money"`
	Day []struct {
		Day  string `json:"day"`
		Text string `json:"text"`
	} `json:"day"`
	Percent []struct {
		Ppm  int64  `json:"ppm"`
		Text string `json:"text"`
	} `json:"percent"`
	Address []struct {
		Address *postalAddress `json:"address"`
		Lines   []string       `json:"lines"`
	} `json:"address"`
}

func TestDisplayFormat_Vectors(t *testing.T) {
	src, err := os.ReadFile("testdata/display_format_vectors.json")
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v displayVectors
	if err := json.Unmarshal(src, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(v.Money) == 0 || len(v.Day) == 0 || len(v.Percent) == 0 || len(v.Address) == 0 {
		t.Fatal("a vector section is empty")
	}
	for _, row := range v.Money {
		if got := formatMoney(row.Cents, row.Currency); got != row.Text {
			t.Errorf("formatMoney(%d, %s) = %q, want %q", row.Cents, row.Currency, got, row.Text)
		}
	}
	for _, row := range v.Day {
		if got := formatDay(row.Day); got != row.Text {
			t.Errorf("formatDay(%s) = %q, want %q", row.Day, got, row.Text)
		}
	}
	for _, row := range v.Percent {
		if got := ratePercentText(row.Ppm); got != row.Text {
			t.Errorf("ratePercentText(%d) = %q, want %q", row.Ppm, got, row.Text)
		}
	}
	for _, row := range v.Address {
		if got := formatAddressLines(row.Address); !slices.Equal(got, row.Lines) {
			t.Errorf("formatAddressLines(%+v) = %q, want %q", row.Address, got, row.Lines)
		}
	}
}

// A day that does not parse prints as stored rather than as a wrong date.
func TestDisplayFormat_UnparsableDayPrintsAsStored(t *testing.T) {
	if got := formatDay("2026-02-30"); got != "2026-02-30" {
		t.Errorf("formatDay = %q", got)
	}
}
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestDisplayFormat' -count=1`
Expected: FAIL to compile — `undefined: formatMoney` (and the others).
Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/display-format.test.ts`
Expected: PASS already (the TS functions and the JSON exist); this proves the vectors and the symbol table match the client before Go reads them.

- [ ] **Step 4: Implement the formatters**

Create `server/display_format.go`:

```go
package books

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// Display formatters for printed documents: the server mirrors of the client's
// formatMoney (lib/money.ts), formatDay (lib/register-range.ts), ratePercentText
// (lib/sales-tax.ts) and formatAddressLines (lib/address.ts), locale en-US.
// testdata/display_format_vectors.json is run by both sides, so a PDF prints
// what the screens show.

//go:embed currency_symbols.json
var currencySymbolsJSON []byte

// currencySymbols holds the en-US currency prefixes that are not the code plus
// a no-break space; tests/display-format.test.ts checks it against Intl.
var currencySymbols = func() map[string]string {
	m := map[string]string{}
	if err := json.Unmarshal(currencySymbolsJSON, &m); err != nil {
		panic("books: currency_symbols.json: " + err.Error())
	}
	return m
}()

// formatMoney prints integer cents with the currency's en-US prefix, thousands
// groups and two decimals: "-$1,234.56", "CHF 2.50". Books amounts are whole
// cents, so there is no "-$0.00" case to avoid.
func formatMoney(cents int64, currency string) string {
	prefix := currency + " "
	if symbol, ok := currencySymbols[currency]; ok {
		prefix = symbol
	}
	if currency == "" {
		prefix = ""
	}
	sign := ""
	magnitude := uint64(cents)
	if cents < 0 {
		sign = "-"
		magnitude = uint64(^cents) + 1
	}
	return fmt.Sprintf("%s%s%s.%02d", sign, prefix, groupThousands(magnitude/100), magnitude%100)
}

func groupThousands(n uint64) string {
	digits := strconv.FormatUint(n, 10)
	var b strings.Builder
	for i, d := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(d)
	}
	return b.String()
}

// formatDay prints a YYYY-MM-DD day as "Nov 5, 2026". A day that does not
// parse prints as stored.
func formatDay(day string) string {
	d, err := parseDay(day)
	if err != nil {
		return day
	}
	return d.Format("Jan 2, 2006")
}

// ratePercentText prints a rate in ppm as a percent with up to four decimals,
// trailing zeros trimmed: 88750 → "8.875%".
func ratePercentText(ppm int64) string {
	whole := ppm / 10_000
	fraction := strings.TrimRight(fmt.Sprintf("%04d", ppm%10_000), "0")
	if fraction == "" {
		return fmt.Sprintf("%d%%", whole)
	}
	return fmt.Sprintf("%d.%s%%", whole, fraction)
}

// postalAddress is a stored address (the six addressParts).
type postalAddress struct {
	Line1      string `json:"line1"`
	Line2      string `json:"line2"`
	City       string `json:"city"`
	Region     string `json:"region"`
	PostalCode string `json:"postal_code"`
	Country    string `json:"country"`
}

// formatAddressLines returns the lines an address prints as: street, street
// line 2, "City, Region Postal", country, dropping empty lines.
func formatAddressLines(a *postalAddress) []string {
	if a == nil {
		return nil
	}
	cityRegion := joinNonEmpty(", ", a.City, a.Region)
	cityLine := joinNonEmpty(" ", cityRegion, a.PostalCode)
	return nonEmpty(a.Line1, a.Line2, cityLine, a.Country)
}

func joinNonEmpty(sep string, parts ...string) string {
	return strings.Join(nonEmpty(parts...), sep)
}

func nonEmpty(parts ...string) []string {
	out := []string{}
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
```

- [ ] **Step 5: Run the tests**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestDisplayFormat' -count=1`
Expected: PASS.
Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/display-format.test.ts && /Users/nas/tmp/tinycld/books/node_modules/.bin/biome check --write tests/display-format.test.ts server/testdata/display_format_vectors.json server/currency_symbols.json`
Expected: PASS; biome clean (it may reformat the JSON; re-run both test commands after it does).

- [ ] **Step 6: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/books
git add server/display_format.go server/display_format_test.go server/currency_symbols.json server/testdata/display_format_vectors.json tests/display-format.test.ts
git commit -m "feat(books): Go display formatters pinned to the client by shared vectors"
```

### Task 9: Document model and its formatted view

**Files:**
- Create: `server/pdf_document.go`, `server/pdf_document_test.go`

**Interfaces:**
- Consumes: Task 8 formatters; `maxStoredAmount` (`server/posting.go`), `maxRatePpm` (`server/sales_tax_math.go`); `branding.Org`, `branding.DefaultColor` (Task 6).
- Produces:

```go
type pdfLineKind int
const ( lineItem pdfLineKind = iota; lineSubtotal; lineDescription )
type pdfDocument struct {
	Title, Number, Currency string
	Dates         []pdfDate
	Company       pdfCompany
	Parties       []pdfParty
	Lines         []pdfLine
	SubtotalCents int64
	TaxLines      []pdfTaxLine
	Totals        []pdfAmount   // after the tax lines; the last is printed bold
	BigAmount     pdfAmount     // top right; Label "" prints none
	Notes         string
}
type pdfDate struct{ Label, Day string }
type pdfCompany struct{ Name, Address, Phone, Email, Website string } // Address: free text, one line per line
type pdfParty struct{ Label, Name, Company string; Address *postalAddress }
type pdfLine struct{ Kind pdfLineKind; Item, Description, Quantity string; RateCents, AmountCents int64 }
type pdfTaxLine struct{ Name string; RatePpm, AmountCents int64 }
type pdfAmount struct{ Label string; Cents int64 }
const maxPDFLines = 5000
func (d pdfDocument) validate() error
func pdfViewOf(doc pdfDocument, org branding.Org) pdfView
```
and `pdfView` with string fields only (see Step 3). `Quantity` prints as the kind gives it: the invoice unit decides its precision.

- [ ] **Step 1: Write the failing tests**

Create `server/pdf_document_test.go`:

```go
package books

import (
	"strings"
	"testing"

	"tinycld.org/core/branding"
)

func testDocument(customer string, lines int) pdfDocument {
	doc := pdfDocument{
		Title:    "Invoice",
		Number:   "1042",
		Currency: "USD",
		Dates:    []pdfDate{{Label: "Date", Day: "2026-11-05"}, {Label: "Due", Day: "2026-12-05"}},
		Company:  pdfCompany{Name: "Acme Books LLC", Address: "123 Main St\nSpringfield, IL 62701", Email: "billing@acme.test"},
		Parties: []pdfParty{{Label: "Bill to", Name: customer, Company: "Northwind Traders",
			Address: &postalAddress{Line1: "500 Market St", City: "San Francisco", Region: "CA", PostalCode: "94105"}}},
		TaxLines:  []pdfTaxLine{{Name: "State sales tax", RatePpm: 62500, AmountCents: 0}},
		BigAmount: pdfAmount{Label: "Balance due"},
		Notes:     "Thank you.\nPay within 30 days.",
	}
	for i := 0; i < lines; i++ {
		doc.Lines = append(doc.Lines, pdfLine{Kind: lineItem, Item: "Consulting", Description: "Consulting hours",
			Quantity: "2", RateCents: 12500, AmountCents: 25000})
		doc.SubtotalCents += 25000
	}
	doc.TaxLines[0].AmountCents = taxOn(doc.SubtotalCents, 62500)
	total := doc.SubtotalCents + doc.TaxLines[0].AmountCents
	doc.Totals = []pdfAmount{{Label: "Total", Cents: total}}
	doc.BigAmount.Cents = total
	return doc
}

func testOrg() branding.Org {
	return branding.Org{Name: "Acme Incorporated", Color: branding.DefaultColor}
}

func TestPDFView_FormatsAmountsDatesTaxLinesAndAddresses(t *testing.T) {
	doc := testDocument("Jordan Lee", 1)
	doc.Currency = "EUR"
	doc.Lines = append(doc.Lines,
		pdfLine{Kind: lineDescription, Description: "Hours billed at the standard rate."},
		pdfLine{Kind: lineSubtotal, AmountCents: 25000})
	v := pdfViewOf(doc, testOrg())
	if got := v.Rows[0]; got.Rate != "€125.00" || got.Amount != "€250.00" || got.Quantity != "2" || got.Kind != "item" {
		t.Errorf("item row = %+v", got)
	}
	if got := v.Rows[1]; got.Kind != "description" || got.Amount != "" || got.Description[0] != "Hours billed at the standard rate." {
		t.Errorf("description row = %+v", got)
	}
	if got := v.Rows[2]; got.Kind != "subtotal" || got.Description[0] != "Subtotal" || got.Amount != "€250.00" {
		t.Errorf("subtotal row = %+v", got)
	}
	if v.Dates[0].Text != "Nov 5, 2026" || v.Dates[1].Label != "Due" {
		t.Errorf("dates = %+v", v.Dates)
	}
	if v.Summary[1].Label != "State sales tax (6.25%)" || v.Summary[1].Text != "€15.63" {
		t.Errorf("tax line = %+v", v.Summary[1])
	}
	last := v.Summary[len(v.Summary)-1]
	if last.Label != "Total" || !last.Final || v.Summary[0].Label != "Subtotal" {
		t.Errorf("summary = %+v", v.Summary)
	}
	if strings.Join(v.Parties[0].Lines, "|") != "Jordan Lee|Northwind Traders|500 Market St|San Francisco, CA 94105" {
		t.Errorf("party lines = %q", v.Parties[0].Lines)
	}
	if strings.Join(v.Company.Lines, "|") != "123 Main St|Springfield, IL 62701|billing@acme.test" {
		t.Errorf("company lines = %q", v.Company.Lines)
	}
	if strings.Join(v.Notes, "|") != "Thank you.|Pay within 30 days." {
		t.Errorf("notes = %q", v.Notes)
	}
}

// With no business name in Books settings the organization name heads the page.
func TestPDFView_CompanyFallsBackToTheOrgName(t *testing.T) {
	doc := testDocument("Jordan Lee", 1)
	doc.Company.Name = "  "
	if v := pdfViewOf(doc, testOrg()); v.Company.Name != "Acme Incorporated" {
		t.Errorf("company name = %q", v.Company.Name)
	}
}

// White text on a light brand color is unreadable: the header text turns dark
// when white would fall under 3:1 contrast.
func TestPDFView_PicksReadableTextOnTheBrandColor(t *testing.T) {
	for color, want := range map[string]string{
		"#0d9488": "#ffffff", "#000000": "#ffffff", "#1e40af": "#ffffff",
		"#ffff00": "#111111", "#ffffff": "#111111", "#f9a825": "#111111",
	} {
		org := testOrg()
		org.Color = color
		v := pdfViewOf(testDocument("Jordan Lee", 1), org)
		if string(v.Brand.TextOnColor) != want {
			t.Errorf("text on %s = %s, want %s", color, v.Brand.TextOnColor, want)
		}
		if string(v.Brand.Color) != color {
			t.Errorf("brand color = %s, want %s", v.Brand.Color, color)
		}
	}
}

// A color that is not #rrggbb never reaches the CSS: the default prints.
func TestPDFView_RejectsAColorThatIsNotHex(t *testing.T) {
	org := testOrg()
	org.Color = "red;} body{display:none"
	if v := pdfViewOf(testDocument("Jordan Lee", 1), org); string(v.Brand.Color) != branding.DefaultColor {
		t.Errorf("brand color = %s", v.Brand.Color)
	}
}

func TestPDFView_LogoIsADataURIOnlyForImageTypes(t *testing.T) {
	org := testOrg()
	org.Logo, org.LogoType = []byte{0x89, 'P', 'N', 'G'}, "image/png"
	v := pdfViewOf(testDocument("Jordan Lee", 1), org)
	if !v.Brand.HasLogo || string(v.Brand.LogoSrc) != "data:image/png;base64,iVBORw==" {
		t.Errorf("png logo = %v %q", v.Brand.HasLogo, v.Brand.LogoSrc)
	}
	org.LogoType = "image/svg+xml"
	if v := pdfViewOf(testDocument("Jordan Lee", 1), org); v.Brand.HasLogo {
		t.Error("an svg logo was embedded")
	}
	if v := pdfViewOf(testDocument("Jordan Lee", 1), testOrg()); v.Brand.HasLogo {
		t.Error("no logo, but HasLogo")
	}
}

func TestPDFDocument_ValidateRefusesWhatCannotPrint(t *testing.T) {
	cases := map[string]func(d *pdfDocument){
		"no title":          func(d *pdfDocument) { d.Title = "" },
		"bad currency":      func(d *pdfDocument) { d.Currency = "usd" },
		"bad day":           func(d *pdfDocument) { d.Dates[0].Day = "2026-02-30" },
		"amount too big":    func(d *pdfDocument) { d.Lines[0].AmountCents = maxStoredAmount + 1 },
		"total too small":   func(d *pdfDocument) { d.Totals[0].Cents = -maxStoredAmount - 1 },
		"rate out of range": func(d *pdfDocument) { d.TaxLines[0].RatePpm = maxRatePpm + 1 },
		"too many lines": func(d *pdfDocument) {
			d.Lines = make([]pdfLine, maxPDFLines+1)
		},
	}
	if err := testDocument("Jordan Lee", 1).validate(); err != nil {
		t.Fatalf("a valid document was refused: %v", err)
	}
	for name, breakIt := range cases {
		doc := testDocument("Jordan Lee", 1)
		breakIt(&doc)
		if err := doc.validate(); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestPDFView|TestPDFDocument' -count=1`
Expected: FAIL to compile — `undefined: pdfDocument`.

- [ ] **Step 3: Implement the model and the view**

Create `server/pdf_document.go`:

```go
package books

import (
	"encoding/base64"
	"fmt"
	"html/template"
	"math"
	"regexp"
	"strconv"
	"strings"

	"tinycld.org/core/branding"
)

// A printed Books document in stored units: cents, YYYY-MM-DD days and ppm
// rates. A document kind (pdf_kinds.go) builds it from records; pdfViewOf
// formats it for the one template (pdf_template.html).

type pdfLineKind int

const (
	lineItem        pdfLineKind = iota // a product or service with quantity, rate and amount
	lineSubtotal                       // the sum of the item rows since the last subtotal
	lineDescription                    // text only, no amounts
)

// maxPDFLines bounds one document's rows so a runaway caller cannot pin a
// core laying out an endless table (300 rows render in well under a second).
const maxPDFLines = 5000

type pdfDocument struct {
	Title         string     // "Invoice"
	Number        string     // printed after "No."; "" prints no number
	Currency      string     // ISO code of every amount
	Dates         []pdfDate  // in print order: "Date", "Due"
	Company       pdfCompany // the seller, from books_settings
	Parties       []pdfParty // "Bill to", "Ship to"
	Lines         []pdfLine
	SubtotalCents int64
	TaxLines      []pdfTaxLine
	Totals        []pdfAmount // after the tax lines; the last prints bold
	BigAmount     pdfAmount   // top right; Label "" prints none
	Notes         string      // free text; line breaks kept
}

type pdfDate struct{ Label, Day string }

// pdfCompany is the seller block. Address is books_settings' free-text
// address, printed one line per line.
type pdfCompany struct{ Name, Address, Phone, Email, Website string }

type pdfParty struct {
	Label, Name, Company string
	Address              *postalAddress
}

type pdfLine struct {
	Kind        pdfLineKind
	Item        string // product or service name
	Description string
	Quantity    string // printed as given: the kind decides its precision
	RateCents   int64
	AmountCents int64
}

// pdfTaxLine prints the rate's or group's name with its percentage.
type pdfTaxLine struct {
	Name        string
	RatePpm     int64
	AmountCents int64
}

type pdfAmount struct {
	Label string
	Cents int64
}

var currencyCode = regexp.MustCompile(`^[A-Z]{3}$`)

// validate refuses a document the formatters cannot print truthfully.
func (d pdfDocument) validate() error {
	if strings.TrimSpace(d.Title) == "" {
		return fmt.Errorf("books: pdf: document has no title")
	}
	if !currencyCode.MatchString(d.Currency) {
		return fmt.Errorf("books: pdf: currency %q is not an ISO code", d.Currency)
	}
	if len(d.Lines) > maxPDFLines {
		return fmt.Errorf("books: pdf: %d lines is more than %d", len(d.Lines), maxPDFLines)
	}
	for _, date := range d.Dates {
		if _, err := parseDay(date.Day); err != nil {
			return fmt.Errorf("books: pdf: %s: %w", date.Label, err)
		}
	}
	amounts := []int64{d.SubtotalCents, d.BigAmount.Cents}
	for _, l := range d.Lines {
		amounts = append(amounts, l.RateCents, l.AmountCents)
	}
	for _, t := range d.TaxLines {
		if t.RatePpm < 0 || t.RatePpm > maxRatePpm {
			return fmt.Errorf("books: pdf: tax rate %d ppm is out of range", t.RatePpm)
		}
		amounts = append(amounts, t.AmountCents)
	}
	for _, t := range d.Totals {
		amounts = append(amounts, t.Cents)
	}
	for _, a := range amounts {
		if a > maxStoredAmount || a < -maxStoredAmount {
			return fmt.Errorf("books: pdf: amount %d is past 2^53-1 cents", a)
		}
	}
	return nil
}

// pdfView is the document as the template prints it: every value a string.
type pdfView struct {
	Title, Number string
	Dates         []pdfText
	Company       pdfBlock
	Parties       []pdfBlock
	Rows          []pdfRow
	Summary       []pdfText // subtotal, tax lines, totals
	BigAmount     pdfText
	Notes         []string
	Brand         pdfBrand
}

type pdfText struct {
	Label, Text string
	Final       bool // the last summary row, printed bold
}

type pdfBlock struct {
	Label, Name string
	Lines       []string
}

type pdfRow struct {
	Kind                          string // "item", "subtotal" or "description": the row's CSS class
	Item, Quantity, Rate, Amount  string
	Description                   []string
}

type pdfBrand struct {
	Color       template.CSS // validated #rrggbb
	TextOnColor template.CSS // #ffffff or #111111, whichever reads on Color
	LogoSrc     template.URL // a data: URI built here from the logo bytes
	HasLogo     bool
}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// embeddableLogoTypes are the logo types a data: URI may carry into the page.
var embeddableLogoTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true}

func pdfViewOf(doc pdfDocument, org branding.Org) pdfView {
	money := func(cents int64) string { return formatMoney(cents, doc.Currency) }
	v := pdfView{Title: doc.Title, Number: doc.Number, Brand: brandOf(org)}
	for _, d := range doc.Dates {
		v.Dates = append(v.Dates, pdfText{Label: d.Label, Text: formatDay(d.Day)})
	}
	v.Company = pdfBlock{Name: strings.TrimSpace(doc.Company.Name), Lines: lines(doc.Company.Address)}
	if v.Company.Name == "" {
		v.Company.Name = org.Name
	}
	v.Company.Lines = append(v.Company.Lines, nonEmpty(doc.Company.Phone, doc.Company.Email, doc.Company.Website)...)
	for _, p := range doc.Parties {
		block := pdfBlock{Label: p.Label, Lines: nonEmpty(p.Name)}
		if p.Company != "" && p.Company != p.Name {
			block.Lines = append(block.Lines, p.Company)
		}
		block.Lines = append(block.Lines, formatAddressLines(p.Address)...)
		v.Parties = append(v.Parties, block)
	}
	for _, l := range doc.Lines {
		v.Rows = append(v.Rows, rowOf(l, money))
	}
	v.Summary = append(v.Summary, pdfText{Label: "Subtotal", Text: money(doc.SubtotalCents)})
	for _, t := range doc.TaxLines {
		v.Summary = append(v.Summary, pdfText{
			Label: fmt.Sprintf("%s (%s)", t.Name, ratePercentText(t.RatePpm)),
			Text:  money(t.AmountCents),
		})
	}
	for _, t := range doc.Totals {
		v.Summary = append(v.Summary, pdfText{Label: t.Label, Text: money(t.Cents)})
	}
	v.Summary[len(v.Summary)-1].Final = true
	if doc.BigAmount.Label != "" {
		v.BigAmount = pdfText{Label: doc.BigAmount.Label, Text: money(doc.BigAmount.Cents)}
	}
	v.Notes = lines(doc.Notes)
	return v
}

func rowOf(l pdfLine, money func(int64) string) pdfRow {
	switch l.Kind {
	case lineSubtotal:
		return pdfRow{Kind: "subtotal", Description: []string{"Subtotal"}, Amount: money(l.AmountCents)}
	case lineDescription:
		return pdfRow{Kind: "description", Description: lines(l.Description)}
	default:
		return pdfRow{Kind: "item", Item: l.Item, Description: lines(l.Description), Quantity: l.Quantity,
			Rate: money(l.RateCents), Amount: money(l.AmountCents)}
	}
}

// lines splits free text into its non-blank lines.
func lines(text string) []string {
	var out []string
	for _, l := range strings.Split(text, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			out = append(out, l)
		}
	}
	return out
}

func brandOf(org branding.Org) pdfBrand {
	color := strings.ToLower(org.Color)
	if !hexColor.MatchString(color) {
		color = branding.DefaultColor
	}
	b := pdfBrand{Color: template.CSS(color), TextOnColor: template.CSS(textOn(color))}
	if len(org.Logo) > 0 && embeddableLogoTypes[org.LogoType] {
		b.LogoSrc = template.URL("data:" + org.LogoType + ";base64," + base64.StdEncoding.EncodeToString(org.Logo))
		b.HasLogo = true
	}
	return b
}

// textOn picks the header text color for a brand color: white unless white
// falls under 3:1 contrast (WCAG AA for large bold text), then near-black.
func textOn(hex string) string {
	channel := func(i int) float64 {
		v, _ := strconv.ParseUint(hex[i:i+2], 16, 8)
		c := float64(v) / 255
		if c <= 0.03928 {
			return c / 12.92
		}
		return math.Pow((c+0.055)/1.055, 2.4)
	}
	luminance := 0.2126*channel(1) + 0.7152*channel(3) + 0.0722*channel(5)
	if 1.05/(luminance+0.05) >= 3 {
		return "#ffffff"
	}
	return "#111111"
}
```

(`gofmt` aligns the `pdfRow` fields; run it.)

- [ ] **Step 4: Run the tests**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && gofmt -w pdf_document.go && go test ./... -run 'TestPDFView|TestPDFDocument' -count=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/books
git add server/pdf_document.go server/pdf_document_test.go
git commit -m "feat(books): printed document model and formatted view"
```

### Task 10: HTML template and the omnidoc renderer

**Files:**
- Create: `server/pdf_template.html`, `server/pdf_render.go`, `server/pdf_render_test.go`
- Modify: `server/go.mod`

**Interfaces:**
- Consumes: `pdfDocument`, `pdfViewOf`, `testDocument`, `testOrg` (Task 9); omnidoc v1.2.0 `OpenHTMLBytes`, `WithDefaultPaged`, `WithPrintMedia`, `WithContext`, `WithLogf`, `WithBundledFonts`, `WithFallbackFontDir` (Task 4), `(*Document).WritePDF`, `OpenBytes`, `PageCount`, `WriteText`.
- Produces: `type pdfFonts struct { Dir string; Hermetic bool }`; `renderPDFHTML(v pdfView) ([]byte, error)`; `htmlToPDF(ctx context.Context, page []byte, fonts pdfFonts, logf func(string, ...any)) ([]byte, error)`; `renderPDFDocument(ctx context.Context, doc pdfDocument, org branding.Org, fonts pdfFonts, logf func(string, ...any)) ([]byte, error)`; `pdfDiagnostics(ctx context.Context) func(string, ...any)`; test helper `pdfText(t, pdf) (pages int, text string)`. The route (Task 11) passes `pdfFonts{Dir: docfonts.Dir()}`.

- [ ] **Step 1: Require omnidoc (and x/image for a test font) in Books**

Add `github.com/nathanstitt/omnidoc v1.2.0` to the first `require` block of `server/go.mod`, in alphabetical order (the line before `github.com/pocketbase/dbx v1.12.0`), and `golang.org/x/image v0.46.0` (core's version; the test writes Go Bold into a temp fonts directory) before `golang.org/x/text`. Then:

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go mod download && go build ./...`
Expected: builds (omnidoc v1.2.0 is already in core's graph after Task 6; Books commits no go.sum, see `.github/workflows/ci.yml:62`).

- [ ] **Step 2: Write the failing tests**

Create `server/pdf_render_test.go`:

```go
package books

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"

	"github.com/nathanstitt/omnidoc/pkg/omnidoc"
)

// A 1x1 lossless WebP.
const webpLogoBase64 = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="

// pdfText reads a rendered PDF back: its page count and its text (each page's
// text, footers included, in order).
func pdfText(t testing.TB, pdf []byte) (int, string) {
	t.Helper()
	doc, err := omnidoc.OpenBytes(pdf)
	if err != nil {
		t.Fatalf("reopen pdf: %v", err)
	}
	var b bytes.Buffer
	if err := doc.WriteText(context.Background(), &b, omnidoc.MarkdownOptions{}); err != nil {
		t.Fatalf("pdf text: %v", err)
	}
	return doc.PageCount(), b.String()
}

// collectLogs gathers omnidoc's diagnostics for a test to inspect.
func collectLogs(logs *[]string) func(string, ...any) {
	return func(format string, args ...any) { *logs = append(*logs, fmt.Sprintf(format, args...)) }
}

func render(t *testing.T, doc pdfDocument, org branding.Org) ([]byte, []string) {
	t.Helper()
	var logs []string
	// Hermetic: the machine's fonts must not hide a glyph the bundle lacks.
	pdf, err := renderPDFDocument(context.Background(), doc, org, pdfFonts{Hermetic: true}, collectLogs(&logs))
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	return pdf, logs
}

func TestRenderPDF_ShortDocumentIsOneLetterPageWithItsPageNumber(t *testing.T) {
	pdf, _ := render(t, testDocument("Jordan Lee", 3), testOrg())
	if !bytes.HasPrefix(pdf, []byte("%PDF-")) {
		t.Fatalf("not a PDF: %q", pdf[:8])
	}
	doc, err := omnidoc.OpenBytes(pdf)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	w, h, err := doc.PageSize(0)
	if err != nil || h == 0 || w/h < 8.5/11-0.01 || w/h > 8.5/11+0.01 {
		t.Errorf("page is %.0fx%.0f, not Letter proportions", w, h)
	}
	pages, text := pdfText(t, pdf)
	if pages != 1 || !strings.Contains(text, "Page 1 of 1") {
		t.Errorf("pages = %d, text has no footer: %q", pages, text)
	}
	for _, want := range []string{"Acme Books LLC", "Jordan Lee", "$250.00", "State sales tax (6.25%)", "Nov 5, 2026"} {
		if !strings.Contains(text, want) {
			t.Errorf("text has no %q", want)
		}
	}
}

func TestRenderPDF_LongDocumentRepeatsTheHeaderOnEveryPage(t *testing.T) {
	pdf, _ := render(t, testDocument("Jordan Lee", 300), testOrg())
	pages, text := pdfText(t, pdf)
	if pages < 5 {
		t.Fatalf("300 lines made %d pages", pages)
	}
	// "Description" is the column header only: the rows say "Consulting hours".
	if got := strings.Count(text, "Description"); got != pages {
		t.Errorf("column header printed %d times over %d pages", got, pages)
	}
	if last := fmt.Sprintf("Page %d of %d", pages, pages); !strings.Contains(text, last) {
		t.Errorf("text has no %q", last)
	}
}

func TestRenderPDF_EscapesHTMLInNames(t *testing.T) {
	name := `<script>alert(1)</script> & "Co"`
	doc := testDocument(name, 1)
	doc.Company.Name = `<b>Acme</b>`
	page, err := renderPDFHTML(pdfViewOf(doc, testOrg()))
	if err != nil {
		t.Fatalf("html: %v", err)
	}
	if bytes.Contains(page, []byte("<script>alert")) || bytes.Contains(page, []byte("<b>Acme")) {
		t.Fatal("a name reached the page as markup")
	}
	if !bytes.Contains(page, []byte("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &#34;Co&#34;")) {
		t.Errorf("the name was not escaped as text")
	}
	pdf, _ := render(t, doc, testOrg())
	if _, text := pdfText(t, pdf); !strings.Contains(text, `<script>alert(1)</script> & "Co"`) {
		t.Errorf("the name does not print literally")
	}
}

func TestRenderPDF_PrintsNonLatinNamesWithoutMissingGlyphs(t *testing.T) {
	doc := testDocument("Zoë Ñandú Łódź", 1)
	doc.Parties = append(doc.Parties,
		pdfParty{Label: "Ship to", Name: "Ελληνικά ά", Company: "Москва Київ"},
		pdfParty{Label: "Contact", Name: "שלום"})
	pdf, logs := render(t, doc, testOrg())
	for _, l := range logs {
		if strings.Contains(l, "no glyph for") {
			t.Errorf("missing glyph: %s", l)
		}
	}
	_, text := pdfText(t, pdf)
	for _, want := range []string{"Zoë Ñandú Łódź", "Ελληνικά ά", "Москва Київ"} {
		if !strings.Contains(text, want) {
			t.Errorf("text has no %q", want)
		}
	}
}

func pngLogo(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	img.Set(2, 2, color.RGBA{30, 64, 175, 255})
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatalf("encode: %v", err)
	}
	return b.Bytes()
}

func TestRenderPDF_EmbedsPngAndWebpLogos(t *testing.T) {
	webp, _ := base64.StdEncoding.DecodeString(webpLogoBase64)
	for logoType, logo := range map[string][]byte{"image/png": pngLogo(t), "image/webp": webp} {
		org := testOrg()
		org.Logo, org.LogoType = logo, logoType
		pdf, logs := render(t, testDocument("Jordan Lee", 1), org)
		if !bytes.Contains(pdf, []byte("/Subtype /Image")) {
			t.Errorf("%s: no image in the PDF", logoType)
		}
		for _, l := range logs {
			if strings.Contains(l, "image") && strings.Contains(l, "failed") {
				t.Errorf("%s: %s", logoType, l)
			}
		}
	}
}

func TestRenderPDF_NoLogoPrintsTheNameOnly(t *testing.T) {
	pdf, _ := render(t, testDocument("Jordan Lee", 1), testOrg())
	if bytes.Contains(pdf, []byte("/Subtype /Image")) {
		t.Error("an image was embedded with no logo")
	}
}

func TestRenderPDF_UsesTheBrandColor(t *testing.T) {
	org := testOrg()
	org.Color = "#1e40af"
	page, err := renderPDFHTML(pdfViewOf(testDocument("Jordan Lee", 1), org))
	if err != nil {
		t.Fatalf("html: %v", err)
	}
	if !bytes.Contains(page, []byte("background: #1e40af")) || !bytes.Contains(page, []byte("color: #ffffff")) {
		t.Error("the header does not use the brand color with readable text")
	}
}

// renderPDFDocument validates first: a document the formatters cannot print
// truthfully is refused before any layout.
func TestRenderPDF_RefusesAnInvalidDocument(t *testing.T) {
	doc := testDocument("Jordan Lee", 1)
	doc.Currency = "dollars"
	if _, err := renderPDFDocument(context.Background(), doc, testOrg(), pdfFonts{}, nil); err == nil {
		t.Error("an invalid document rendered")
	}
}

// A name with characters the bundled fonts lack prints from the configured
// fonts directory (TINYCLD_FONTS_DIR in production). Go Bold stands in for a
// CJK font: it has box-drawing characters the bundle does not.
func TestRenderPDF_UsesTheFontsDirectoryForMissingCharacters(t *testing.T) {
	doc := testDocument("Box ─░▲ Co", 1)
	missing := func(fonts pdfFonts) int {
		var logs []string
		if _, err := renderPDFDocument(context.Background(), doc, testOrg(), fonts, collectLogs(&logs)); err != nil {
			t.Fatalf("render: %v", err)
		}
		n := 0
		for _, l := range logs {
			if strings.Contains(l, "no glyph for") {
				n++
			}
		}
		return n
	}
	if missing(pdfFonts{Hermetic: true}) == 0 {
		t.Fatal("precondition: the bundled fonts already cover ─░▲")
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Extra.ttf"), gobold.TTF, 0o644); err != nil {
		t.Fatalf("write font: %v", err)
	}
	if n := missing(pdfFonts{Dir: dir, Hermetic: true}); n != 0 {
		t.Errorf("%d characters still missing with the fonts directory", n)
	}
}
```

Add `"os"`, `"path/filepath"` and `"golang.org/x/image/font/gofont/gobold"` to the test file's imports.

Add `"tinycld.org/core/branding"` to the test file's imports (the `render` helper takes a `branding.Org`).

- [ ] **Step 3: Run them to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestRenderPDF' -count=1`
Expected: FAIL to compile — `undefined: renderPDFDocument`.

- [ ] **Step 4: Write the template**

Create `server/pdf_template.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{.Title}} {{.Number}}</title>
<style>
@page {
    size: Letter;
    margin: 0.6in 0.6in 0.8in;
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #666666; }
}
html { font-family: sans-serif; font-size: 10pt; color: #222222; }
body { margin: 0; }
.head { display: flex; justify-content: space-between; border-bottom: 3px solid {{.Brand.Color}}; padding-bottom: 8px; }
.logo { max-height: 64px; max-width: 200px; margin-bottom: 6px; }
.org { font-weight: bold; font-size: 12pt; }
.doc { text-align: right; }
h1 { color: {{.Brand.Color}}; margin: 0; font-size: 22pt; }
.big { margin-top: 6px; }
.big .value { font-size: 18pt; font-weight: bold; }
.label { color: #666666; font-size: 8pt; }
.parties { display: flex; margin-top: 16px; }
.party { margin-right: 48px; }
table.lines { width: 100%; border-collapse: collapse; margin-top: 16px; }
thead { display: table-header-group; }
table.lines th { background: {{.Brand.Color}}; color: {{.Brand.TextOnColor}}; text-align: left; padding: 4px 6px; }
table.lines td { padding: 4px 6px; border-bottom: 1px solid #dddddd; vertical-align: top; }
tr { break-inside: avoid; }
.n { text-align: right; white-space: nowrap; }
tr.subtotal td { font-weight: bold; border-bottom: 1px solid #999999; }
table.summary { margin-top: 12px; margin-left: auto; width: 45%; border-collapse: collapse; }
table.summary td { padding: 3px 6px; }
table.summary tr.final td { font-weight: bold; font-size: 12pt; border-top: 2px solid {{.Brand.Color}}; }
.notes { margin-top: 24px; }
</style>
</head>
<body>
<div class="head">
  <div>
    {{if .Brand.HasLogo}}<img class="logo" src="{{.Brand.LogoSrc}}" alt="">{{end}}
    <div class="org">{{.Company.Name}}</div>
    {{range .Company.Lines}}<div>{{.}}</div>{{end}}
  </div>
  <div class="doc">
    <h1>{{.Title}}</h1>
    {{if .Number}}<div>No. {{.Number}}</div>{{end}}
    {{range .Dates}}<div><span class="label">{{.Label}}</span> {{.Text}}</div>{{end}}
    {{if .BigAmount.Label}}<div class="big"><div class="label">{{.BigAmount.Label}}</div><div class="value">{{.BigAmount.Text}}</div></div>{{end}}
  </div>
</div>
<div class="parties">
{{range .Parties}}<div class="party"><div class="label">{{.Label}}</div>{{range .Lines}}<div>{{.}}</div>{{end}}</div>{{end}}
</div>
<table class="lines">
<thead><tr><th>Item</th><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead>
<tbody>
{{range .Rows}}<tr class="{{.Kind}}"><td>{{.Item}}</td><td>{{range .Description}}<div>{{.}}</div>{{end}}</td><td class="n">{{.Quantity}}</td><td class="n">{{.Rate}}</td><td class="n">{{.Amount}}</td></tr>
{{end}}</tbody>
</table>
<table class="summary">
{{range .Summary}}<tr{{if .Final}} class="final"{{end}}><td>{{.Label}}</td><td class="n">{{.Text}}</td></tr>
{{end}}</table>
{{if .Notes}}<div class="notes"><div class="label">Notes</div>{{range .Notes}}<div>{{.}}</div>{{end}}</div>{{end}}
</body>
</html>
```

- [ ] **Step 5: Write the renderer**

Create `server/pdf_render.go`:

```go
package books

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"html/template"
	"strings"
	"time"

	"github.com/nathanstitt/omnidoc/pkg/omnidoc"

	"tinycld.org/core/branding"
)

// pdfTemplate is the one page every printed Books document uses. html/template
// escapes every value; the brand color and the logo arrive as template.CSS and
// template.URL only after pdfViewOf validated them.
//
//go:embed pdf_template.html
var pdfTemplateSource string

var pdfTemplate = template.Must(template.New("pdf").Parse(pdfTemplateSource))

// pdfRenderTimeout bounds one render; omnidoc stops at the context.
const pdfRenderTimeout = 30 * time.Second

// pdfFonts chooses the fonts a render may use beyond the bundled ones.
type pdfFonts struct {
	// Dir is a directory of extra font files for characters the bundled fonts
	// lack (docfonts.Dir(), from TINYCLD_FONTS_DIR); "" for none.
	Dir string
	// Hermetic ignores the fonts installed on the machine, so a test proves
	// what the bundled fonts and Dir cover on every host. Production leaves it
	// false.
	Hermetic bool
}

// renderPDFDocument validates, formats and renders a document to PDF bytes.
func renderPDFDocument(ctx context.Context, doc pdfDocument, org branding.Org, fonts pdfFonts, logf func(string, ...any)) ([]byte, error) {
	if err := doc.validate(); err != nil {
		return nil, err
	}
	page, err := renderPDFHTML(pdfViewOf(doc, org))
	if err != nil {
		return nil, err
	}
	return htmlToPDF(ctx, page, fonts, logf)
}

func renderPDFHTML(v pdfView) ([]byte, error) {
	var b bytes.Buffer
	if err := pdfTemplate.Execute(&b, v); err != nil {
		return nil, fmt.Errorf("books: pdf template: %w", err)
	}
	return b.Bytes(), nil
}

// htmlToPDF lays the page out on Letter pages (the @page rule) and writes the
// PDF. No resource loader is set, so the page can load nothing from the network
// or disk; the logo is an inline data: URI. A character the bundled fonts lack
// comes from fonts.Dir, then (system-font mode) from the machine's fonts.
func htmlToPDF(ctx context.Context, page []byte, fonts pdfFonts, logf func(string, ...any)) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, pdfRenderTimeout)
	defer cancel()
	opts := []omnidoc.HTMLOption{omnidoc.WithDefaultPaged(), omnidoc.WithPrintMedia(), omnidoc.WithContext(ctx)}
	if fonts.Dir != "" {
		opts = append(opts, omnidoc.WithFallbackFontDir(fonts.Dir))
	}
	if fonts.Hermetic {
		opts = append(opts, omnidoc.WithBundledFonts())
	}
	if logf != nil {
		opts = append(opts, omnidoc.WithLogf(logf))
	}
	doc, err := omnidoc.OpenHTMLBytes(page, opts...)
	if err != nil {
		return nil, fmt.Errorf("books: lay out pdf: %w", err)
	}
	var out bytes.Buffer
	if err := doc.WritePDF(ctx, &out, omnidoc.PDFOptions{}); err != nil {
		return nil, fmt.Errorf("books: write pdf: %w", err)
	}
	return out.Bytes(), nil
}

// pdfDiagnostics logs the layout messages that mean the printed page is wrong
// (a character drawn as a box, an image that did not load). omnidoc's other
// messages are routine notes about CSS it degrades.
func pdfDiagnostics(ctx context.Context) func(string, ...any) {
	return func(format string, args ...any) {
		msg := fmt.Sprintf(format, args...)
		if !strings.Contains(msg, "no glyph for") && !(strings.Contains(msg, "image") && strings.Contains(msg, "failed")) {
			return
		}
		// An image message quotes its data: URI; keep the log line short.
		if len(msg) > 300 {
			msg = msg[:300] + "…"
		}
		log.WarnContext(ctx, "pdf layout problem", "detail", msg)
	}
}
```

- [ ] **Step 6: Run the tests**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go vet ./... && go test ./... -run 'TestRenderPDF' -count=1`
Expected: PASS. If `TestRenderPDF_LongDocumentRepeatsTheHeaderOnEveryPage` fails with the header printed once, `go.mod` still resolves omnidoc v1.1.2: check `go list -m github.com/nathanstitt/omnidoc` prints v1.2.0.

- [ ] **Step 7: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/books
git add server/go.mod server/pdf_template.html server/pdf_render.go server/pdf_render_test.go
git commit -m "feat(books): one HTML template rendered to Letter PDF with omnidoc"
```

### Task 11: Document-kind registry, the sample kind and the PDF route

**Files:**
- Create: `server/pdf_kinds.go`, `server/pdf_sample.go`, `server/pdf_routes.go`, `server/pdf_routes_test.go`
- Modify: `server/register.go:31-34`, `server/registrations_test.go` (`TestRegister_BindsEachPartOnce` ~line 620, `TestOAuth_ConfigurationIsReadOnly` ~line 352)

**Interfaces:**
- Consumes: `renderPDFDocument`, `pdfFonts`, `pdfDiagnostics` (Task 10); `docfonts.Dir()` (Task 6); `taxOn` (`sales_tax_math.go`); `settingsID` (`settings.go`); `levelFor`, `Level.CanRead` (`access.go`); `reports.FindViewableRecord(app, reader *core.RequestInfo, collection, id string) (*core.Record, error)` (`tinycld.org/core/reports`); `branding.Load`.
- Produces:

```go
type documentKind struct {
	Collection string // "" = printed from no record, served at /api/books/pdf/{kind}
	Build      func(app core.App, record *core.Record) (pdfDocument, error)
	FileName   func(doc pdfDocument) string // the download's name without ".pdf"
}
var documentKinds map[string]documentKind // {"sample": ...}
func buildSampleDocument(app core.App, _ *core.Record) (pdfDocument, error)
func bindPDFRoutes(e *core.ServeEvent)
func pdfContentDisposition(stem string) string
```
Routes: `GET /api/books/pdf/{kind}` (kinds with no Collection) and `GET /api/books/pdf/{kind}/{id}` (kinds with a Collection). Later units (p2-invoice, estimates, statements, p5-exports) add entries to `documentKinds`.

- [ ] **Step 1: Write the failing tests**

Create `server/pdf_routes_test.go`:

```go
package books

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// pdfReq requests a PDF route on app with the PDF routes bound, and checks the
// status, the body prefix and (for a 200) the download headers.
func pdfReq(t *testing.T, app *tests.TestApp, url, token string, want int) {
	t.Helper()
	headers := map[string]string{}
	if token != "" {
		headers["Authorization"] = token
	}
	content := []string{`"status":`}
	if want == http.StatusOK {
		content = []string{"%PDF-"}
	}
	scenario := &tests.ApiScenario{
		Name:                  "GET " + url,
		Method:                http.MethodGet,
		URL:                   url,
		Headers:               headers,
		ExpectedStatus:        want,
		ExpectedContent:       content,
		TestAppFactory:        func(testing.TB) *tests.TestApp { return app },
		DisableTestAppCleanup: true,
		BeforeTestFunc: func(_ testing.TB, _ *tests.TestApp, e *core.ServeEvent) {
			bindPDFRoutes(e)
		},
		AfterTestFunc: func(t testing.TB, _ *tests.TestApp, res *http.Response) {
			if want != http.StatusOK {
				return
			}
			if got := res.Header.Get("Content-Type"); got != "application/pdf" {
				t.Errorf("Content-Type = %q", got)
			}
			if got := res.Header.Get("Cache-Control"); got != "no-store" {
				t.Errorf("Cache-Control = %q", got)
			}
			if got := res.Header.Get("Content-Disposition"); !strings.HasPrefix(got, `attachment; filename="`) || !strings.HasSuffix(got, `.pdf"`) {
				t.Errorf("Content-Disposition = %q", got)
			}
		},
	}
	scenario.Test(t)
}

// withDocumentKind registers a kind for one test.
func withDocumentKind(t *testing.T, slug string, kind documentKind) {
	t.Helper()
	documentKinds[slug] = kind
	t.Cleanup(func() { delete(documentKinds, slug) })
}

func TestPDFRoute_SampleIsAPDFForEveryBooksReader(t *testing.T) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	for _, u := range []*core.Record{users.readOnly, users.bookkeeper, users.admin} {
		pdfReq(t, app, "/api/books/pdf/sample", tokenFor(t, u), http.StatusOK)
	}
}

func TestPDFRoute_RefusesAnonymousNoAccessAndDisabled(t *testing.T) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	pdfReq(t, app, "/api/books/pdf/sample", "", http.StatusUnauthorized)
	pdfReq(t, app, "/api/books/pdf/sample", tokenFor(t, users.none), http.StatusForbidden)

	// The token is minted before the account is disabled, as in production.
	token := tokenFor(t, users.admin)
	users.admin.Set("disabled", true)
	if err := app.Save(users.admin); err != nil {
		t.Fatalf("disable: %v", err)
	}
	pdfReq(t, app, "/api/books/pdf/sample", token, http.StatusForbidden)
}

func TestPDFRoute_UnknownKindsAndWrongShapesAreNotFound(t *testing.T) {
	app := newBooksApp(t)
	token := tokenFor(t, newLevelUsers(t, app).admin)
	pdfReq(t, app, "/api/books/pdf/nope", token, http.StatusNotFound)
	pdfReq(t, app, "/api/books/pdf/sample/abc123", token, http.StatusNotFound)
	withDocumentKind(t, "test-customer", documentKind{Collection: "books_customers",
		Build:    func(core.App, *core.Record) (pdfDocument, error) { return testDocument("x", 1), nil },
		FileName: func(pdfDocument) string { return "x" }})
	pdfReq(t, app, "/api/books/pdf/test-customer", token, http.StatusNotFound)
}

// A kind printed from a record answers 404 for a record the reader may not
// view, exactly as PocketBase's view API does, so the route is no oracle.
func TestPDFRoute_RecordKindsFollowTheViewRule(t *testing.T) {
	app := newBooksApp(t)
	users := newLevelUsers(t, app)
	customer := mkCustomer(t, app, "Acme Co", "")
	withDocumentKind(t, "test-customer", documentKind{
		Collection: "books_customers",
		Build: func(_ core.App, r *core.Record) (pdfDocument, error) {
			return testDocument(r.GetString("display_name"), 1), nil
		},
		FileName: func(pdfDocument) string { return "customer" },
	})
	token := tokenFor(t, users.readOnly)
	pdfReq(t, app, "/api/books/pdf/test-customer/"+customer.Id, token, http.StatusOK)
	pdfReq(t, app, "/api/books/pdf/test-customer/doesnotexist123", token, http.StatusNotFound)

	col, err := app.FindCollectionByNameOrId("books_customers")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	never := `id = "never"`
	col.ViewRule = &never
	if err := app.Save(col); err != nil {
		t.Fatalf("save rule: %v", err)
	}
	pdfReq(t, app, "/api/books/pdf/test-customer/"+customer.Id, token, http.StatusNotFound)
}

func TestSampleDocument_UsesTheCompanySettingsAndAddsUp(t *testing.T) {
	app := newBooksApp(t)
	settings, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		t.Fatalf("settings: %v", err)
	}
	settings.Set("business_name", "Acme Books LLC")
	settings.Set("address", "123 Main St\nSpringfield, IL 62701")
	settings.Set("email", "billing@acme.test")
	if err := app.Save(settings); err != nil {
		t.Fatalf("save settings: %v", err)
	}
	doc, err := buildSampleDocument(app, nil)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if doc.Company.Name != "Acme Books LLC" || doc.Company.Email != "billing@acme.test" || doc.Currency != settings.GetString("currency") {
		t.Errorf("company = %+v, currency = %s", doc.Company, doc.Currency)
	}
	var items int64
	for _, l := range doc.Lines {
		if l.Kind == lineItem {
			items += l.AmountCents
		}
	}
	tax := doc.TaxLines[0].AmountCents
	if items != doc.SubtotalCents || tax != taxOn(doc.SubtotalCents, doc.TaxLines[0].RatePpm) ||
		doc.Totals[0].Cents != doc.SubtotalCents+tax || doc.BigAmount.Cents != doc.Totals[0].Cents {
		t.Errorf("sample does not add up: items %d, subtotal %d, tax %d, total %d", items, doc.SubtotalCents, tax, doc.Totals[0].Cents)
	}
	if err := doc.validate(); err != nil {
		t.Errorf("sample is invalid: %v", err)
	}
}

func TestPDFContentDisposition_SanitizesTheName(t *testing.T) {
	for stem, want := range map[string]string{
		"sample-invoice":       `attachment; filename="sample-invoice.pdf"`,
		`Invoice 1042/"x"`:     `attachment; filename="invoice-1042-x.pdf"`,
		"../..":                `attachment; filename="document.pdf"`,
	} {
		if got := pdfContentDisposition(stem); got != want {
			t.Errorf("pdfContentDisposition(%q) = %q, want %q", stem, got, want)
		}
	}
}
```

In `server/registrations_test.go`:
- In `TestRegister_BindsEachPartOnce`, change the hand-bound serve hook to:

```go
	parts.OnServe().BindFunc(func(e *core.ServeEvent) error {
		bindBalanceRoutes(e)
		bindPDFRoutes(e)
		return e.Next()
	})
```

- Append to `TestOAuth_ConfigurationIsReadOnly`, after the rebuild check:

```go
	// Session only: the app's download button is the only caller (plan p2-pdf).
	for _, path := range []string{"/api/books/pdf/sample", "/api/books/pdf/invoice/abc123"} {
		if oauth.ScopeForRoute(http.MethodGet, path).SatisfiedBy(both) {
			t.Errorf("GET %s must stay session-only", path)
		}
	}
```

- Append a new test:

```go
// Register mounts the PDF routes once: the registered app serves the sample.
func TestRegister_ServesTheSamplePDF(t *testing.T) {
	app, _ := newRegisteredApp(t)
	users := newLevelUsers(t, app)
	apiReq{
		method:  http.MethodGet,
		url:     "/api/books/pdf/sample",
		token:   tokenFor(t, users.readOnly),
		want:    http.StatusOK,
		content: []string{"%PDF-"},
	}.run(t, app)
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestPDFRoute|TestSampleDocument|TestPDFContentDisposition|TestRegister_|TestOAuth_' -count=1`
Expected: FAIL to compile — `undefined: bindPDFRoutes`, `documentKinds`.

- [ ] **Step 3: Implement the registry and the sample kind**

Create `server/pdf_kinds.go`:

```go
package books

import "github.com/pocketbase/pocketbase/core"

// documentKind is one kind of printed document, the {kind} in
// /api/books/pdf/{kind}[/{id}].
type documentKind struct {
	// Collection is the collection the document prints a record of; the route
	// checks that record's view rule. "" is a kind printed from no record,
	// served at /api/books/pdf/{kind} with no id.
	Collection string
	// Build makes the document; record is nil when Collection is "".
	Build func(app core.App, record *core.Record) (pdfDocument, error)
	// FileName names the download, without ".pdf"; the route sanitizes it.
	FileName func(doc pdfDocument) string
}

// documentKinds are the documents Books prints. A unit that prints a record
// (invoice, estimate, statement, report export) adds its kind here.
var documentKinds = map[string]documentKind{
	"sample": {
		Build:    buildSampleDocument,
		FileName: func(pdfDocument) string { return "sample-invoice" },
	},
}
```

Create `server/pdf_sample.go`:

```go
package books

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// sampleTaxPpm is the sample's one tax line, 6.25%.
const sampleTaxPpm = 62500

// buildSampleDocument is the "Preview PDF" invoice in Settings: fixed lines and
// customer, printed with the real company details (books_settings) and, through
// the renderer, the real organization branding.
func buildSampleDocument(app core.App, _ *core.Record) (pdfDocument, error) {
	s, err := app.FindRecordById("books_settings", settingsID)
	if err != nil {
		return pdfDocument{}, fmt.Errorf("books: read settings: %w", err)
	}
	lines := []pdfLine{
		{Kind: lineItem, Item: "Bookkeeping", Description: "Monthly bookkeeping, October", Quantity: "1", RateCents: 45000, AmountCents: 45000},
		{Kind: lineItem, Item: "Consulting", Description: "Year-end planning session", Quantity: "3", RateCents: 12500, AmountCents: 37500},
		{Kind: lineDescription, Description: "Hours billed at the standard rate."},
		{Kind: lineSubtotal, AmountCents: 82500},
		{Kind: lineItem, Item: "Filing fee", Description: "State annual report filing", Quantity: "1", RateCents: 5000, AmountCents: 5000},
	}
	var subtotal int64
	for _, l := range lines {
		if l.Kind == lineItem {
			subtotal += l.AmountCents
		}
	}
	tax := taxOn(subtotal, sampleTaxPpm)
	total := subtotal + tax
	return pdfDocument{
		Title:    "Invoice",
		Number:   "SAMPLE",
		Currency: s.GetString("currency"),
		Dates:    []pdfDate{{Label: "Date", Day: "2026-11-05"}, {Label: "Due", Day: "2026-12-05"}},
		Company: pdfCompany{
			Name:    s.GetString("business_name"),
			Address: s.GetString("address"),
			Phone:   s.GetString("phone"),
			Email:   s.GetString("email"),
			Website: s.GetString("website"),
		},
		Parties: []pdfParty{{
			Label: "Bill to", Name: "Jordan Lee", Company: "Northwind Traders",
			Address: &postalAddress{Line1: "500 Market St", Line2: "Suite 210", City: "San Francisco", Region: "CA", PostalCode: "94105", Country: "USA"},
		}},
		Lines:         lines,
		SubtotalCents: subtotal,
		TaxLines:      []pdfTaxLine{{Name: "State sales tax", RatePpm: sampleTaxPpm, AmountCents: tax}},
		Totals:        []pdfAmount{{Label: "Total", Cents: total}},
		BigAmount:     pdfAmount{Label: "Balance due", Cents: total},
		Notes:         "This is a sample invoice.\nIt shows how your documents print with your company details, logo and brand color.",
	}, nil
}
```

- [ ] **Step 4: Implement the route**

Create `server/pdf_routes.go`:

```go
package books

import (
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/branding"
	"tinycld.org/core/docfonts"
	"tinycld.org/core/reports"
)

// bindPDFRoutes serves printed documents. A PDF is a file, not a data
// endpoint: the records it prints reach clients only through their live
// queries. Session only: the routes are not in the OAuth registration, so
// core's grant middleware default-denies them to every token.
func bindPDFRoutes(e *core.ServeEvent) {
	e.Router.GET("/api/books/pdf/{kind}", func(re *core.RequestEvent) error {
		return servePDF(re, re.Request.PathValue("kind"), "")
	})
	e.Router.GET("/api/books/pdf/{kind}/{id}", func(re *core.RequestEvent) error {
		return servePDF(re, re.Request.PathValue("kind"), re.Request.PathValue("id"))
	})
}

func servePDF(re *core.RequestEvent, slug, id string) error {
	if re.Auth == nil {
		return re.UnauthorizedError("Sign in to download this document.", nil)
	}
	// A token minted before the account was disabled still authenticates, and a
	// raw route has no collection rule to refuse it (boards requireEnabledAuth).
	if re.Auth.GetBool("disabled") {
		return re.ForbiddenError("Your account is disabled.", nil)
	}
	level, err := levelFor(re.App, re.Auth)
	if err != nil {
		return err
	}
	if !level.CanRead() {
		return re.ForbiddenError("You do not have access to Books.", nil)
	}
	kind, ok := documentKinds[slug]
	if !ok || (kind.Collection == "") != (id == "") {
		return re.NotFoundError("Document not found.", nil)
	}
	var record *core.Record
	if kind.Collection != "" {
		info, err := re.RequestInfo()
		if err != nil {
			return err
		}
		record, err = reports.FindViewableRecord(re.App, info, kind.Collection, id)
		if errors.Is(err, sql.ErrNoRows) {
			return re.NotFoundError("Document not found.", nil)
		}
		if err != nil {
			return err
		}
	}
	doc, err := kind.Build(re.App, record)
	if err != nil {
		return re.InternalServerError("Could not create the PDF.", err)
	}
	ctx := re.Request.Context()
	pdf, err := renderPDFDocument(ctx, doc, branding.Load(re.App), pdfFonts{Dir: docfonts.Dir()}, pdfDiagnostics(ctx))
	if err != nil {
		return re.InternalServerError("Could not create the PDF.", err)
	}
	re.Response.Header().Set("Content-Disposition", pdfContentDisposition(kind.FileName(doc)))
	re.Response.Header().Set("Cache-Control", "no-store")
	return re.Blob(http.StatusOK, "application/pdf", pdf)
}

var unsafeFileChars = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

// pdfContentDisposition names the download. A name can come from a person (a
// customer, a document number), so anything that could break the header or
// climb a directory is replaced, as boards' export does.
func pdfContentDisposition(stem string) string {
	stem = strings.Trim(unsafeFileChars.ReplaceAllString(stem, "-"), "-.")
	stem = strings.ToLower(stem)
	if stem == "" {
		stem = "document"
	}
	return `attachment; filename="` + stem + `.pdf"`
}
```

In `server/register.go`, bind it beside the balance route:

```go
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		bindBalanceRoutes(e)
		bindPDFRoutes(e)
		return e.Next()
	})
```

and add to the `Register` doc comment's parts list: "and the PDF routes (pdf_routes.go)". Update the `bindBalanceRoutes` comment's "the one Books route" to "a Books route".

- [ ] **Step 5: Run the tests and the whole Go suite**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go test ./... -run 'TestPDFRoute|TestSampleDocument|TestPDFContentDisposition|TestRegister_|TestOAuth_' -count=1 && go vet ./... && go test ./... -count=1`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/books
git add server/pdf_kinds.go server/pdf_sample.go server/pdf_routes.go server/pdf_routes_test.go server/register.go server/registrations_test.go
git commit -m "feat(books): document-kind registry, sample invoice and session-only PDF route"
```

### Task 12: Client download helper, "Preview PDF" in Settings, help topic and e2e

**Files:**
- Create: `tinycld/books/lib/pdf-download.ts`, `tests/pdf-download.test.ts`
- Create: `tinycld/books/hooks/usePdfDownload.ts`, `tinycld/books/hooks/useDocumentPreview.ts`
- Create: `tinycld/books/components/settings/DocumentPreviewCard.tsx`
- Modify: `tinycld/books/components/settings/CompanySection.tsx` (`CompanySection`, last function)
- Create: `help/documents.md`, `tests/help-documents.test.ts`
- Modify: `help/settings.md` ("## Company details"), `tests/help-settings.test.ts`
- Create: `tests/e2e/pdf-preview.spec.ts`

**Interfaces:**
- Consumes: `serverFetch` (`@tinycld/core/lib/server-fetch`), `pb` (`@tinycld/core/lib/pocketbase`, `pb.buildURL`, `pb.authStore.token`), `useMutation` (`@tinycld/core/lib/mutations`), `notify`, `errorToString`, `log`; expo-file-system 58 (`new File(dir, name)`, `await file.write(Uint8Array)`), expo-sharing 58 (`shareAsync(uri, { mimeType, UTI, dialogTitle })`); `SectionCard` (`components/settings/SectionCard.tsx`, prop `title`), `FieldNote`.
- Produces (for later units: invoice "PDF view", statements, exports):
  - `pdfPath(kind: string, id?: string): string` → `/api/books/pdf/<kind>[/<id>]` (segments URI-encoded)
  - `pdfFileName(stem: string): string` → sanitized `<stem>.pdf`
  - `pdfRefusalMessage(status: number, body: unknown): string`
  - `usePdfDownload()` → TanStack mutation over `{ kind: string; id?: string; fileName: string }`
  - `useDocumentPreview()` → `{ preview, isPending, label }`
  - test id `books-settings-preview-pdf`

- [ ] **Step 1: Write the failing unit test**

Create `tests/pdf-download.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pdfFileName, pdfPath, pdfRefusalMessage } from '../tinycld/books/lib/pdf-download'

describe('pdfPath', () => {
    it('builds the record-less and record routes', () => {
        expect(pdfPath('sample')).toBe('/api/books/pdf/sample')
        expect(pdfPath('invoice', 'abc123')).toBe('/api/books/pdf/invoice/abc123')
    })

    it('encodes each segment', () => {
        expect(pdfPath('a/b', 'c d')).toBe('/api/books/pdf/a%2Fb/c%20d')
    })
})

describe('pdfFileName', () => {
    it.each([
        ['sample-invoice', 'sample-invoice.pdf'],
        ['Invoice 1042/"x"', 'invoice-1042-x.pdf'],
        ['../..', 'document.pdf'],
    ])('%j → %j', (stem, name) => {
        expect(pdfFileName(stem)).toBe(name)
    })
})

describe('pdfRefusalMessage', () => {
    it('uses the server message when there is one', () => {
        expect(pdfRefusalMessage(403, { message: 'You do not have access to Books.' })).toBe(
            'You do not have access to Books.'
        )
    })

    it('falls back to the status', () => {
        expect(pdfRefusalMessage(502, null)).toBe('The server answered 502.')
        expect(pdfRefusalMessage(500, { message: 42 })).toBe('The server answered 500.')
    })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/pdf-download.test.ts`
Expected: FAIL — cannot resolve `../tinycld/books/lib/pdf-download`.

- [ ] **Step 3: Write the pure helpers**

Create `tinycld/books/lib/pdf-download.ts`:

```ts
// Pure parts of the PDF download (hooks/usePdfDownload.ts), shared by every
// screen that prints a Books document.

// The server route for a printed document (server/pdf_routes.go).
export function pdfPath(kind: string, id?: string): string {
    const base = `/api/books/pdf/${encodeURIComponent(kind)}`
    return id === undefined ? base : `${base}/${encodeURIComponent(id)}`
}

// The saved file's name. A stem can come from a person (a customer, a number),
// so anything that could escape a directory or break a header is replaced, as
// the server's Content-Disposition does.
export function pdfFileName(stem: string): string {
    const safe = stem
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '')
        .toLowerCase()
    return `${safe || 'document'}.pdf`
}

// What a refused download tells the person: the server's message (PocketBase
// error JSON) or the status.
export function pdfRefusalMessage(status: number, body: unknown): string {
    const message = (body as { message?: unknown } | null)?.message
    return typeof message === 'string' && message !== '' ? message : `The server answered ${status}.`
}
```

- [ ] **Step 4: Run the unit test**

Run: `cd /Users/nas/tmp/tinycld/books/books && /Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/pdf-download.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing e2e**

Create `tests/e2e/pdf-preview.spec.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'

// Preview PDF downloads a sample invoice rendered by the server with the saved
// company details and the organization branding. The download is checked as a
// file (magic bytes, page count); its printed content is pinned by the Go tests
// (server/pdf_render_test.go). Desktop only: the button is the same component
// in the phone layout's pushed Company page, and the phone path runs no other
// code. The native share-sheet path cannot run in a browser.

// A screen covered in the navigation stack stays mounted but hidden, so only the visible match counts.
function id(page: Page, testId: string) {
    return page.locator(`[data-testid="${testId}"]:visible`)
}

// At desktop width the Settings index shows the Company section in place.
async function openCompanySettings(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await id(page, 'books-nav-settings').click()
    await expect(id(page, 'books-settings')).toBeVisible()
    await expect(id(page, 'books-settings-preview-pdf')).toBeVisible()
}

// Read-only page count: omnidoc writes the page tree uncompressed, so the page
// objects and the tree's /Count can be read from the bytes.
function pageCounts(pdf: Buffer) {
    const text = pdf.toString('latin1')
    const pageObjects = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0
    const declared = Number(/\/Count\s+(\d+)/.exec(text)?.[1] ?? -1)
    return { pageObjects, declared }
}

test.describe('pdf-preview:', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('Preview PDF downloads the sample invoice as a one-page PDF', async ({ page }) => {
        await openCompanySettings(page)
        const download = page.waitForEvent('download')
        await id(page, 'books-settings-preview-pdf').click()
        const file = await download

        expect(file.suggestedFilename()).toBe('sample-invoice.pdf')
        const pdf = await readFile(await file.path())
        expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
        expect(pageCounts(pdf)).toEqual({ pageObjects: 1, declared: 1 })
        await expect(id(page, 'books-settings-preview-pdf')).toBeEnabled()
    })

    test('a refused download says why and leaves the button ready', async ({ page }) => {
        await openCompanySettings(page)
        await page.route('**/api/books/pdf/sample', route =>
            route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ status: 403, message: 'You do not have access to Books.', data: {} }),
            })
        )
        await id(page, 'books-settings-preview-pdf').click()
        await expect(page.getByText('Could not create the PDF', { exact: true })).toBeVisible()
        await expect(page.getByText('You do not have access to Books.', { exact: true })).toBeVisible()
        await expect(id(page, 'books-settings-preview-pdf')).toBeEnabled()
        await page.unrouteAll({ behavior: 'wait' })
    })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd /Users/nas/tmp/tinycld/books/books && E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- -g "pdf-preview:"`
Expected: FAIL — `books-settings-preview-pdf` not visible.

- [ ] **Step 7: Write the hooks**

Create `tinycld/books/hooks/usePdfDownload.ts`:

```ts
import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { notify } from '@tinycld/core/lib/notify'
import { pb } from '@tinycld/core/lib/pocketbase'
import { serverFetch } from '@tinycld/core/lib/server-fetch'
import { Platform } from 'react-native'
import { pdfFileName, pdfPath, pdfRefusalMessage } from '../lib/pdf-download'

export interface PdfDownloadInput {
    kind: string
    /** The record printed; omitted for a kind printed from no record (the sample). */
    id?: string
    /** Names the saved file; ".pdf" is added. */
    fileName: string
}

/**
 * Download a printed Books document.
 *
 * The route needs the bearer token, so the bytes are fetched here (a browser
 * anchor or the native downloader would make its own unauthenticated request),
 * then handed to the platform: a Blob URL on web, a cache file and the share
 * sheet on native (pattern: boards useBoardExport). The body is read as bytes;
 * text would corrupt a PDF.
 */
export function usePdfDownload() {
    return useMutation<void, Error, PdfDownloadInput>({
        mutationKey: ['books', 'pdf'],
        // Offline is a failure to show now, not a request to hold.
        networkMode: 'always',
        mutationFn: async ({ kind, id, fileName }: PdfDownloadInput) => {
            const headers: Record<string, string> = {}
            if (pb.authStore.token) {
                headers.Authorization = `Bearer ${pb.authStore.token}`
            }
            const response = await serverFetch(pb.buildURL(pdfPath(kind, id)), { method: 'GET', headers })
            if (!response.ok) {
                const body: unknown = await response.json().catch(() => null)
                throw new Error(pdfRefusalMessage(response.status, body))
            }
            const bytes = new Uint8Array(await response.arrayBuffer())
            await savePdf(bytes, pdfFileName(fileName))
        },
        onError: (error: unknown) => {
            log.error('books.pdf', error)
            notify.emit({
                event: 'mutation.error',
                title: 'Could not create the PDF',
                body: errorToString(error),
                durationMs: 6000,
                data: { operation: 'books.pdf', error: errorToString(error) },
            })
        },
    })
}

async function savePdf(bytes: Uint8Array, fileName: string) {
    if (Platform.OS === 'web') {
        const href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        const anchor = document.createElement('a')
        anchor.href = href
        anchor.download = fileName
        anchor.click()
        // Revoked on the next tick: Safari has not read the blob when click() returns.
        setTimeout(() => URL.revokeObjectURL(href), 0)
        return
    }
    // Lazily imported, as boards useBoardExport and core file-url.ts do: a module-init
    // failure must not break every screen that merely shows the button.
    const [{ Directory, File, Paths }, Sharing] = await Promise.all([
        import('expo-file-system'),
        import('expo-sharing'),
    ])
    if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Sharing is not available on this device')
    }
    // A unique directory so repeated downloads do not collide while the shared name stays readable.
    const dir = new Directory(Paths.cache, `books-pdf-${Date.now()}`)
    dir.create({ intermediates: true, idempotent: true })
    const target = new File(dir, fileName)
    target.create()
    await target.write(bytes)
    await Sharing.shareAsync(target.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: fileName,
    })
}
```

Create `tinycld/books/hooks/useDocumentPreview.ts`:

```ts
import { usePdfDownload } from './usePdfDownload'

// The Settings "Preview PDF" button: the sample invoice with the saved company
// details and the organization branding.
export function useDocumentPreview() {
    const download = usePdfDownload()
    return {
        preview: () => download.mutate({ kind: 'sample', fileName: 'sample-invoice' }),
        isPending: download.isPending,
        label: download.isPending ? 'Creating PDF…' : 'Preview PDF',
    }
}
```

- [ ] **Step 8: Write the card and place it**

Create `tinycld/books/components/settings/DocumentPreviewCard.tsx`:

```tsx
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { View } from 'react-native'
import { useDocumentPreview } from '../../hooks/useDocumentPreview'
import { FieldNote, SectionCard } from './SectionCard'

const NOTE =
    'See how invoices and other documents print, with your saved company details and the logo and brand color from the organization settings.'

export function DocumentPreviewCard() {
    const { preview, isPending, label } = useDocumentPreview()
    return (
        <SectionCard title="Printed documents">
            <View className="gap-3 py-3">
                <FieldNote text={NOTE} />
                <View className="flex-row">
                    <Button
                        testID="books-settings-preview-pdf"
                        variant="outline"
                        isDisabled={isPending}
                        onPress={preview}
                    >
                        <ButtonText>{label}</ButtonText>
                    </Button>
                </View>
            </View>
        </SectionCard>
    )
}
```

In `tinycld/books/components/settings/CompanySection.tsx`, import `DocumentPreviewCard` and replace `CompanySection` with:

```tsx
function CompanyDetails({ settings, isAdmin }: { settings: BooksSettings; isAdmin: boolean }) {
    if (!isAdmin) return <CompanyReadOnly values={companyValues(settings)} isVisible />
    return <CompanyForm settings={settings} />
}

// Every Books reader may preview the printed documents; only an admin edits the details.
export function CompanySection({ isAdmin }: { isAdmin: boolean }) {
    const { settings } = useBooksSettings()
    if (!settings) return null
    return (
        <View className="gap-4">
            <CompanyDetails settings={settings} isAdmin={isAdmin} />
            <DocumentPreviewCard />
        </View>
    )
}
```

(If `SectionCard`'s `title` prop is required to be non-empty or typed differently, read `SectionCardProps` in `SectionCard.tsx` and pass what it takes.)

- [ ] **Step 9: Help topic and its test**

Create `help/documents.md`:

```markdown
---
title: Printed documents
summary: How Books prints invoices and other documents as PDF files, and how to preview them.
tags: [pdf, print, invoice, logo, "brand color"]
order: 25
---

To see how your documents print, open Settings, choose Company and press Preview PDF. Books creates a sample invoice as a PDF file and downloads it. On a phone or a tablet, the share sheet opens so that you can save or send the file.

The preview uses the saved company details. If you change a detail, press Save before you preview.

## What a document shows

- Your logo and brand color. An organization owner or admin sets them in the app settings, under Branding. See [Organization branding](help://core:organization-branding).
- Your legal business name, address, phone, email and website from Settings, Company. If the business name is empty, the organization name prints.
- Page numbers at the bottom right of each page, such as "Page 1 of 2". On a long document, the column headings repeat at the top of each page.

Documents print on US Letter paper.

## Names in other scripts

Names in Latin (with accents), Greek, Cyrillic, Hebrew and Arabic print with the built-in fonts. Names in other scripts, such as Chinese, Japanese, Korean or Devanagari, print only if the server has a font for them. Otherwise each character prints as a box.

To change company details, see [Settings](help://books:settings).
```

Create `tests/help-documents.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const { exists, frontmatter, body } = readHelpTopic('documents')

describe('help/documents.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('says how to preview a document', () => {
        expect(body).toContain('To see how your documents print,')
        expect(body).toContain('Preview PDF')
    })

    it('names the paper, the page numbers and the scripts that print', () => {
        expect(body).toContain('US Letter')
        expect(body).toContain('Page 1 of 2')
        expect(body).toMatch(/Greek, Cyrillic, Hebrew and Arabic/)
    })

    it('links the branding and settings topics', () => {
        expect(body).toContain('(help://core:organization-branding)')
        expect(body).toContain('(help://books:settings)')
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })
})
```

In `help/settings.md`, "## Company details", replace "The logo and brand color are set in the organization settings." with "The logo and brand color are set in the organization settings. To see how documents print with these details, press Preview PDF. See [Printed documents](help://books:documents)." Add to `tests/help-settings.test.ts`:

```ts
    it('links the printed documents topic from Company details', () => {
        expect(body).toContain('Preview PDF')
        expect(body).toContain('(help://books:documents)')
    })
```

Then regenerate the help registry: `cd /Users/nas/tmp/tinycld/books/tinycld && pnpm run packages:generate`.

- [ ] **Step 10: Run the unit tests, the e2e and biome**

```bash
cd /Users/nas/tmp/tinycld/books/books
/Users/nas/tmp/tinycld/books/node_modules/.bin/vitest run tests/pdf-download.test.ts tests/help-documents.test.ts tests/help-settings.test.ts
/Users/nas/tmp/tinycld/books/node_modules/.bin/biome check --write tinycld/books/lib/pdf-download.ts tinycld/books/hooks/usePdfDownload.ts tinycld/books/hooks/useDocumentPreview.ts tinycld/books/components/settings/DocumentPreviewCard.tsx tinycld/books/components/settings/CompanySection.tsx tests/pdf-download.test.ts tests/help-documents.test.ts tests/help-settings.test.ts tests/e2e/pdf-preview.spec.ts
E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- -g "pdf-preview:"
E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- tests/e2e/books-settings.spec.ts
```
Expected: PASS (`books-settings.spec.ts` covers the Company section the card now sits under).

- [ ] **Step 11: Commit**

```bash
cd /Users/nas/tmp/tinycld/books/books
git add tinycld/books/lib/pdf-download.ts tinycld/books/hooks/usePdfDownload.ts tinycld/books/hooks/useDocumentPreview.ts tinycld/books/components/settings/DocumentPreviewCard.tsx tinycld/books/components/settings/CompanySection.tsx tests/pdf-download.test.ts help/documents.md tests/help-documents.test.ts help/settings.md tests/help-settings.test.ts tests/e2e/pdf-preview.spec.ts
git commit -m "feat(books): Preview PDF in Settings with a shared PDF download helper"
```

### Task 13: Verification and push

- [ ] **Step 1: Go**

Run: `cd /Users/nas/tmp/tinycld/books/books/server && go vet ./... && go test ./... -count=1`
Expected: PASS.

- [ ] **Step 2: TypeScript**

Run: `cd /Users/nas/tmp/tinycld/books/books && PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg check`
Expected: PASS.

- [ ] **Step 3: The new and changed e2e only**

No full local suite: CI runs it on the PR.

Run: `cd /Users/nas/tmp/tinycld/books/books && E2E_PORT=7230 E2E_PORT_2=7231 PATH=/Users/nas/tmp/tinycld/books/node_modules/.bin:$PATH tinycld-pkg test:e2e -- tests/e2e/pdf-preview.spec.ts tests/e2e/books-settings.spec.ts`
Expected: PASS. A red test is diagnosed at its root and fixed at the source; never a re-run, a longer timeout or a skip.

- [ ] **Step 4: Confirm core is untouched by the Books tasks, then push**

Run: `git -C /Users/nas/tmp/tinycld/books/tinycld status --short && git -C /Users/nas/tmp/tinycld/books/tinycld branch --show-current`
Expected: no changes; branch `main` (the core PR merged in Task 7).

Run: `git -C /Users/nas/tmp/tinycld/books/books status --short`
Expected: no output.

Run: `git -C /Users/nas/tmp/tinycld/books/books push -u origin books/p2-pdf`
Expected: the branch is on the remote. The driver opens the PR (short description, no assistant mention). CI assembles the workspace from core `main`, which has the merged core change.

---

## Answered questions

Answered by the human on 2026-11-06:

1. **Fonts for Chinese, Japanese, Korean and Indic scripts.** Answer: "omnidoc accepts fonts from a directory, note this as a followup to provide them." Done in this plan: omnidoc `WithFallbackFontDir` feeds a directory's fonts into per-character fallback with the glyph check (Task 4); core `docfonts.Dir()` reads `TINYCLD_FONTS_DIR` (Task 6); the Books renderer passes it (Tasks 10–11), pinned by `TestRenderPDF_UsesTheFontsDirectoryForMissingCharacters`. Providing the font files is follow-up F1.
2. **Preview behavior.** Answer: keep download (web) and the share sheet (native). Accepted; no in-app viewer in this unit.
3. **Logo.** Answer: print uncropped, max 200 × 64 px. Accepted; the template's `.logo { max-height: 64px; max-width: 200px; }` does this.

## Follow-ups

- **F1 — Provide CJK and Indic font files for the `TINYCLD_FONTS_DIR` directory** (for example Noto Sans CJK SC/JP/KR/TC and Noto Sans Devanagari, OFL). Tracked follow-up from answer 1, not deferred covered work: this plan delivers and tests the directory support end to end; F1 only supplies the files and sets the variable where the server runs, which is outside core and Books code. Until F1 lands, such names print as boxes and Books logs `pdf layout problem` with `no glyph for`.
- **F2 (omnidoc BACKLOG)** — process-wide cache of the fonts directory's parsed faces (Task 5 BACKLOG entry).
