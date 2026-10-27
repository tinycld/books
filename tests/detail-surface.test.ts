import type { ViewStyle } from 'react-native'
import { describe, expect, it } from 'vitest'
import {
    DETAIL_PANEL_MIN_WINDOW,
    DETAIL_PANEL_WIDTH,
    detailScreenOptions,
    detailSurfaceFor,
    formRowClassFor,
    INDEX_SCREEN_OPTIONS,
    listColumnStyle,
    stackContainerStyle,
    stackPointerEvents,
} from '../tinycld/books/lib/detail-surface'

function expectAbsoluteFill(style: ViewStyle) {
    expect(style).toMatchObject({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 })
}

describe('detailSurfaceFor', () => {
    it('has a 480 px panel from a 1360 px window', () => {
        expect(DETAIL_PANEL_WIDTH).toBe(480)
        expect(DETAIL_PANEL_MIN_WINDOW).toBe(1360)
    })

    it.each([
        [390, 'page'],
        [1359, 'page'],
        [1360, 'panel'],
        [1600, 'panel'],
    ] as const)('a %i px window gets the %s surface', (width, surface) => {
        expect(detailSurfaceFor(width)).toBe(surface)
    })
})

describe('stackPointerEvents', () => {
    it('is none on web whether or not a customer is open', () => {
        expect(stackPointerEvents(true, false)).toBe('none')
        expect(stackPointerEvents(true, true)).toBe('none')
    })

    it('is none on native with no customer open and box-none with one open', () => {
        expect(stackPointerEvents(false, false)).toBe('none')
        expect(stackPointerEvents(false, true)).toBe('box-none')
    })
})

describe('stackContainerStyle', () => {
    it('is a zero-width column with no border on the panel surface with nothing open', () => {
        const style = stackContainerStyle('panel', false)
        expect(style.width).toBe(0)
        expect(style.borderLeftWidth ?? 0).toBe(0)
    })

    it('is a 480 px column with a 1 px left border on the panel surface with a customer open', () => {
        const style = stackContainerStyle('panel', true)
        expect(style.width).toBe(480)
        expect(style.borderLeftWidth).toBe(1)
    })

    it.each([false, true])('covers the content area on the page surface (open: %s)', isOpen => {
        expectAbsoluteFill(stackContainerStyle('page', isOpen))
    })
})

describe('listColumnStyle', () => {
    it('fills the rest of the row and can shrink on the panel surface', () => {
        expect(listColumnStyle('panel')).toMatchObject({ flex: 1, minWidth: 0 })
    })
})

describe('screen options', () => {
    it('the index screen is a transparent card', () => {
        expect(INDEX_SCREEN_OPTIONS).toMatchObject({
            presentation: 'card',
            contentStyle: { backgroundColor: 'transparent' },
        })
    })

    it('the page surface slides in and can be swiped back', () => {
        expect(detailScreenOptions('page')).toEqual({
            presentation: 'card',
            animation: 'default',
            gestureEnabled: true,
        })
    })

    it('the panel surface has no animation and no gesture', () => {
        expect(detailScreenOptions('panel')).toEqual({
            presentation: 'card',
            animation: 'none',
            gestureEnabled: false,
        })
    })
})

describe('formRowClassFor', () => {
    it('centers a 720 px column with 24 px gutters on the page surface', () => {
        const page = formRowClassFor('page')
        expect(page).toContain('max-w-[720px]')
        expect(page).toContain('px-6')
    })

    it('fills the panel with no 720 px cap', () => {
        const panel = formRowClassFor('panel')
        expect(panel).not.toContain('max-w-[720px]')
        expect(panel).not.toContain('px-6')
    })
})
