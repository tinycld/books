import type { BooksSettings } from '../../types'
import { PurchaseLinesForm } from './PurchaseLinesForm'
import { SectionCard } from './SectionCard'

/**
 * Settings → Purchases (expense form spec §3.10, vendor credit spec §3.8): the Bills,
 * expenses and vendor credits card with "Purchase lines". Every Books user sees it; only
 * an admin edits it. The settings' loading state and load error with Retry are the
 * panel's (SectionPanel), as for SalesSection.
 */
export function PurchasesSection({
    settings,
    isAdmin,
}: {
    settings: BooksSettings
    isAdmin: boolean
}) {
    return (
        <SectionCard title="Bills, expenses and vendor credits">
            <PurchaseLinesForm settings={settings} isAdmin={isAdmin} />
        </SectionCard>
    )
}
