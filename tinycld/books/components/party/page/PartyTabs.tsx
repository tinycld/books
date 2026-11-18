import { type ScopeOwner, useScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useId } from 'react'
import type { PartyTab, PartyTabEntry } from '../../../lib/party-page-tabs'
import { RecordTabs } from '../../RecordTabs'

// The page always renders inside RecordSurface, which publishes its scope; this stands
// in only so the type holds, and registers nothing that fires.
const NO_SURFACE: ScopeOwner = () => null

interface PartyTabsProps {
    // A `shownPartyTabs` result: the party's tabs, in its order.
    tabs: readonly PartyTabEntry[]
    selected: PartyTab
    onSelect: (key: PartyTab) => void
    gutterClass: string
    testIdPrefix: string
    // The group the ⇧? list shows the keys under ("Customer", "Vendor").
    shortcutGroup: string
}

/**
 * A party page's tab strip. ⌥1–⌥4 belong to the surface's `modal` scope, the top scope
 * on the page, so they select a tab from anywhere on it, a text field included. The
 * shortcut ids are per instance: while one record's page replaces another's, both are
 * mounted, and a shared id would let the leaving page unregister the new one's keys.
 */
export function PartyTabs({
    tabs,
    selected,
    onSelect,
    gutterClass,
    testIdPrefix,
    shortcutGroup,
}: PartyTabsProps) {
    const owner = useScopeOwner() ?? NO_SURFACE
    const instance = useId()
    return (
        <RecordTabs
            tabs={tabs}
            selected={selected}
            onSelect={onSelect}
            testIdPrefix={testIdPrefix}
            keysScopeOwner={owner}
            keysScope="modal"
            shortcutIdPrefix={`books.${testIdPrefix}.tabs.${instance}`}
            shortcutGroup={shortcutGroup}
            stripClassName={gutterClass}
        />
    )
}
