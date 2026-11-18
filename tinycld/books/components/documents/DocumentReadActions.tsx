import { type ScopeOwner, type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { useId, useMemo, useRef } from 'react'
import { View } from 'react-native'
import type { DocumentReadItem } from '../../hooks/useDocumentReadActions'
import { DOCUMENT_PDF_KEY, DOCUMENT_READ_ACTION_KEYS } from '../../lib/document-actions'
import { type DocumentMoreItem, DocumentMoreMenu } from './DocumentActionBar'
import { type DocumentChrome, useDocumentChrome } from './document-chrome'

interface DocumentReadActionsProps {
    actions: DocumentReadItem[]
    // Audit history, for a Books reader: always the last More row, and never a key (it
    // only opens a screen), so useMoreKeys never sees it.
    historyItem: DocumentMoreItem | null
    isPhone: boolean
    // A void runs: More does not open.
    isBusy: boolean
    // The record has a PDF (Download PDF, ⌘P); a payment and a kind without one do not.
    hasPdf?: boolean
    scopeOwner: ScopeOwner
}

type KeyKind = Pick<DocumentChrome, 'testId' | 'shortcutGroup'>

const BAR =
    'flex-row flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-4 py-2'

function keyOf(item: DocumentReadItem): string {
    return DOCUMENT_READ_ACTION_KEYS[item.action]
}

function shortcutOf(item: DocumentReadItem, group: string) {
    return { keys: keyOf(item), scope: 'compose', group } as const
}

function ReadButton({
    item,
    isPrimary,
    scopeOwner,
}: {
    item: DocumentReadItem
    isPrimary: boolean
    scopeOwner: ScopeOwner
}) {
    const doc = useDocumentChrome()
    const variant = isPrimary ? 'default' : 'outline'
    const shortcut = shortcutOf(item, doc.shortcutGroup)
    const testID = `${doc.testId}-${item.id}`
    return (
        <ShortcutButton
            label={item.label}
            shortcut={shortcut}
            onPress={item.onSelect}
            variant={variant}
            isDisabled={item.isDisabled}
            testID={testID}
            scopeOwner={scopeOwner}
        />
    )
}

// The keys of the rows a phone puts in More: the rows have no ShortcutButton, so the keys
// are registered here and do what the rows do. A key is registered only for a row that is
// offered (core's ⇧? list does not read `when`); `when` reads the row's state at press
// time, so a key does nothing while its row is disabled.
function useMoreKeys(kind: KeyKind, items: DocumentReadItem[], scopeOwner: ScopeOwner) {
    const instance = useId()
    const itemsRef = useRef(items)
    itemsRef.current = items
    const names = items.map(item => item.id).join(',')
    const { testId, shortcutGroup: group } = kind
    const shortcuts = useMemo<Shortcut[]>(() => {
        const ids = names === '' ? [] : names.split(',')
        const current = (id: string) => itemsRef.current.find(item => item.id === id)
        return ids.map(id => {
            const item = current(id)
            return {
                id: `books.${testId}.read.${instance}.${id}`,
                keys: item ? keyOf(item) : '',
                scope: 'compose' as const,
                description: item?.label ?? '',
                group,
                when: () => current(id)?.isDisabled === false,
                run: () => current(id)?.onSelect(),
            }
        })
    }, [instance, names, testId, group])
    useRegisterShortcuts(shortcuts, scopeOwner)
}

// ⌘P is always taken while the read view of a record with a PDF holds the keys, so the
// browser's Print never opens: while Download PDF is busy its own key is idle, and this
// one takes it and does nothing. A record without a PDF registers no ⌘P.
function usePdfKeyWhileBusy(
    kind: KeyKind,
    hasPdf: boolean,
    items: DocumentReadItem[],
    scopeOwner: ScopeOwner
) {
    const instance = useId()
    const isBusyRef = useRef(false)
    isBusyRef.current = items.some(item => item.action === 'pdf' && item.isDisabled)
    const { testId, shortcutGroup: group } = kind
    const shortcuts = useMemo<Shortcut[]>(() => {
        if (!hasPdf) return []
        return [
            {
                id: `books.${testId}.read.${instance}.pdfBusy`,
                keys: DOCUMENT_PDF_KEY,
                scope: 'compose',
                description: 'Download PDF',
                group,
                when: () => isBusyRef.current,
                run: () => {},
            },
        ]
    }, [instance, testId, group, hasPdf])
    useRegisterShortcuts(shortcuts, scopeOwner)
}

// The actions a phone's bar keeps in place of Edit while they are offered.
const PHONE_PRIMARY_ACTIONS: ReadonlySet<DocumentReadItem['action']> = new Set([
    'pay_bill',
    'apply_credit',
])

// The one button a phone's bar keeps beside More. A lone action is the bar button, since a
// menu of one row only hides it. A bill with a balance keeps Pay bill, its primary action
// (pay-bills spec §2), and a vendor credit with unapplied credit keeps Apply to bills (vendor
// credit spec §3.7). Otherwise a posting document keeps Edit (a voided one has none, so all
// its actions are in More) and a quote keeps its primary action, the first.
function phoneButtonOf(
    lifecycle: DocumentChrome['lifecycle'],
    actions: DocumentReadItem[]
): DocumentReadItem | undefined {
    if (actions.length === 1) return actions[0]
    if (lifecycle === 'quote') return actions[0]
    const primary = actions.find(item => PHONE_PRIMARY_ACTIONS.has(item.action))
    return primary ?? actions.find(item => item.id === 'read-edit')
}

/**
 * The read view's bar. Wide: a ShortcutButton per action (Apply to bills A, Edit E, Void V,
 * Copy C, View journal entry J, Download PDF ⌘P), the first one primary. Phone: one button
 * (the only action when there is one, else Pay bill or Apply to bills on a bill or vendor
 * credit that offers it, Edit on any other posting
 * document and the first action on a quote) and the rest in a More menu whose rows
 * show their keys. A reader gets View journal entry and Download PDF on a posting
 * document, Download PDF on a quote; a hidden action's key is not registered. Audit
 * history (`historyItem`) is the last More row at every width, so a wide bar shows More
 * holding it alone, and a reader with no action still gets the bar. It reads the chrome
 * (test ids, shortcut group, lifecycle), so a payment's read view draws it too.
 */
export function DocumentReadActions({
    actions,
    historyItem,
    isPhone,
    isBusy,
    hasPdf = false,
    scopeOwner,
}: DocumentReadActionsProps) {
    const doc = useDocumentChrome()
    const phoneButton = phoneButtonOf(doc.lifecycle, actions)
    const inBar = isPhone ? (phoneButton ? [phoneButton] : []) : actions
    const inMore = isPhone ? actions.filter(item => item !== phoneButton) : []
    useMoreKeys(doc, inMore, scopeOwner)
    usePdfKeyWhileBusy(doc, hasPdf, actions, scopeOwner)
    if (actions.length === 0 && historyItem === null) return null
    const historyRows = historyItem ? [historyItem] : []
    const moreItems: DocumentMoreItem[] = [...inMore, ...historyRows]
    const buttons = inBar.map((item, index) => (
        <ReadButton key={item.id} item={item} isPrimary={index === 0} scopeOwner={scopeOwner} />
    ))
    const barId = `${doc.testId}-read-actions`
    const moreId = `${doc.testId}-read-more`
    return (
        <View testID={barId} className={BAR}>
            <DocumentMoreMenu items={moreItems} isDisabled={isBusy} testID={moreId} />
            {buttons}
        </View>
    )
}
