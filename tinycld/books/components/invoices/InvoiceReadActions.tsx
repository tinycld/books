import { type ScopeOwner, type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { useId, useMemo, useRef } from 'react'
import { View } from 'react-native'
import type { InvoiceReadItem } from '../../hooks/useInvoiceReadActions'
import { INVOICE_SHORTCUT_GROUP } from '../../hooks/useInvoiceShortcuts'
import { INVOICE_READ_KEYS } from '../../lib/invoice-actions'
import { InvoiceMoreMenu } from './InvoiceActionBar'

interface InvoiceReadActionsProps {
    actions: InvoiceReadItem[]
    isPhone: boolean
    // A void runs: More does not open.
    isBusy: boolean
    scopeOwner: ScopeOwner
}

const BAR =
    'flex-row flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-4 py-2'

function keyOf(item: InvoiceReadItem): string {
    return INVOICE_READ_KEYS[item.action]
}

function shortcutOf(item: InvoiceReadItem) {
    return { keys: keyOf(item), scope: 'compose', group: INVOICE_SHORTCUT_GROUP } as const
}

function ReadButton({
    item,
    isPrimary,
    scopeOwner,
}: {
    item: InvoiceReadItem
    isPrimary: boolean
    scopeOwner: ScopeOwner
}) {
    const variant = isPrimary ? 'default' : 'outline'
    return (
        <ShortcutButton
            label={item.label}
            shortcut={shortcutOf(item)}
            onPress={item.onSelect}
            variant={variant}
            isDisabled={item.isDisabled}
            testID={`invoice-${item.id}`}
            scopeOwner={scopeOwner}
        />
    )
}

// The keys of the rows a phone puts in More: the rows have no ShortcutButton, so the keys
// are registered here and do what the rows do. A key is registered only for a row that is
// offered (core's ⇧? list does not read `when`); `when` reads the row's state at press
// time, so a key does nothing while its row is disabled.
function useMoreKeys(items: InvoiceReadItem[], scopeOwner: ScopeOwner) {
    const instance = useId()
    const itemsRef = useRef(items)
    itemsRef.current = items
    const names = items.map(item => item.id).join(',')
    const shortcuts = useMemo<Shortcut[]>(() => {
        const ids = names === '' ? [] : names.split(',')
        const current = (id: string) => itemsRef.current.find(item => item.id === id)
        return ids.map(id => {
            const item = current(id)
            return {
                id: `books.invoice.read.${instance}.${id}`,
                keys: item ? keyOf(item) : '',
                scope: 'compose' as const,
                description: item?.label ?? '',
                group: INVOICE_SHORTCUT_GROUP,
                when: () => current(id)?.isDisabled === false,
                run: () => current(id)?.onSelect(),
            }
        })
    }, [instance, names])
    useRegisterShortcuts(shortcuts, scopeOwner)
}

/**
 * The read view's bar. Wide: a ShortcutButton per action (Edit E, Void V, Copy C, View
 * journal entry J), the first one primary. Phone: Edit as a button and the rest in a More
 * menu whose rows show their keys. A reader gets only View journal entry; a hidden
 * action's key is not registered.
 */
export function InvoiceReadActions({
    actions,
    isPhone,
    isBusy,
    scopeOwner,
}: InvoiceReadActionsProps) {
    const edit = actions.find(item => item.id === 'read-edit')
    const inBar = isPhone ? (edit ? [edit] : []) : actions
    const inMore = isPhone ? actions.filter(item => item !== edit) : []
    useMoreKeys(inMore, scopeOwner)
    if (actions.length === 0) return null
    const buttons = inBar.map((item, index) => (
        <ReadButton key={item.id} item={item} isPrimary={index === 0} scopeOwner={scopeOwner} />
    ))
    return (
        <View testID="invoice-read-actions" className={BAR}>
            <InvoiceMoreMenu items={inMore} isDisabled={isBusy} testID="invoice-read-more" />
            {buttons}
        </View>
    )
}
