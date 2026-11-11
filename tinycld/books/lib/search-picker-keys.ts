// What a key pressed on a focused, closed SearchPicker trigger does (web). Enter, Space
// and ↓ open it; a printable character opens it with that character in the search
// (type-to-open). A key with ⌘, Ctrl or Alt belongs to the shortcuts, and an open picker
// handles its own keys in the menu.
export type SearchPickerKeyAction = 'open' | 'open-with-text' | 'none'

const OPEN_KEYS = new Set(['Enter', ' ', 'ArrowDown'])

export function searchPickerKeyAction(
    event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean },
    isOpen: boolean
): SearchPickerKeyAction {
    if (isOpen) return 'none'
    if (event.metaKey || event.ctrlKey || event.altKey) return 'none'
    if (OPEN_KEYS.has(event.key)) return 'open'
    // A printable key's name is the one character it types; named keys (Tab, Shift,
    // ArrowUp) are longer. Array.from counts an astral character as one.
    if (Array.from(event.key).length === 1) return 'open-with-text'
    return 'none'
}
