import type { ViewStyle } from 'react-native'

export const DETAIL_PANEL_WIDTH = 480
// Below this window width a 480 px panel leaves the list too narrow, so the record is a page.
export const DETAIL_PANEL_MIN_WINDOW = 1360

export type DetailSurface = 'panel' | 'page'

export function detailSurfaceFor(windowWidth: number): DetailSurface {
    return windowWidth >= DETAIL_PANEL_MIN_WINDOW ? 'panel' : 'page'
}

// Web: CSS pointer-events is inherited, so `none` on the container reaches every layer
// the navigator draws (the transparent index screen would otherwise take every click on
// the list), and the record's surface opts its own root back in. Native: `none` covers
// the whole subtree, so it is `box-none` while a record is open.
export function stackPointerEvents(isWeb: boolean, isDetailOpen: boolean): 'none' | 'box-none' {
    if (isWeb || !isDetailOpen) return 'none'
    return 'box-none'
}

export function listColumnStyle(_surface: DetailSurface): ViewStyle {
    return { flex: 1, minWidth: 0 }
}

const PAGE_CONTAINER: ViewStyle = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
}

// Only values change between surfaces, never the element tree, so the stack and the
// open record do not remount when the window crosses DETAIL_PANEL_MIN_WINDOW.
export function stackContainerStyle(surface: DetailSurface, isDetailOpen: boolean): ViewStyle {
    if (surface === 'page') return PAGE_CONTAINER
    if (!isDetailOpen) return { width: 0, overflow: 'hidden' }
    return { width: DETAIL_PANEL_WIDTH, borderLeftWidth: 1, overflow: 'hidden' }
}

export const INDEX_SCREEN_OPTIONS = {
    presentation: 'card',
    contentStyle: { backgroundColor: 'transparent' },
} as const

// Every screen stays a card at every width, so a mounted screen never changes presentation.
export function detailScreenOptions(surface: DetailSurface) {
    if (surface === 'page') {
        return { presentation: 'card', animation: 'default', gestureEnabled: true } as const
    }
    return { presentation: 'card', animation: 'none', gestureEnabled: false } as const
}

// The page's 720 px column less its 24 px gutters leaves 672 px of form, above core's
// 640 px NARROW_BELOW, so half-width pairs show side by side there and not in the panel.
export function formRowClassFor(surface: DetailSurface): string {
    if (surface === 'page') return 'w-full max-w-[720px] self-center px-6'
    return 'w-full px-4'
}
