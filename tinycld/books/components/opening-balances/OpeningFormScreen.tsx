import { railWidth } from '@tinycld/core/components/workspace/rail-width'
import { useWindowHeight, useWindowWidth } from '@tinycld/core/components/workspace/useBreakpoint'
import type { ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { useOpeningBalancesForm } from '../../hooks/useOpeningBalancesForm'
import type { OpeningScreen } from '../../hooks/useOpeningBalancesScreen'
import { OpeningAccountTable, TABLE_MIN_WIDTH } from './OpeningAccountTable'
import { OpeningDateFields } from './OpeningDateFields'
import { OpeningPreview } from './OpeningPreview'
import { OpeningPreviewDisclosure } from './OpeningPreviewDisclosure'
import { OpeningTotals } from './OpeningTotals'

const PREVIEW_RAIL_WIDTH = 360
// WorkspaceLayout docks a 260 sidebar on desktop (its SIDEBAR_WIDTH_DESKTOP is not
// exported) and PackageRail takes railWidth(0) beside it. Both eat window width, so
// the content area is narrower than the window by this much.
const APP_CHROME_WIDTH = 260 + railWidth(0)
// Below this window width the table and the rail do not fit side by side.
const RAIL_MIN_WIDTH = TABLE_MIN_WIDTH + PREVIEW_RAIL_WIDTH + APP_CHROME_WIDTH
const WIDE_MIN_WIDTH = 768
// On a window this short (landscape phone, phone with the keyboard open) a fixed
// date block would leave the grid almost no room, so it scrolls with the grid.
const SHORT_WINDOW_HEIGHT = 600

type Model = ReturnType<typeof useOpeningBalancesForm>

interface BodyProps {
    model: Model
    currency: string
    isWide: boolean
    hasRail: boolean
    leading: ReactNode
}

function RailBody({ model, currency, leading }: BodyProps) {
    return (
        <View testID="opening-body" className="min-h-0 flex-1 flex-row">
            <View testID="opening-grid" className="min-h-0 min-w-0 flex-1">
                <OpeningAccountTable model={model} currency={currency} isWide leading={leading} />
            </View>
            <View
                testID="opening-preview"
                className="w-[360px] shrink-0 grow-0 border-l border-border bg-surface-secondary"
            >
                <ScrollView>
                    <OpeningPreview
                        preview={model.preview}
                        date={model.date}
                        currency={currency}
                        isBlocked={model.isBlocked}
                        problemMessage={model.blockMessage}
                    />
                </ScrollView>
            </View>
        </View>
    )
}

// The grid and the open preview are siblings, each with its own scroller, so no
// vertical scroller nests inside another. Opening the preview shrinks the grid.
function DisclosureBody({ model, currency, isWide, leading }: BodyProps) {
    return (
        <View testID="opening-body" className="min-h-0 flex-1 overflow-hidden">
            <View testID="opening-grid" className="min-h-0 flex-1 overflow-hidden">
                <OpeningAccountTable
                    model={model}
                    currency={currency}
                    isWide={isWide}
                    leading={leading}
                />
            </View>
            <OpeningPreviewDisclosure
                title="Preview"
                testID="opening-preview"
                toggleTestID="opening-preview-toggle"
            >
                <OpeningPreview
                    preview={model.preview}
                    date={model.date}
                    currency={currency}
                    isBlocked={model.isBlocked}
                    problemMessage={model.blockMessage}
                />
            </OpeningPreviewDisclosure>
        </View>
    )
}

function Body(props: BodyProps) {
    if (props.hasRail) return <RailBody {...props} />
    return <DisclosureBody {...props} />
}

function DateBlock({ model, isVisible }: { model: Model; isVisible: boolean }) {
    if (!isVisible) return null
    return <OpeningDateFields model={model} />
}

// Mounted with key={screen.formKey}, after the data has loaded, so the form's
// defaults are final on the first render.
export function OpeningFormScreen({ screen }: { screen: OpeningScreen }) {
    const model = useOpeningBalancesForm(screen)
    const width = useWindowWidth()
    const isShort = useWindowHeight() < SHORT_WINDOW_HEIGHT
    const isWide = width >= WIDE_MIN_WIDTH
    const hasRail = width >= RAIL_MIN_WIDTH
    const isDateFixed = isWide && !isShort
    const leading = isDateFixed ? null : <OpeningDateFields model={model} />
    const currency = screen.settings?.currency ?? 'USD'
    return (
        <View className="min-h-0 flex-1">
            <DateBlock model={model} isVisible={isDateFixed} />
            <Body
                model={model}
                currency={currency}
                isWide={isWide}
                hasRail={hasRail}
                leading={leading}
            />
            <OpeningTotals
                build={model.build}
                currency={currency}
                isBlocked={model.isBlocked}
                blockMessage={model.blockMessage}
            />
        </View>
    )
}
