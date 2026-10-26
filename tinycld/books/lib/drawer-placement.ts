export type DrawerPlacementInput = { isWide: boolean; isTablet: boolean }

const INLINE_WIDTH = 'w-[380px]'

// Where a list's side Drawer sits: inline beside the list on a wide window, over
// it from the right on a tablet, and from the bottom on a phone.
export function drawerPlacement({ isWide, isTablet }: DrawerPlacementInput): {
    presentation: 'inline' | 'overlay'
    anchor: 'right' | 'bottom'
    size: 'md' | 'lg'
    contentClassName: string | undefined
} {
    if (isWide && !isTablet) {
        return {
            presentation: 'inline',
            anchor: 'right',
            size: 'md',
            contentClassName: INLINE_WIDTH,
        }
    }
    if (isTablet) {
        return { presentation: 'overlay', anchor: 'right', size: 'md', contentClassName: undefined }
    }
    return { presentation: 'overlay', anchor: 'bottom', size: 'lg', contentClassName: undefined }
}
