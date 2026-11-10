import { describe, expect, it } from 'vitest'
import { searchPickerKeyAction } from '../tinycld/books/lib/search-picker-keys'

function key(
    name: string,
    mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}
) {
    return { key: name, metaKey: false, ctrlKey: false, altKey: false, ...mods }
}

describe('searchPickerKeyAction', () => {
    it('opens a closed picker on Enter, Space and ArrowDown', () => {
        expect(searchPickerKeyAction(key('Enter'), false)).toBe('open')
        expect(searchPickerKeyAction(key(' '), false)).toBe('open')
        expect(searchPickerKeyAction(key('ArrowDown'), false)).toBe('open')
    })

    it('opens a closed picker with the typed text on a printable character', () => {
        expect(searchPickerKeyAction(key('a'), false)).toBe('open-with-text')
    })

    it('does nothing on Tab, Escape, Shift and ArrowUp', () => {
        expect(searchPickerKeyAction(key('Tab'), false)).toBe('none')
        expect(searchPickerKeyAction(key('Escape'), false)).toBe('none')
        expect(searchPickerKeyAction(key('Shift'), false)).toBe('none')
        expect(searchPickerKeyAction(key('ArrowUp'), false)).toBe('none')
    })

    it('leaves a key with ⌘, Ctrl or Alt to the shortcuts', () => {
        expect(searchPickerKeyAction(key('a', { metaKey: true }), false)).toBe('none')
        expect(searchPickerKeyAction(key('a', { ctrlKey: true }), false)).toBe('none')
        expect(searchPickerKeyAction(key('a', { altKey: true }), false)).toBe('none')
        expect(searchPickerKeyAction(key('Enter', { metaKey: true }), false)).toBe('none')
        expect(searchPickerKeyAction(key('ArrowDown', { altKey: true }), false)).toBe('none')
    })

    it('does nothing while the picker is open', () => {
        expect(searchPickerKeyAction(key('Enter'), true)).toBe('none')
        expect(searchPickerKeyAction(key(' '), true)).toBe('none')
        expect(searchPickerKeyAction(key('ArrowDown'), true)).toBe('none')
        expect(searchPickerKeyAction(key('a'), true)).toBe('none')
    })
})
