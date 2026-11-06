import {
    TAX_MENU_TEST_IDS,
    TAX_MENU_WRITES,
    type TaxMenuItem,
    taxMenuItems,
    taxMenuLabels,
} from '../../lib/tax-menu'
import type { TaxesControls, TaxRowView } from '../../lib/taxes-view'
import { RecordRowMenu } from '../RecordRowMenu'

interface TaxRowMenuProps {
    row: TaxRowView
    controls: TaxesControls
    isWorking: boolean
    onSelect(item: TaxMenuItem): void
}

// A rate's or group's menu. No row on this page is pressable, so a press on the menu
// or an item has no pressable ancestor to reach and needs no stop-propagation boundary.
// Offline the write items wait and Edit, which only opens a dialog, stays.
export function TaxRowMenu({ row, controls, isWorking, onSelect }: TaxRowMenuProps) {
    if (!controls.showMenus) return null
    return (
        <RecordRowMenu
            title={row.name}
            triggerTestId={`tax-menu-${row.id}`}
            triggerLabel={`Actions for ${row.name}`}
            items={taxMenuItems(row, controls.showMenus)}
            labels={taxMenuLabels}
            testIds={TAX_MENU_TEST_IDS}
            writes={TAX_MENU_WRITES}
            isWriting={isWorking || !controls.canPressWrites}
            onSelect={onSelect}
        />
    )
}
