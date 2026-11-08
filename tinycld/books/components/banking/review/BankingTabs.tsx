import { SetupTabs } from '@tinycld/core/components/setup/wizard/SetupTabs'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { ScrollView } from 'react-native'
import { type ReviewTab, reviewTabItems } from '../../../lib/bank-review'

// Column content, so the tab bar's bottom rule spans the panel even when the tabs are
// narrower than it.
const PHONE_TABS_CONTENT = { flexGrow: 1, flexDirection: 'column' } as const
// The bar takes its own height, so the tab body starts right under it. A `grow-0` class
// does not reach the scroll view's own flex on web.
const PHONE_TABS_STYLE = { flexGrow: 0, flexShrink: 0 }

// The account panel's tab bar. Only For review carries a count: every for-review row of
// the connection, whatever a filter shows. A phone is too narrow for the four tabs, so
// there they scroll sideways instead of running off the panel.
export function BankingTabs({
    tab,
    reviewCount,
    onTab,
}: {
    tab: ReviewTab
    reviewCount: number
    onTab: (tab: ReviewTab) => void
}) {
    const isWide = useBreakpoint() !== 'mobile'
    const tabs = reviewTabItems(reviewCount)
    const bar = <SetupTabs testID="bank-tabs" tabs={tabs} value={tab} onChange={onTab} />
    if (isWide) return bar
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={PHONE_TABS_STYLE}
            contentContainerStyle={PHONE_TABS_CONTENT}
        >
            {bar}
        </ScrollView>
    )
}
