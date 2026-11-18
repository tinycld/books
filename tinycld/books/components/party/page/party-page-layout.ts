// A party page's gutter, and the left-aligned column its forms fill.
export function columnsFor(isPhone: boolean) {
    if (isPhone) return { gutterClass: 'px-4', rowClassName: 'w-full px-4' }
    return { gutterClass: 'px-6', rowClassName: 'w-full max-w-[720px] px-6' }
}
