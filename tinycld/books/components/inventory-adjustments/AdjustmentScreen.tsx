import { ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useAdjustmentScreen } from '../../hooks/useAdjustmentScreen'
import { useRecordNavigation } from '../../hooks/useRecordNavigation'
import { ADJUSTMENT_CHROME } from '../../lib/adjustment-kind'
import { ADJUSTMENTS_PATH } from '../../lib/adjustment-route'
import { INVENTORY_TEXTS } from '../../lib/inventory-adjust-fixture'
import { LoadErrorPage } from '../documents/DocumentLoadError'
import { LoadingPage } from '../documents/DocumentLoading'
import { DocumentNotice } from '../documents/DocumentNotice'
import { DocumentChromeContext } from '../documents/document-chrome'
import { BackLink } from '../entries/EntryHeader'
import { RecordNotFound } from '../RecordNotFound'
import { AdjustmentReadView } from './AdjustmentReadView'

type AdjustmentScreenData = ReturnType<typeof useAdjustmentScreen>

const TEST_ID = ADJUSTMENT_CHROME.testId

// The screen's root: it opts into pointer events and draws its background, as the deposit
// screen's does.
function ScreenRoot({ children }: { children: ReactNode }) {
    return (
        <View pointerEvents="auto" className="flex-1 bg-background">
            {children}
        </View>
    )
}

// The load error's back link names and opens the Inventory adjustments list, as the read
// view's and the not-found page's do.
function AdjustmentLoadError({ onRetry }: { onRetry(): void }) {
    const { leave } = useRecordNavigation(ADJUSTMENTS_PATH)
    const backLink = (
        <BackLink label="Inventory adjustments" testID={`${TEST_ID}-back`} onPress={leave} />
    )
    return (
        <LoadErrorPage
            message={INVENTORY_TEXTS.loadFailed}
            onRetry={onRetry}
            testID={`${TEST_ID}-load-error`}
            retryTestID={`${TEST_ID}-retry`}
            backLink={backLink}
        />
    )
}

function AdjustmentNotFound() {
    const { leave } = useRecordNavigation(ADJUSTMENTS_PATH)
    return (
        <RecordNotFound
            testIdPrefix={TEST_ID}
            message={INVENTORY_TEXTS.notFound}
            backLabel="Inventory adjustments"
            onLeave={leave}
        />
    )
}

// Until the form exists (checkpoint 4), `form` and `cannot-edit` show the read view too: a
// draft shows its stored lines and the Draft badge. A writer at `…/new` has no record, so
// the page is not found until checkpoint 4 gives `form` its form.
function AdjustmentScreenBody({ screen }: { screen: AdjustmentScreenData }) {
    const { state, record } = screen
    if (state === 'loading') return <LoadingPage testID={`${TEST_ID}-loading`} />
    if (state === 'error') return <AdjustmentLoadError onRetry={screen.retry} />
    if (state === 'no-access') {
        return <DocumentNotice testID={`${TEST_ID}-no-access`} message={INVENTORY_TEXTS.noAccess} />
    }
    // A shown state with no row left (it went away): not found.
    if (state === 'not-found' || !record.adjustment) return <AdjustmentNotFound />
    return (
        <AdjustmentReadView
            adjustment={record.adjustment}
            lines={record.lines}
            hasBins={screen.hasBins}
            sourceNumber={screen.sourceNumber}
        />
    )
}

interface AdjustmentScreenProps {
    // The adjustment's id; undefined at `…/new` (screens/inventory-adjustments/new.tsx).
    id?: string
    replaces?: string
    copy?: string
    product?: string
}

/**
 * The inventory adjustment screen at `books/inventory-adjustments/<id>` (inventory-adjust
 * spec §3.5, §3.13): the shared document chrome reads ADJUSTMENT_CHROME, and the screen's
 * `compose` scope holds its keys. Loading, a failed read with Retry, not found and no
 * access are notices; every stored adjustment is the read view.
 */
export function AdjustmentScreen({ id }: AdjustmentScreenProps) {
    const scopeOwner = useShortcutScope('compose')
    const screen = useAdjustmentScreen(id ?? null)
    return (
        <DocumentChromeContext.Provider value={ADJUSTMENT_CHROME}>
            <ScopeProvider owner={scopeOwner}>
                <ScreenRoot>
                    <AdjustmentScreenBody screen={screen} />
                </ScreenRoot>
            </ScopeProvider>
        </DocumentChromeContext.Provider>
    )
}

/**
 * An adjustment route whose number-key read failed (useDocumentRouteId): the screen's load
 * error with Retry, before the screen has a record id.
 */
export function AdjustmentRouteLoadError({ onRetry }: { onRetry(): void }) {
    return (
        <ScreenRoot>
            <AdjustmentLoadError onRetry={onRetry} />
        </ScreenRoot>
    )
}
