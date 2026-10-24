// Header and rows share these. Account wins the free space; Amount never shrinks,
// so a narrow window scrolls the table sideways instead of clipping a figure.
export const NAME_STYLE = { flexGrow: 3, flexShrink: 1, flexBasis: 0, minWidth: 140 }
export const DETAIL_STYLE = { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 100 }
export const AMOUNT_STYLE = { width: 168, flexShrink: 0 }
// A band header is a compact bar; a row or card is taller. The row window adds up these.
export const OPENING_ITEM_HEIGHT = {
    wide: { band: 48, row: 56 },
    phone: { band: 48, row: 124 },
}

const INDENT = 16

export function indentFor(depth: number) {
    return (depth - 1) * INDENT
}
