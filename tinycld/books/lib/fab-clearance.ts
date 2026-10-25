import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'

// Bottom padding for phone scrollers so the last row clears the New FAB:
// FAB height 56 + gap above the tab bar 16 + tab bar content 56 + a gap 16.
// The safe-area inset is already excluded from the scroller's viewport.
// The FAB and tab bar render on the mobile breakpoint only.
export const FAB_CLEARANCE = 144

const phoneStyle = { paddingBottom: FAB_CLEARANCE } as const

export function useFabClearanceStyle() {
    return useBreakpoint() === 'mobile' ? phoneStyle : undefined
}
