import { describe, expect, it } from 'vitest'
import { ITEM_TABS, itemTabOf, SHOWN_ITEM_TABS } from '../tinycld/books/lib/item-page-tabs'

// The item page's tabs (inventory-adjust spec §3.6 "Tabs"): Stock · Bins · Details, keys
// ⌥1 ⌥2 ⌥3.

const FIXED_KEYS = { stock: 'Alt+1', bins: 'Alt+2', details: 'Alt+3' }

describe('ITEM_TABS', () => {
    it('gives Stock, Bins and Details their fixed keys', () => {
        expect(Object.fromEntries(ITEM_TABS.map(tab => [tab.key, tab.keys]))).toEqual(FIXED_KEYS)
        expect(ITEM_TABS.map(tab => tab.label)).toEqual(['Stock', 'Bins', 'Details'])
    })
})

describe('SHOWN_ITEM_TABS', () => {
    it('keeps each fixed key, whatever the strip shows', () => {
        const fixed = new Map<string, string>(Object.entries(FIXED_KEYS))
        for (const tab of SHOWN_ITEM_TABS) {
            expect(tab.keys, tab.key).toBe(fixed.get(tab.key))
        }
    })

    it('starts with Stock and shows Details', () => {
        expect(SHOWN_ITEM_TABS[0]?.key).toBe('stock')
        expect(SHOWN_ITEM_TABS.map(tab => tab.key)).toContain('details')
    })

    // Spec §3.6 "Tabs": Stock (first) · Bins · Details, now that the Bins tab is built.
    it('shows Stock, Bins and Details, in that order', () => {
        expect(SHOWN_ITEM_TABS.map(tab => tab.key)).toEqual(['stock', 'bins', 'details'])
        expect(SHOWN_ITEM_TABS.map(tab => tab.label)).toEqual(['Stock', 'Bins', 'Details'])
    })
})

describe('itemTabOf', () => {
    it('selects Stock with no tab param, or an unknown one', () => {
        expect(itemTabOf(undefined)).toBe('stock')
        expect(itemTabOf('')).toBe('stock')
        expect(itemTabOf('bogus')).toBe('stock')
        expect(itemTabOf('transactions')).toBe('stock')
    })

    it('selects a shown tab from its param', () => {
        expect(itemTabOf('stock')).toBe('stock')
        expect(itemTabOf('details')).toBe('details')
        expect(itemTabOf('bins')).toBe('bins')
    })
})
