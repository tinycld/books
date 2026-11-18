import { useBooksSettings } from '../../hooks/useBooksSettings'
import { PurchaseLinesForm } from './PurchaseLinesForm'
import { SectionCard } from './SectionCard'

/**
 * Settings → Purchases (expense form spec §3.10, vendor credit spec §3.8): the Bills,
 * expenses and vendor credits card with "Purchase lines". Every Books user sees it; only
 * an admin edits it. The settings' loading state and load error with Retry are the
 * shell's (SettingsShell), as for SalesSection.
 */
export function PurchasesSection({ isAdmin }: { isAdmin: boolean }) {
    const { settings } = useBooksSettings()
    if (!settings) return null
    return (
        <SectionCard title="Bills, expenses and vendor credits">
            <PurchaseLinesForm settings={settings} isAdmin={isAdmin} />
        </SectionCard>
    )
}
