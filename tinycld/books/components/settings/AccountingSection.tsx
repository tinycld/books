import { Text, View } from 'react-native'
import { useMyCloseOverride } from '../../hooks/useMyCloseOverride'
import { ownOverrideLine } from '../../lib/overrides'
import { formatDay } from '../../lib/register-range'
import { FISCAL_MONTHS } from '../../lib/setup-schema'
import type { BooksSettings } from '../../types'
import { CloseBooksBlock } from './CloseBooksBlock'
import { FiscalYearForm } from './FiscalYearForm'
import { OverridesPanel } from './OverridesPanel'
import { ReadOnlyRow, SectionCard } from './SectionCard'

function OwnOverrideLine({ isVisible }: { isVisible: boolean }) {
    const { override } = useMyCloseOverride()
    if (!isVisible || !override) return null
    return (
        <Text className="text-sm text-foreground" testID="books-settings-own-override">
            {ownOverrideLine(override)}
        </Text>
    )
}

function AccountingReadOnly({ settings }: { settings: BooksSettings }) {
    const month = FISCAL_MONTHS[settings.fiscal_year_start_month - 1] ?? ''
    const closeDate = settings.close_date
    return (
        <View className="gap-4">
            <SectionCard>
                <ReadOnlyRow label="Fiscal year starts in" value={month} />
                <ReadOnlyRow
                    label="Books closed through"
                    value={closeDate ? formatDay(closeDate) : 'No period is closed'}
                />
            </SectionCard>
            <OwnOverrideLine isVisible={closeDate !== ''} />
        </View>
    )
}

function AccountingForms({ settings }: { settings: BooksSettings }) {
    return (
        <View className="gap-4">
            <SectionCard>
                <View className="gap-4">
                    <FiscalYearForm settings={settings} />
                    <CloseBooksBlock settings={settings} />
                </View>
            </SectionCard>
            <OverridesPanel settings={settings} />
        </View>
    )
}

export function AccountingSection({
    settings,
    isAdmin,
}: {
    settings: BooksSettings
    isAdmin: boolean
}) {
    if (!isAdmin) return <AccountingReadOnly settings={settings} />
    return <AccountingForms settings={settings} />
}
