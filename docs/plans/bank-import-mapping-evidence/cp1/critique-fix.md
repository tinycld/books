# Gate 2 critique after the fix round — bank-import-mapping, checkpoint 1

Scope: the 8 shots the fixes changed (`error-*`, `importing-*`, 390/1280 × light/dark). The two fixes: the load-error message is now `text-danger`; the "Banking" back link is disabled while the import runs. Notes of the first critique (empty list box height, light-mode "Importing…" contrast) are not repeated.

Verdict: CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE

## State check

- error-1280-light, error-1280-dark, error-390-light, error-390-dark: show the load-error state (back link, title, bordered block with "Books could not load this bank file." and Retry). Valid.
- importing-1280-light, importing-1280-dark, importing-390-light, importing-390-dark: show the import in flight (every box checked and dimmed, Cancel disabled, "Importing…" with the spinner, back link disabled). Valid.

## Findings

### error-1280-light, error-1280-dark, error-390-light, error-390-dark
- nothing found. The message in `text-danger` is legible on both themes (red on the light card, pink-red on the dark card); block, centering and Retry are as the reference. The reference drew this message in `text-foreground`; the tone is not a structure, hierarchy or state decision, and `unreadable-*` already uses the danger tone for its load message, so the page is consistent with itself.

### importing-1280-light, importing-1280-dark, importing-390-light, importing-390-dark
- Header back link "Banking" — the disabled link is only slightly paler than the enabled one (the link is `text-muted-foreground` in both states, and the disabled dimming is a small opacity step), so the person has no clear sign that the link is off while Cancel next to the button shows a clear disabled tint. A stronger dim (the same opacity as Cancel) would make the two disabled controls read alike. No spec text or reference decision covers the back link's disabled look (spec §3 Import names "Back/Cancel, the check boxes and the shortcuts"). — NOTE

## For gate 3
Nothing visible.
