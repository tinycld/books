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
    listLayoutFor,
    RECORD_LIST_WIDTH,
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
        const style = stackContainerStyle('panel', false, 'panel')
        expect(style.width).toBe(0)
        expect(style.borderLeftWidth ?? 0).toBe(0)
    })

    it('is a 480 px column with a 1 px left border on the panel surface with a customer open', () => {
        const style = stackContainerStyle('panel', true, 'panel')
        expect(style.width).toBe(480)
        expect(style.borderLeftWidth).toBe(1)
    })

    it('fills the rest of the row with no fixed width for an open record-width page', () => {
        const style = stackContainerStyle('panel', true, 'record')
        expect(style.width).toBeUndefined()
        expect(style).toMatchObject({ flex: 1, minWidth: 0, borderLeftWidth: 1 })
    })

    it('is a zero-width column at record width with nothing open', () => {
        expect(stackContainerStyle('panel', false, 'record').width).toBe(0)
    })

    it.each([
        [false, 'panel'],
        [true, 'panel'],
        [false, 'record'],
        [true, 'record'],
    ] as const)('covers the content area on the page surface (open: %s, width: %s)', (isOpen, width) => {
        expectAbsoluteFill(stackContainerStyle('page', isOpen, width))
    })
})

describe('listColumnStyle', () => {
    it('fills the rest of the row and can shrink on the panel surface at panel width', () => {
        expect(listColumnStyle('panel', 'panel', true)).toEqual({ flex: 1, minWidth: 0 })
        expect(listColumnStyle('panel', 'panel', false)).toEqual({ flex: 1, minWidth: 0 })
    })

    it('is a fixed 320 px name column beside an open record-width page', () => {
        expect(RECORD_LIST_WIDTH).toBe(320)
        const style = listColumnStyle('panel', 'record', true)
        expect(style.width).toBe(320)
        expect(style.flexShrink).toBe(0)
    })

    it('fills the row at record width while nothing is open', () => {
        expect(listColumnStyle('panel', 'record', false)).toEqual({ flex: 1, minWidth: 0 })
    })
})

describe('listLayoutFor', () => {
    it('shows only names beside an open record-width page on the panel surface', () => {
        expect(listLayoutFor('panel', 'record', true)).toBe('names')
    })

    it('keeps the table on the page surface, at panel width, or with nothing open', () => {
        expect(listLayoutFor('page', 'record', true)).toBe('table')
        expect(listLayoutFor('panel', 'panel', true)).toBe('table')
        expect(listLayoutFor('panel', 'record', false)).toBe('table')
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
