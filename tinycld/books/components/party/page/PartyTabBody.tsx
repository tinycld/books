import type { ReactNode } from 'react'
import type { PartyPageState } from '../../../hooks/usePartyPage'
import type { DetailSurface } from '../../../lib/detail-surface'
import type { PartyTab } from '../../../lib/party-page-tabs'
import type { DocumentPartyKey } from '../../../lib/sales-document-kinds'
import { PartyContactsTab } from './PartyContactsTab'
import { PartyDetailsTab } from './PartyDetailsTab'
import { PartyNotesTab } from './PartyNotesTab'

interface PartyTabBodyProps {
    tab: PartyTab
    party: DocumentPartyKey
    id: string
    page: Pick<PartyPageState, 'canWrite' | 'readOnly' | 'notes' | 'details'>
    // The party's own Transactions tab; mounted only while that tab is selected.
    transactions: ReactNode
    surface: DetailSurface
    rowClassName: string
    gutterClass: string
    testIdPrefix: string
}

/**
 * The selected tab's body of a party page. Only that tab is mounted; the Details and
 * Notes forms it edits live in the page, so a tab switch keeps their edits.
 */
export function PartyTabBody({
    tab,
    party,
    id,
    page,
    transactions,
    surface,
    rowClassName,
    gutterClass,
    testIdPrefix,
}: PartyTabBodyProps) {
    if (tab === 'transactions') return transactions
    if (tab === 'contacts') {
        return (
            <PartyContactsTab
                party={party}
                id={id}
                canWrite={page.canWrite}
                gutterClass={gutterClass}
                testIdPrefix={testIdPrefix}
            />
        )
    }
    if (tab === 'notes') {
        return (
            <PartyNotesTab
                notes={page.notes}
                readOnly={page.readOnly}
                rowClassName={rowClassName}
                testIdPrefix={testIdPrefix}
            />
        )
    }
    return (
        <PartyDetailsTab
            details={page.details}
            surface={surface}
            rowClassName={rowClassName}
            testIdPrefix={testIdPrefix}
        />
    )
}
