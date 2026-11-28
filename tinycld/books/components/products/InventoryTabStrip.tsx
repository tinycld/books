import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import {
    type InventoryTabKey,
    inventoryTabPath,
    SHOWN_INVENTORY_TABS,
} from '../../lib/inventory-tabs'
import { ListTabs } from '../ListTabs'

/**
 * The tabs of Products and services (inventory-adjust spec §2, Q2): each tab is its own
 * list route, so a press replaces the route (as the sales and purchase list tabs do), and
 * Back from the tab leaves to the Lists hub, not to the tab before.
 */
export function InventoryTabStrip({ selected }: { selected: InventoryTabKey }) {
    const orgHref = useOrgHref()
    const onSelect = (key: string) => {
        const path = inventoryTabPath(key)
        if (path === undefined || key === selected) return
        router.replace(orgHref(path))
    }
    return (
        <ListTabs
            tabs={SHOWN_INVENTORY_TABS}
            selected={selected}
            testIdPrefix="products-tab"
            onSelect={onSelect}
        />
    )
}
