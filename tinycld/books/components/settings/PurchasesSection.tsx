import { useBooksSettings } from '../../hooks/useBooksSettings'
import { BillLinesForm } from './BillLinesForm'
import { SectionCard } from './SectionCard'

/**
 * Settings → Purchases (bill form spec §3.11): the Bills card with "Bill lines". Every
 * Books user sees it; only an admin edits it. The settings' loading state and load error
 * with Retry are the shell's (SettingsShell), as for SalesSection.
 */
export function PurchasesSection({ isAdmin }: { isAdmin: boolean }) {
    const { settings } = useBooksSettings()
    if (!settings) return null
    return (
        <SectionCard title="Bills">
            <BillLinesForm settings={settings} isAdmin={isAdmin} />
        </SectionCard>
    )
}
