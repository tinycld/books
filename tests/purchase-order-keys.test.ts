import { hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it } from 'vitest'
import hosts, { BILL_HOST_KEY } from '../tinycld/books/forms/hosts'
import {
    DOCUMENT_PDF_KEY,
    DOCUMENT_READ_ACTION_KEYS,
    DOCUMENT_TAB_KEYS,
    type DocumentReadAction,
} from '../tinycld/books/lib/document-actions'
import { FORM_KEYS, formKeysOf, QUOTE_FORM_KEYS } from '../tinycld/books/lib/entry-shortcuts'
import {
    type ListKeyAction,
    listShortcuts,
    offeredListKeys,
} from '../tinycld/books/lib/list-shortcuts'
import { PURCHASE_ORDER_KIND } from '../tinycld/books/lib/sales-document-kinds'

// The purchase order's keys (purchase order spec §3.2). The read view's letter keys —
// Copy to bill B, Edit E, Copy C, Close X, Reopen U, Send S — are all different, and none
// is a key the document list keeps live beside a read view (its scope stays active under
// the read view's `compose` scope, so a shared key would run both). The form keys are a
// quote's, and the line keys the bill's.

const ORDER_READ_ACTIONS: readonly DocumentReadAction[] = [
    'copy_to_bill',
    'edit',
    'copy',
    'close',
    'reopen',
    'send',
]

// Every key the list registers while a document is beside its 320 px column: a writer's
// list with rows and all its tabs, and no tick boxes (the column draws none).
function besideListKeys(): string[] {
    const offered = offeredListKeys({
        showNew: true,
        showTicks: false,
        hasRows: true,
        tabCount: 7,
        isMenuOpen: false,
        isCovered: false,
    })
    const run = Object.fromEntries(offered.map(action => [action, () => {}])) as Record<
        ListKeyAction,
        () => void
    >
    return listShortcuts({
        idPrefix: 'books.purchases.list',
        group: 'Expenses',
        tabLabels: ['1', '2', '3', '4', '5', '6', '7'],
        offered,
        run,
        isBeside: true,
    }).map(shortcut => shortcut.keys.toLowerCase())
}

function tableOf(hostKey: string, tableKey: string) {
    const raw = hosts.find(candidate => candidate.key === hostKey)
    if (!raw) throw new Error(`no host ${hostKey}`)
    const table = hostDefSchema.parse(raw).builtin.find(builtin => builtin.key === tableKey)
    if (table?.kind !== 'table') throw new Error(`${hostKey} has no table ${tableKey}`)
    return table
}

describe('the purchase order read keys', () => {
    it('are B, E, C, X, U and S', () => {
        expect(ORDER_READ_ACTIONS.map(action => DOCUMENT_READ_ACTION_KEYS[action])).toEqual([
            'b',
            'e',
            'c',
            'x',
            'u',
            's',
        ])
    })

    it('hold no key twice, Download PDF included', () => {
        const keys = [...ORDER_READ_ACTIONS, 'pdf' as const].map(
            action => DOCUMENT_READ_ACTION_KEYS[action]
        )
        expect(new Set(keys).size).toBe(keys.length)
        expect(DOCUMENT_READ_ACTION_KEYS.pdf).toBe(DOCUMENT_PDF_KEY)
    })

    it('share no key with the list beside the read view', () => {
        const beside = besideListKeys()
        expect(beside).toContain('o')
        for (const action of ORDER_READ_ACTIONS) {
            expect(beside, action).not.toContain(DOCUMENT_READ_ACTION_KEYS[action].toLowerCase())
        }
    })
})

describe('the purchase order form keys', () => {
    it('are the quote form keys: Save & close ⌘↵, Save & new ⌘⇧↵, Save ⌘S, Cancel Esc, Delete ⌘⌫', () => {
        const keys = formKeysOf(PURCHASE_ORDER_KIND.lifecycle)
        expect(keys).toBe(QUOTE_FORM_KEYS)
        expect(keys).toMatchObject({
            saveAndClose: '$mod+Enter',
            saveAndNew: '$mod+Shift+Enter',
            save: '$mod+s',
            cancel: 'Escape',
            deleteRecord: '$mod+Backspace',
        })
    })

    it('keep the quote keys on the estimate and the posting keys on the invoice', () => {
        expect(formKeysOf('quote')).toBe(QUOTE_FORM_KEYS)
        expect(formKeysOf('posting')).toBe(FORM_KEYS)
    })

    it('keep ⌘P for Download PDF and ⌥1 / ⌥2 for the tabs', () => {
        expect(DOCUMENT_PDF_KEY).toBe('$mod+p')
        expect(DOCUMENT_TAB_KEYS).toEqual({ edit: 'Alt+1', pdf: 'Alt+2' })
    })

    it.each(['account_lines', 'item_lines'])('give the %s table the bill line keys', tableKey => {
        const order = tableOf(PURCHASE_ORDER_KIND.hostKey, tableKey)
        const bill = tableOf(BILL_HOST_KEY, tableKey)
        expect(order.rowKinds?.map(kind => kind.shortcut)).toEqual(
            bill.rowKinds?.map(kind => kind.shortcut)
        )
        expect(order.insertShortcuts).toEqual(bill.insertShortcuts)
        expect(order.rowShortcuts).toBe(true)
    })

    it('add an account line with ⌥↵ and a product line with ⌥P', () => {
        const account = tableOf(PURCHASE_ORDER_KIND.hostKey, 'account_lines')
        const item = tableOf(PURCHASE_ORDER_KIND.hostKey, 'item_lines')
        expect(account.rowKinds?.map(kind => kind.shortcut)).toEqual(['Alt+Enter'])
        expect(item.rowKinds?.map(kind => kind.shortcut)).toEqual(['Alt+p'])
    })
})
