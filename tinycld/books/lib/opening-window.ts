// Row-window math for a list whose items have different heights (a compact band
// header between taller rows). Pure, so a unit test can pin it.

// Top edge of an item, measured from the first item.
export function itemTop(heights: readonly number[], index: number): number {
    let top = 0
    for (let i = 0; i < index && i < heights.length; i++) top += heights[i]
    return top
}

// The item that covers `y`, clamped to the list.
export function indexAt(heights: readonly number[], y: number): number {
    if (heights.length === 0) return 0
    let top = 0
    for (let i = 0; i < heights.length; i++) {
        top += heights[i]
        if (top > y) return i
    }
    return heights.length - 1
}

// Index of the band item that holds `index`: the nearest band at or above it, or -1
// when none precedes it.
export function bandIndexAt(items: readonly { kind: 'band' | 'row' }[], index: number): number {
    for (let i = Math.min(index, items.length - 1); i >= 0; i--) {
        if (items[i].kind === 'band') return i
    }
    return -1
}

export interface WindowInput {
    heights: readonly number[]
    scrollY: number
    // Height of everything above the first item (date block, sticky header).
    offset: number
    viewHeight: number
    overscan: number
}

export function windowRange({ heights, scrollY, offset, viewHeight, overscan }: WindowInput) {
    const total = heights.length
    const y = Math.max(0, scrollY - offset)
    const firstVisible = indexAt(heights, y)
    const first = Math.min(Math.max(0, firstVisible - overscan), total)
    let bottomIndex = firstVisible
    let top = itemTop(heights, firstVisible)
    while (bottomIndex < total && top < y + viewHeight) {
        top += heights[bottomIndex]
        bottomIndex += 1
    }
    const last = Math.min(total, bottomIndex + overscan)
    return {
        first,
        last,
        firstVisible,
        topSpace: itemTop(heights, first),
        bottomSpace: itemTop(heights, total) - itemTop(heights, last),
    }
}
