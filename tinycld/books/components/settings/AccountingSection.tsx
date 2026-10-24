import { Text, View } from 'react-native'
import { useBooksSettings } from '../../hooks/useBooksSettings'
import { useMyCloseOverride } from '../../hooks/useMyCloseOverride'
import { ownOverrideLine } from '../../lib/overrides'
import { formatDay } from '../../lib/register-range'
import { FISCAL_MONTHS } from '../../lib/setup-schema'
import type { BooksSettings } from '../../types'
import { CloseBooksBlock } from './CloseBooksBlock'
import { FiscalYearForm } from './FiscalYearForm'
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

function AccountingForms() {
    return (
        <SectionCard>
            <View className="gap-4">
                <FiscalYearForm />
                <CloseBooksBlock />
            </View>
        </SectionCard>
    )
}

export function AccountingSection({ isAdmin }: { isAdmin: boolean }) {
    const { settings } = useBooksSettings()
    if (!settings) return null
    if (!isAdmin) return <AccountingReadOnly settings={settings} />
    return <AccountingForms />
}
