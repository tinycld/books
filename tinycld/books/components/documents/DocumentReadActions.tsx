import { type ScopeOwner, type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { useId, useMemo, useRef } from 'react'
import { View } from 'react-native'
import type { DocumentReadItem } from '../../hooks/useDocumentReadActions'
import { DOCUMENT_PDF_KEY, DOCUMENT_READ_ACTION_KEYS } from '../../lib/document-actions'
import type { SalesDocumentKind } from '../../lib/sales-document-kinds'
import { DocumentMoreMenu } from './DocumentActionBar'
import { useDocumentKind } from './document-kind-context'

interface DocumentReadActionsProps {
    actions: DocumentReadItem[]
    isPhone: boolean
    // A void runs: More does not open.
    isBusy: boolean
    scopeOwner: ScopeOwner
}

type KeyKind = Pick<SalesDocumentKind, 'key' | 'shortcutGroup'>

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
    const { doc } = useDocumentKind()
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
    const { key: kindKey, shortcutGroup: group } = kind
    const shortcuts = useMemo<Shortcut[]>(() => {
        const ids = names === '' ? [] : names.split(',')
        const current = (id: string) => itemsRef.current.find(item => item.id === id)
        return ids.map(id => {
            const item = current(id)
            return {
                id: `books.${kindKey}.read.${instance}.${id}`,
                keys: item ? keyOf(item) : '',
                scope: 'compose' as const,
                description: item?.label ?? '',
                group,
                when: () => current(id)?.isDisabled === false,
                run: () => current(id)?.onSelect(),
            }
        })
    }, [instance, names, kindKey, group])
    useRegisterShortcuts(shortcuts, scopeOwner)
}

// ⌘P is always taken while the read view holds the keys, so the browser's Print never
// opens: while Download PDF is busy its own key is idle, and this one takes it and does
// nothing.
function usePdfKeyWhileBusy(kind: KeyKind, items: DocumentReadItem[], scopeOwner: ScopeOwner) {
    const instance = useId()
    const isBusyRef = useRef(false)
    isBusyRef.current = items.some(item => item.action === 'pdf' && item.isDisabled)
    const { key: kindKey, shortcutGroup: group } = kind
    const shortcuts = useMemo<Shortcut[]>(
        () => [
            {
                id: `books.${kindKey}.read.${instance}.pdfBusy`,
                keys: DOCUMENT_PDF_KEY,
                scope: 'compose',
                description: 'Download PDF',
                group,
                when: () => isBusyRef.current,
                run: () => {},
            },
        ],
        [instance, kindKey, group]
    )
    useRegisterShortcuts(shortcuts, scopeOwner)
}

/**
 * The read view's bar. Wide: a ShortcutButton per action (Edit E, Void V, Copy C, View
 * journal entry J, Download PDF ⌘P), the first one primary. Phone: Edit as a button and
 * the rest in a More menu whose rows show their keys. A reader gets View journal entry
 * and Download PDF; a hidden action's key is not registered.
 */
export function DocumentReadActions({
    actions,
    isPhone,
    isBusy,
    scopeOwner,
}: DocumentReadActionsProps) {
    const { doc } = useDocumentKind()
    const edit = actions.find(item => item.id === 'read-edit')
    const inBar = isPhone ? (edit ? [edit] : []) : actions
    const inMore = isPhone ? actions.filter(item => item !== edit) : []
    useMoreKeys(doc, inMore, scopeOwner)
    usePdfKeyWhileBusy(doc, actions, scopeOwner)
    if (actions.length === 0) return null
    const buttons = inBar.map((item, index) => (
        <ReadButton key={item.id} item={item} isPrimary={index === 0} scopeOwner={scopeOwner} />
    ))
    const barId = `${doc.testId}-read-actions`
    const moreId = `${doc.testId}-read-more`
    return (
        <View testID={barId} className={BAR}>
            <DocumentMoreMenu items={inMore} isDisabled={isBusy} testID={moreId} />
            {buttons}
        </View>
    )
}
