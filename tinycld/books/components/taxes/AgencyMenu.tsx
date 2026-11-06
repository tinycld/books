import {
    AGENCY_MENU_LABELS,
    AGENCY_MENU_TEST_IDS,
    type AgencyMenuItem,
    agencyMenuItems,
    TAX_MENU_WRITES,
} from '../../lib/tax-menu'
import type { AgencyCardView, TaxesControls } from '../../lib/taxes-view'
import { RecordRowMenu } from '../RecordRowMenu'

interface AgencyMenuProps {
    card: AgencyCardView
    controls: TaxesControls
    isWorking: boolean
    onSelect(item: AgencyMenuItem): void
}

// An agency card's menu. The card is not pressable, so a press on the menu or an item
// has no pressable ancestor to reach and needs no stop-propagation boundary.
export function AgencyMenu({ card, controls, isWorking, onSelect }: AgencyMenuProps) {
    if (!controls.showMenus) return null
    return (
        <RecordRowMenu
            title={card.name}
            triggerTestId={`tax-agency-menu-${card.id}`}
            triggerLabel={`Actions for ${card.name}`}
            items={agencyMenuItems(card, controls.showMenus)}
            labels={AGENCY_MENU_LABELS}
            testIds={AGENCY_MENU_TEST_IDS}
            writes={TAX_MENU_WRITES}
            isWriting={isWorking || !controls.canPressWrites}
            onSelect={onSelect}
        />
    )
}
