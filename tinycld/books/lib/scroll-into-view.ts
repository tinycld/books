// The scroll offset that brings one item fully into view, or null when it is in view
// already. `top` and `bottom` are the item's edges in the scroller's content; `cover` is
// the height a sticky header hides at the top of the view. Null too while the view is not
// measured yet (`viewHeight` 0): any offset computed from it would be wrong.
export function scrollIntoViewY(input: {
    top: number
    bottom: number
    scrollY: number
    viewHeight: number
    cover: number
}): number | null {
    const { top, bottom, scrollY, viewHeight, cover } = input
    if (viewHeight <= 0) return null
    if (top < scrollY + cover) return Math.max(0, top - cover)
    if (bottom > scrollY + viewHeight) return bottom - viewHeight
    return null
}
