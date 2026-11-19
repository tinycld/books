// The Category of a purchase list row (spec docs/specs/purchase-lists-design.md §3 "Rows
// and columns", §4 "Category"): a bill, an expense or a vendor credit with one line names
// that line's account or product, two or more lines read "Split", no line reads "—". The
// list's queries read a document's first two lines by position (`.limit(2)`), so two
// lines are enough to know it is split. Pure, so each rule is unit-tested.

export type PurchaseCategory =
    | { kind: 'none' }
    | { kind: 'split' }
    | { kind: 'account'; id: string }
    | { kind: 'product'; id: string }

const DASH = '—'

export const NO_CATEGORY: PurchaseCategory = { kind: 'none' }

// A line names an account (an account line) or a product (a product line); the other
// field is ''. A draft line not filled in names neither, so it has no category.
export function categoryOf(
    lines: readonly { account: string; product: string }[]
): PurchaseCategory {
    const [first, second] = lines
    if (first === undefined) return { kind: 'none' }
    if (second !== undefined) return { kind: 'split' }
    if (first.product !== '') return { kind: 'product', id: first.product }
    if (first.account !== '') return { kind: 'account', id: first.account }
    return { kind: 'none' }
}

export type CategoryNames = {
    accounts: ReadonlyMap<string, string>
    products: ReadonlyMap<string, string>
}

// An account or product whose name is not loaded (yet, or any more) reads "—".
export function categoryText(category: PurchaseCategory, names: CategoryNames): string {
    switch (category.kind) {
        case 'none':
            return DASH
        case 'split':
            return 'Split'
        case 'account':
            return names.accounts.get(category.id) ?? DASH
        case 'product':
            return names.products.get(category.id) ?? DASH
    }
}
