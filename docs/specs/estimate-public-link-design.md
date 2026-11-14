# Estimate public accept link — design

Unit p2-estimate-public-link · package books · feature `estimate-public-link`. Built against books main@bf4b60e, core 6b4853f. Uses the estimate of p2-estimate (`books_estimates`, `server/estimates.go`, `ESTIMATE_DOCUMENT`) and the PDF of p2-pdf (`server/pdf_estimate.go`). Approved at design gate 1 (human, 2026-11-13): direction A (one card, decision directly under the total); open questions 1–3 and 5–15 as the packet recommended; question 4 changed: Decline keeps its inline confirm step and gains an optional free-text reason, stored on the response and shown to Books users on the estimate (§3.3, §3.5, §4.3).

## 1. Goal
A customer opens a link to one estimate without signing in, sees who sent it and its total, and accepts or declines it; the estimate's status in Books changes to Accepted or Rejected.

## 2. Where it lives
- Public route `/p/books/estimates/<token>`: Books manifest gains `publicRoutes: { directory: 'public-screens' }` and an `exports` entry `"./public-screens/*"`; the screen file is `public-screens/estimates/[token].tsx` under the package's source tree. The generator emits `app/p/books/estimates/[token].tsx`. It renders outside the auth gate (`app/p/_layout.tsx`); no sidebar, no rail, no sign-in prompt.
- The estimate form (`screens/estimates/[id].tsx`) gains the action **Copy customer link**.
- No nav entry; no Books search change.

## 3. Behavior

### 3.1 The link
- Every estimate has a link from its creation: the server gives each new estimate a random `public_token` (43 URL-safe characters, 256 bits) in the create write. The token never changes.
- The link is `<server address>/p/books/estimates/<token>`, built by one helper `estimateLinkUrl(token)` (`lib/estimate-link.ts`), which p2-email-share reuses.
- **Copy customer link** is offered to writers on a saved estimate that is pending, accepted or rejected (not on a new unsaved one, not on a closed one, not to readers). It copies the link (expo-clipboard) and shows the toast "Customer link copied." Wide: a `ShortcutButton` in the action bar after Convert to invoice; phone: an item in More. Shortcut ⌥L, in the ⇧? group "Estimate", listed in the help topic.

### 3.2 The public page — layout
- Direction A: everything, the decision included, is in one card; there is no second panel and no bottom bar on a phone.
- One centered card (max width 560 px on wide, full width with page padding on a phone), on `bg-background`, the card `bg-card` with `border-border`.
- Top of the card: the org logo (core `OrgLogo`, only when the deployment has a logo) and the business name (Books `business_name`, or the deployment name from `useOrgInfo` when it is empty).
- "Estimate 1001 for <customer display name>", then the label "Estimate total" and the total in the Books money format and currency, the largest text on the page.
- "Estimate date <date>" and, when set, "Expires <date>".
- The estimate's message to the customer when it is not empty (it is printed on the estimate anyway).
- "Download PDF" (link button): downloads the printed estimate (p2-pdf's estimate PDF) through the token route of §4.3, with core `downloadFromUrl` (web and native).
- Below the card, when Books `email` or `phone` is set: "Questions? Contact <business>" with the email (mailto) and phone (tel) as link buttons. Neither set: nothing.
- Page title (core `DocumentTitle`, `includeOrg={false}`): "Estimate 1001 · <business>".
- Light and dark follow the system scheme.

### 3.3 The public page — deciding
- Shown only while the estimate is **pending and not expired**: the sentence "To move forward, select Accept and <business> will reach out with next steps.", then **Accept** (core `Button`, primary, full card width) and **Decline** (core `Button`, outline, full card width) under it.
- **Accept** opens an inline step in the card (no dialog): "Your name" (core `TextInput`, required, at most 200 characters, zod schema through `useForm` + `zodResolver`), then **Accept estimate** and **Back**. Errors draw inline: "Enter your name." / "Use 200 characters or fewer." The name focuses when the step opens (web).
- **Decline** opens an inline step (no dialog): "Decline this estimate? <business> will see that you declined.", then "Reason (optional)" (core `TextAreaInput`, at most 1000 characters, zod schema through `useForm` + `zodResolver`: `z.string().trim().max(1000, 'Use 1000 characters or fewer.')`; blank or only spaces is sent as an empty string), then **Decline estimate** and **Back**. The error draws inline under the field. The reason field does not take focus when the step opens (it is optional; the confirm is the step's job). Enter in the reason field adds a line break; it does not submit.
- **Back** on either step closes the step and discards what was typed.
- Accept estimate / Decline estimate send one response (§4.3) through `useMutation`; while it is in flight both buttons are disabled and the pressed one reads "Accepting…" / "Declining…".
- A refusal from the server (the estimate changed meanwhile, expired, was deleted) shows its text in core `FormErrorSummary` above the step's buttons (root error through `handleMutationErrorsWithForm`) and the page re-reads the estimate, so it then shows the new state. A network failure shows "Could not send. Check your connection and try again." and keeps the step open.
- No keyboard shortcuts on the public page (it is not a Books data-entry form and its user is not a Books user); Enter in the name field submits Accept estimate.

### 3.4 The public page — states (every state is its own testID'd view)
- **Loading**: the card frame with a spinner and "Loading estimate…".
- **Accepted** (status accepted): "You accepted this estimate on <accepted date>." and, when set, "Accepted by <accepted_by>." No buttons.
- **Declined** (status rejected): "You declined this estimate." No buttons. The reason is not shown on the public page (the view of §4.2 has no reason column).
- **Closed** (status closed): "<business> has turned this estimate into an invoice." No buttons.
- **Expired** (pending, expiration date before today): "This estimate expired on <date>. Contact <business> for a new one." No buttons.
- **Not found** (no row for the token: wrong link, deleted estimate): a card with "This link is not valid." and "Ask the business that sent it for a new link." No business name (nothing is known).
- **Load error** (a 4xx other than not-found, or a refused read): "The estimate could not load." with **Try again** (core `recoverLiveQueries`, as Books screens).
- A status the business sets while the page is open shows on the next read (foreground, network back, reload); the page is not pushed live (core change signals go only to signed-in clients, `changesignal.isSignedIn`).
- After the business sets an accepted or rejected estimate back to Pending, the link shows Accept and Decline again.

### 3.5 In Books
- A customer's Accept sets the estimate to Accepted with `accepted_by` = the typed name and `accepted_date` = the server's today (`todayUTC`); Decline sets Rejected and clears both (as `clearAcceptance`). The form and read view already show the status and the acceptance fields.
- **Customer decline note.** Where the Rejected status shows in Books, a Books user also sees the customer's decline: shown while the estimate's status is Rejected and its newest `books_estimate_responses` row (by `created`) has decision `declined`. Text: "Declined by the customer on <date of the response>." and, when the reason is not empty, "Reason: <reason>" under it (full text, wrapped, never cut). It is read-only.
  - Estimate form (writers; pending, accepted and rejected estimates): a note (`testID` `estimate-decline-note`, `text-muted-foreground`, the reason in `text-foreground`) directly under the header band's second row (Status, Accepted by, Accepted date). It shows the saved state: it appears only while the stored status is Rejected, not while a writer has picked Rejected in the unsaved form.
  - Read view (readers, and closed estimates): the same note in `EstimateReadDetails`, under the status badge (`testID` `estimate-read-decline-note`). A closed estimate is never Rejected, so it never shows there for a closed one.
  - Data: one `useLiveQuery` over `books_estimate_responses` (`where eq(response.estimate, id)`, `orderBy created desc`, `findOne()`), registered in `collections.ts`; the list rule lets Books readers read it (§4.3). A response arriving while the form is open shows through the collection's realtime subscription.
  - When a writer later sets the estimate to Pending or Accepted the note hides; if the writer sets Rejected again by hand, the note shows the newest response only if it is a decline (it then carries that response's date, so the reader sees when the customer declined).
- A writer with the estimate form open who saves after the customer responded gets the existing revision conflict (`ConflictNotice`), not a silent overwrite.
- Help: `help/estimates.md` gains "Share an estimate with your customer" (copy the link, what the customer sees, what Accept and Decline change, where the customer's decline reason shows, that the link works until the estimate is deleted, ⌥L).

## 4. Data

### 4.1 Estimate token
- `books_estimates.public_token` (text, 43, pattern `^[A-Za-z0-9_-]{43}$`, unique index), added to migration 2100000012 in place (Books is unreleased). A server field: added to `ESTIMATE_SERVER_FIELDS` (pinned unset on create and update). The Go estimate create (`createQuote`) sets it from a crypto random source. Readers of Books see it (they can see the estimate anyway); the seed's estimates get tokens through the same hook.

### 4.2 Public read — view collection `books_estimate_public`
- A PocketBase view collection in a new migration (number taken at plan time, the next free after main's latest). Columns only: `id` (estimate id), `token`, `number`, `status`, `date`, `expiration_date`, `accepted_by`, `accepted_date`, `total`, `currency` (estimate's, else Books currency), `message`, `customer_name` (customer `display_name`), `business_name`, `business_email`, `business_phone` (from the one `books_settings` row). Never memo, fields, form, bill_to, email, lines, tax, customer id, invoice.
- listRule = viewRule = `@request.headers.x_share_token != "" && token = @request.headers.x_share_token`. A request without the header, or with a token that no row has, lists nothing. Books members do not read this view.
- Client: the page calls core `setShareToken(token)` before its first query (core `share-token.ts`; `pb.beforeSend` adds `X-Share-Token`), and reads the row with one `useLiveQuery` over the collection registered in `collections.ts` (`where eq(row.token, token)`, `findOne()`). Logo/deployment name: core `useOrgInfo` (public `/api/org-info`).
- `changesignal.RegisterView('books_estimate_public', 'books_estimates', 'books_customers', 'books_settings')`, as every Books view.

### 4.3 Response — collection `books_estimate_responses`
- New base collection (same new migration): `estimate` (relation books_estimates, required, cascade delete), `decision` (select `accepted`, `declined`, required), `name` (text ≤ 200; required by the Go guard when decision is accepted), `reason` (text ≤ 1000, optional; empty string when blank), `created`.
- createRule: `@request.headers.x_share_token != "" && @request.body.estimate.public_token = @request.headers.x_share_token`. listRule/viewRule: Books READ only (changed at phase 4, plan review: a token clause here let a token holder filter through the `estimate` relation, e.g. `estimate.memo~"x"`, and learn private estimate fields one guess at a time, because PocketBase does not apply the related collection's rules to a client filter; the public page never reads responses, and PocketBase returns the created record to the creator without a view rule). No update, no delete rule (nobody).
- Go create hook, inside `serialized` and one transaction: trims `name` and `reason`; refuses a non-empty `reason` on an accepted decision ("A reason is only for a decline."); refuses unless the estimate is pending ("This estimate is no longer waiting for an answer.") and not expired against `todayUTC` ("This estimate expired on <date>."); then sets the estimate's status (accepted with `accepted_by`/`accepted_date`, or rejected with acceptance cleared), bumps its revision, and saves it as the app. A refused create stores nothing.
- The client inserts the response with `useMutation` (generator, `newRecordId()`), then on success calls `reload()` on the view collection (core `server-rows` rule) so the page shows the new status.
- PDF: `GET /api/books/public/estimates/{token}/pdf` in `pdf_routes.go`, the token checked against `public_token` (constant-time compare after the indexed lookup), rendering the existing estimate kind; 404 for no match. Not in the OAuth registration. A file, not a data endpoint (as the existing PDF routes).
- Registries: `audit.RegisterCollection` for `books_estimate_responses`; OAuth scope collections gain both new collections (read scope only for the view); `TestRegister_BindsEachPartOnce` gains the new hook.

### 4.4 Seed and fixture
- `lib/estimate-public-link-fixture.ts`: the public-view rows for each state (pending with expiry after today, pending expired, accepted with a name, rejected, closed), long business and customer names, an empty message and a long one; for the Books decline note, a rejected estimate whose newest response is a decline with a long reason (several lines) and one whose decline has an empty reason. Seeded through the existing estimate fixture (every estimate gets a token at creation); the seed creates those two estimates Pending (expiry after today) and then inserts each decline response as the app (not through a public request); the response hook of §4.3 runs on that insert and sets the estimate to Rejected, so the seeded state is the one a real decline makes.

## 5. Cut
- Payor view / preview tab inside the estimate form — the writer copies the link and opens it.
- Payment options, accepted payment methods, shipping fee, discount and multicurrency toggles (the side panel) — no online payments in v0.
- Line table on the public page — Download PDF shows the printed estimate.
- Reset or turn off a link — the page shows one total and a decision; deleting the estimate ends the link.
- E-signature, tours, feedback, "Sign in" on the page — out of scope.
- Brand color on the page — a print data value, not a theme token.
- Footer legal text ("Estimates are subject to change…", copyright) — not Books content.
- Live push of status changes to the open page — no core change signal for anonymous clients.
- Emailing the link — p2-email-share.

## 6. Platform notes
No new platform item. Standing approval (human, 2026-11-11): the ⌥L shortcut works on web and iOS with a hardware keyboard; Android uses the visible button / More item. The name field's focus on opening the Accept step is web only (native shows the keyboard on tap).

## 7. Sparks carried
- Total first, decision under it: total `text-3xl font-semibold text-foreground`; Accept core `Button` primary, Decline core `Button` outline, both full card width, directly under the total block.
- The business's page: `OrgLogo` + Books business name heading; no TinyCld chrome.
- No core extension.

## 8. Non-goals
- No sign-in, account or session for the customer; no customer portal listing other documents.
- No invoice public link, no payment.
- No change to the estimate form's status rules: writers still set any of Pending, Accepted, Rejected by hand.
- No notification to the business when a customer responds (the status change is the signal).
- No rate limit beyond the guard: a response is accepted only while the estimate is pending, so a link yields at most one stored response per pending period.
