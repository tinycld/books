// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { focusScreenControl, isFocusUnclaimed } from '~/tinycld/books/lib/focus-return.web'

// happy-dom lays nothing out, so every element reads as drawn unless a test hides it.
function screen(html: string): HTMLElement {
    const root = document.createElement('div')
    root.innerHTML = html
    document.body.append(root)
    for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
        const isHidden = element.closest('[data-hidden]') !== null
        element.getClientRects = () =>
            (isHidden ? [] : [new DOMRect(0, 0, 10, 10)]) as unknown as DOMRectList
    }
    return root
}

afterEach(() => {
    document.body.innerHTML = ''
})

describe('focusScreenControl', () => {
    it('focuses the first test id that is drawn and takes focus', () => {
        const root = screen(
            '<div data-testid="send" tabindex="0">Send</div><input data-testid="field" />'
        )
        focusScreenControl(root, ['send', 'field'])
        expect(document.activeElement?.getAttribute('data-testid')).toBe('send')
    })

    it('falls back to the next test id when the first is not drawn', () => {
        const root = screen(
            '<div data-hidden><div data-testid="send" tabindex="0">Send</div></div>' +
                '<div data-testid="band"><span>Customer</span><input data-testid="customer" /></div>'
        )
        focusScreenControl(root, ['send', 'band'])
        expect(document.activeElement?.getAttribute('data-testid')).toBe('customer')
    })

    it('skips a disabled control', () => {
        const root = screen(
            '<div data-testid="send" tabindex="0" aria-disabled="true">Send</div>' +
                '<div data-testid="bar"><div tabindex="0" data-testid="more">More</div></div>'
        )
        focusScreenControl(root, ['send', 'bar'])
        expect(document.activeElement?.getAttribute('data-testid')).toBe('more')
    })

    it('reads only inside the screen given', () => {
        const other = screen('<div data-testid="send" tabindex="0">Send</div>')
        const root = screen('<p>nothing to focus</p>')
        focusScreenControl(root, ['send'])
        expect(document.activeElement).toBe(document.body)
        expect(other.isConnected).toBe(true)
    })

    it('reads the focus as unclaimed only while it is on the body, on the web', () => {
        const root = screen('<input data-testid="field" />')
        expect(isFocusUnclaimed()).toBe(true)
        root.querySelector<HTMLElement>('input')?.focus()
        expect(isFocusUnclaimed()).toBe(false)
        root.querySelector<HTMLElement>('input')?.blur()
        expect(isFocusUnclaimed()).toBe(true)
    })

    it('does nothing for a node that is not an element', () => {
        screen('<div data-testid="send" tabindex="0">Send</div>')
        focusScreenControl(null, ['send'])
        expect(document.activeElement).toBe(document.body)
    })
})
