import { type ScopeOwner, useScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useId } from 'react'
import { type CustomerTab, SHOWN_CUSTOMER_TABS } from '../../../lib/customer-page-tabs'
import { RecordTabs } from '../../RecordTabs'

// The page always renders inside RecordSurface, which publishes its scope; this stands
// in only so the type holds, and registers nothing that fires.
const NO_SURFACE: ScopeOwner = () => null

interface CustomerTabsProps {
    selected: CustomerTab
    onSelect: (key: CustomerTab) => void
    gutterClass: string
}

/**
 * The customer page's tab strip. ⌥1–⌥4 belong to the surface's `modal` scope, the top
 * scope on the page, so they select a tab from anywhere on it, a text field included.
 * The shortcut ids are per instance: while one customer's page replaces another's, both
 * are mounted, and a shared id would let the leaving page unregister the new one's keys.
 */
export function CustomerTabs({ selected, onSelect, gutterClass }: CustomerTabsProps) {
    const owner = useScopeOwner() ?? NO_SURFACE
    const instance = useId()
    return (
        <RecordTabs
            tabs={SHOWN_CUSTOMER_TABS}
            selected={selected}
            onSelect={onSelect}
            testIdPrefix="customer"
            keysScopeOwner={owner}
            keysScope="modal"
            shortcutIdPrefix={`books.customer.tabs.${instance}`}
            shortcutGroup="Customer"
            stripClassName={gutterClass}
        />
    )
}
