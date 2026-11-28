import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { type ScopeOwner, ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { type ReactNode, useRef, useState } from 'react'
import { View } from 'react-native'
import { useActiveBins } from '../../hooks/useActiveBins'
import {
    type AdjustmentLineStock,
    useAdjustmentLineStock,
} from '../../hooks/useAdjustmentLineStock'
import { useAdjustmentScreen } from '../../hooks/useAdjustmentScreen'
import { type FormAccount, useFormAccounts } from '../../hooks/useFormAccounts'
import { useRecordNavigation } from '../../hooks/useRecordNavigation'
import { chartControlAccount } from '../../lib/adjustment-accounts'
import { ADJUSTMENT_CHROME } from '../../lib/adjustment-kind'
import { ADJUSTMENTS_PATH } from '../../lib/adjustment-route'
import {
    type AdjustmentValues,
    adjustmentValuesFrom,
    emptyAdjustmentLine,
} from '../../lib/adjustment-values'
import { INVENTORY_TEXTS } from '../../lib/inventory-adjust-fixture'
import { todayIso } from '../../lib/register-range'
import {
    type AdjustmentRefusedSave,
    refusedAdjustmentSaveOf,
} from '../../stores/adjustment-save-store'
import { LoadErrorPage } from '../documents/DocumentLoadError'
import { LoadingPage } from '../documents/DocumentLoading'
import { DocumentNotice } from '../documents/DocumentNotice'
import { DocumentChromeContext } from '../documents/document-chrome'
import { BackLink } from '../entries/EntryHeader'
import { RecordNotFound } from '../RecordNotFound'
import { AdjustmentForm } from './AdjustmentForm'
import { AdjustmentReadView } from './AdjustmentReadView'

type AdjustmentScreenData = ReturnType<typeof useAdjustmentScreen>

const TEST_ID = ADJUSTMENT_CHROME.testId
const LOG_CONTEXT = 'books.inventory-adjustment'

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

// The values a form mounts with: a draft's (New quantity from the On hand now), or a new
// adjustment's: today, the chart's Inventory shrinkage, and one line of `?product`'s
// Inventory item (with its default bin while that bin is active) or 2 empty lines.
function startValuesOf(input: {
    record: AdjustmentScreenData['record']
    product: string
    stock: AdjustmentLineStock
    accounts: readonly FormAccount[]
    isActiveBin: (id: string) => boolean
    hasBins: boolean
}): AdjustmentValues {
    const { record, stock } = input
    if (record.adjustment) {
        return adjustmentValuesFrom(record.adjustment, record.lines, stock.onHandOf)
    }
    const item = input.product ? stock.productOf(input.product) : undefined
    const isItem = item !== undefined && item.type === 'inventory' && !item.inactive
    const defaultBin = item?.default_bin ?? ''
    const bin =
        input.hasBins && defaultBin !== '' && input.isActiveBin(defaultBin) ? defaultBin : ''
    const lines = isItem
        ? [{ ...emptyAdjustmentLine(), product: input.product, bin }]
        : [emptyAdjustmentLine(), emptyAdjustmentLine()]
    return {
        date: todayIso(),
        account: chartControlAccount(input.accounts, 'inventory_shrinkage'),
        memo: '',
        lines,
    }
}

/**
 * The form's own first reads: the stock of the items it starts with (a draft's lines, or
 * `?product`), the chart and the active bins. Until they are in, the page loads; a failure
 * before then is the screen's load error with Retry. Once the form has mounted it stays,
 * and a later failure shows in the form with Retry. A draft's stored lines stay live, so
 * the save plans against them.
 */
function AdjustmentFormScreen({
    screen,
    product,
    refused,
    scopeOwner,
}: {
    screen: AdjustmentScreenData
    product: string
    refused: AdjustmentRefusedSave | null
    scopeOwner: ScopeOwner
}) {
    const { record, hasBins } = screen
    const [startIds] = useState(() =>
        record.adjustment ? record.lines.map(line => line.product) : [product]
    )
    const stock = useAdjustmentLineStock(startIds, hasBins)
    const accounts = useFormAccounts()
    const bins = useActiveBins()
    // Set once the first reads are in: a later failure keeps the mounted form (with Retry in
    // it) instead of the load error. A ref, so the latch costs no second render.
    const started = useRef(false)
    const isReady = stock.isReady && accounts.isReady && !bins.isLoading
    const isError = stock.isError || accounts.isError || bins.isError
    if (isReady && !isError) started.current = true
    const hasStarted = started.current
    const retry = () => {
        if (accounts.isError) accounts.retry()
        if (bins.isError) bins.retry()
        void recoverLiveQueries({ ...stock.recovery, onError: err => log.error(LOG_CONTEXT, err) })
    }
    const isActiveBin = (id: string) => bins.bins.some(bin => bin.id === id)
    if (!hasStarted && isError) return <AdjustmentLoadError onRetry={retry} />
    if (!hasStarted) return <LoadingPage testID={`${TEST_ID}-loading`} />
    // A hand-off starts from what the user submitted, not from the stored rows.
    const initial =
        refused?.values ??
        startValuesOf({
            record,
            product,
            stock,
            accounts: accounts.accounts,
            isActiveBin,
            hasBins,
        })
    const storedLines = record.lines.map(line => ({
        id: line.id,
        product: line.product,
        bin: line.bin,
        quantity: line.quantity,
        value: line.value,
        value_given: line.value_given,
        position: line.position,
    }))
    return (
        <AdjustmentForm
            adjustment={record.adjustment}
            storedLines={storedLines}
            initial={initial}
            hasBins={hasBins}
            canWrite={screen.canWrite}
            accounts={accounts.accounts}
            isAccountsError={accounts.isError}
            onRetryAccounts={accounts.retry}
            isActiveBin={isActiveBin}
            refused={refused}
            scopeOwner={scopeOwner}
        />
    )
}

// The no-access notice's back link names and opens the Inventory adjustments list.
function AdjustmentNoAccess() {
    const { leave } = useRecordNavigation(ADJUSTMENTS_PATH)
    const backLink = (
        <BackLink label="Inventory adjustments" testID={`${TEST_ID}-back`} onPress={leave} />
    )
    return (
        <DocumentNotice
            testID={`${TEST_ID}-no-access`}
            message={INVENTORY_TEXTS.noAccess}
            backLink={backLink}
        />
    )
}

// `form` is the form (a new adjustment, a draft, or one a save of this form holds);
// `cannot-edit` (a correction, checkpoint 5) shows the read view until then.
function AdjustmentScreenBody({
    screen,
    product,
    refused,
    scopeOwner,
}: {
    screen: AdjustmentScreenData
    product: string
    refused: AdjustmentRefusedSave | null
    scopeOwner: ScopeOwner
}) {
    const { state, record } = screen
    if (state === 'loading') return <LoadingPage testID={`${TEST_ID}-loading`} />
    if (state === 'error') return <AdjustmentLoadError onRetry={screen.retry} />
    if (state === 'no-access') return <AdjustmentNoAccess />
    if (state === 'form') {
        return (
            <AdjustmentFormScreen
                screen={screen}
                product={product}
                refused={refused}
                scopeOwner={scopeOwner}
            />
        )
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
 * The inventory adjustment screen at `books/inventory-adjustments/<id>` and `…/new`
 * (inventory-adjust spec §3.2 to §3.5, §3.13): the shared document chrome reads
 * ADJUSTMENT_CHROME, and the screen's `compose` scope holds its keys. Loading, a failed
 * read with Retry, not found and no access are notices; a new adjustment and a draft are
 * the form (kept while a save of it holds the adjustment), any other the read view.
 */
export function AdjustmentScreen({ id, product = '' }: AdjustmentScreenProps) {
    const scopeOwner = useShortcutScope('compose')
    const screen = useAdjustmentScreen(id ?? null)
    // A new adjustment's refused save handed to this draft: read once, at the mount.
    const [refused] = useState(() => refusedAdjustmentSaveOf(id ?? null))
    return (
        <DocumentChromeContext.Provider value={ADJUSTMENT_CHROME}>
            <ScopeProvider owner={scopeOwner}>
                <ScreenRoot>
                    <AdjustmentScreenBody
                        screen={screen}
                        product={product}
                        refused={refused}
                        scopeOwner={scopeOwner}
                    />
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
