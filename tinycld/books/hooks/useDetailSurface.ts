import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
import { type DetailSurface, detailSurfaceFor } from '../lib/detail-surface'

// A primitive selector, so a reader re-renders only when the surface flips.
export function useDetailSurface(): DetailSurface {
    return useWindowSizeStore(s => detailSurfaceFor(s.width))
}
