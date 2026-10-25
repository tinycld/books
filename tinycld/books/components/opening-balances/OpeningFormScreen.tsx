import { railWidth } from '@tinycld/core/components/workspace/rail-width'
import { useWindowHeight, useWindowWidth } from '@tinycld/core/components/workspace/useBreakpoint'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ConfirmDialog } from '@tinycld/core/ui/ConfirmDialog'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { ArrowLeft } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useOpeningBalancesForm } from '../../hooks/useOpeningBalancesForm'
import type { OpeningScreen } from '../../hooks/useOpeningBalancesScreen'
import { DiscardDraftDialog } from './DiscardDraftDialog'
import { OpeningAccountTable, TABLE_MIN_WIDTH } from './OpeningAccountTable'
import { OpeningActionBar } from './OpeningActionBar'
import { OpeningDateFields } from './OpeningDateFields'
import { OpeningPreview } from './OpeningPreview'
import { OpeningPreviewDisclosure } from './OpeningPreviewDisclosure'
import { OpeningTotals } from './OpeningTotals'
import { isWideWindow } from './opening-grid-style'

const PREVIEW_RAIL_WIDTH = 360
// WorkspaceLayout docks a 260 sidebar on desktop (its SIDEBAR_WIDTH_DESKTOP is not
// exported) and PackageRail takes railWidth(0) beside it. Both eat window width, so
// the content area is narrower than the window by this much.
const APP_CHROME_WIDTH = 260 + railWidth(0)
// Below this window width the table and the rail do not fit side by side.
const RAIL_MIN_WIDTH = TABLE_MIN_WIDTH + PREVIEW_RAIL_WIDTH + APP_CHROME_WIDTH
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

function Notice({ model, isVisible }: { model: Model; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View
            testID="opening-notice"
            className="border-b border-border bg-surface-secondary px-4 py-2"
        >
            <Text className="text-sm text-foreground">{model.noticeText}</Text>
        </View>
    )
}

function BackToPosted({ model, isVisible }: { model: Model; isVisible: boolean }) {
    const color = useThemeColor('muted-foreground')
    if (!isVisible) return null
    const isBusy = model.isSaving || model.isPosting
    return (
        <View className="px-4">
            <Pressable
                testID="opening-edit-back"
                accessibilityRole="button"
                onPress={model.backToPosted}
                disabled={isBusy}
                accessibilityState={{ disabled: isBusy }}
                className="flex-row items-center gap-1 self-start"
                style={{ minHeight: 44 }}
            >
                <ArrowLeft size={16} color={color} />
                <Text className="text-sm text-muted-foreground">Back to posted balances</Text>
            </Pressable>
        </View>
    )
}

function Summary({ model, isVisible }: { model: Model; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className="px-4 pt-3">
            <FormErrorSummary
                errors={model.summaryErrors}
                testID="opening-error-summary"
                isEnabled
                showFieldNames={false}
            />
        </View>
    )
}

// Mounted with key={screen.formKey}, after the data has loaded, so the form's
// defaults are final on the first render.
export function OpeningFormScreen({ screen }: { screen: OpeningScreen }) {
    const model = useOpeningBalancesForm(screen)
    const width = useWindowWidth()
    const isShort = useWindowHeight() < SHORT_WINDOW_HEIGHT
    const isWide = isWideWindow(width)
    const hasRail = width >= RAIL_MIN_WIDTH
    const isDateFixed = isWide && !isShort
    const hasNotice = model.noticeText !== ''
    // Where the date block scrolls with the grid, the Back row and the notice scroll
    // with it, so the cards are on screen when the form opens.
    const leading = isDateFixed ? null : (
        <View>
            <BackToPosted model={model} isVisible={model.isReplacing} />
            <Notice model={model} isVisible={hasNotice} />
            <OpeningDateFields model={model} />
        </View>
    )
    const isStale = screen.hasLateError || screen.isRefreshing
    const currency = screen.settings?.currency ?? 'USD'
    return (
        <View ref={model.rootRef} className="min-h-0 flex-1">
            <BackToPosted model={model} isVisible={isDateFixed && model.isReplacing} />
            <Notice model={model} isVisible={isDateFixed && hasNotice} />
            <Summary model={model} isVisible={model.hasSummaryErrors} />
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
            <OpeningActionBar
                isWide={isWide}
                hasDraft={model.hasDraft}
                isSaving={model.isSaving}
                isPosting={model.isPosting}
                isBlocked={model.isBlocked || isStale}
                hasAmounts={model.hasAmounts}
                onCancel={model.cancel}
                onSave={model.save}
                onPost={model.post}
                onDiscard={model.openDiscard}
            />
            <ConfirmDialog
                isOpen={model.isCancelConfirmOpen}
                onClose={model.closeCancelConfirm}
                onConfirm={model.confirmCancel}
                title="Discard changes?"
                message="Your unsaved changes are lost."
                confirmLabel="Discard changes"
                isDestructive
                requiresServer={false}
            />
            <DiscardDraftDialog
                isOpen={model.isDiscardOpen}
                isDiscarding={model.isDiscarding}
                onClose={model.closeDiscard}
                onConfirm={model.discard}
            />
        </View>
    )
}
