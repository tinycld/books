import { describe, expect, it } from 'vitest'
import { drawerPlacement } from '../tinycld/books/lib/drawer-placement'

// The values AccountPanel used before the extraction; the chart-of-accounts e2e
// and account-panel tests guard that AccountPanel still uses them.
describe('drawerPlacement', () => {
    it('is an inline right drawer 380 px wide on a wide, non-tablet window', () => {
        expect(drawerPlacement({ isWide: true, isTablet: false })).toEqual({
            presentation: 'inline',
            anchor: 'right',
            size: 'md',
            contentClassName: 'w-[380px]',
        })
    })

    it.each([
        { isWide: true, isTablet: true },
        { isWide: false, isTablet: true },
    ])('is an overlay right drawer with no width class on a tablet (%o)', input => {
        expect(drawerPlacement(input)).toEqual({
            presentation: 'overlay',
            anchor: 'right',
            size: 'md',
            contentClassName: undefined,
        })
    })

    it('is a large bottom overlay with no width class on a phone', () => {
        expect(drawerPlacement({ isWide: false, isTablet: false })).toEqual({
            presentation: 'overlay',
            anchor: 'bottom',
            size: 'lg',
            contentClassName: undefined,
        })
    })
})
