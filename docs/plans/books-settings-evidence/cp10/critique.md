# CP10 critique — Access section (round 3)

## State check
- access-{1280,390}-{light,dark}: VALID (list, empty search, two locked owner rows, collaborator at Bookkeeper).
- access-level-changed-{1280,390}-{light,dark}: VALID (collaborator select and chip read Admin, admin description under the email).
- access-no-match-{1280,390}-{light,dark}: VALID ("zzzzqq", "No one matches zzzzqq.").

## Resolved from round 2
- Level chip: light fill 240,253,250 with border 227,233,241 on card 248,250,252; dark fill 30,41,59 on card 18,24,40. A pill with teal text is visible in both themes at both widths, same shape and size. The two themes agree. Fixed.

## Findings
access-1280-{light,dark}, access-390-{light,dark}: chip — light reads as an outlined pill, dark as a filled pill (the dark border 29,39,57 is one step from the fill). Same element, both legible; the weight differs a little between themes — NOTE.

access-level-changed-{1280,390}-{light,dark}: avatars — the same three users carry different avatar colors than in `access-*` (admin blue to yellow, Collaborator teal to orange, Test User orange to blue). A person's avatar color should be stable between runs — NOTE.

access-no-match-{1280,390}-{light,dark}: search field — the focus ring is blue, not the teal accent used by the active section and chip. Reference shows the field unfocused — NOTE.

access-no-match-*: nothing else found.
