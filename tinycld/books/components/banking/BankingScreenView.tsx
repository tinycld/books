import { type ScopeOwner, ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useIsFocused } from 'expo-router'
import { ScrollView, View } from 'react-native'
import { useWayShortcuts } from '../../hooks/useBankCategorize'
import { type BankFileUpload, useBankFileUpload } from '../../hooks/useBankFileUpload'
import type { BankingScreenModel } from '../../hooks/useBankingScreen'
import { useBankingShortcuts } from '../../hooks/useBankingShortcuts'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import { BankAccountPanel } from './BankAccountPanel'
import { BankAccountStrip } from './BankAccountStrip'
import { BankingDialogs } from './BankingDialogs'
import { BankingHeader } from './BankingHeader'
import { BankingIntro } from './BankingIntro'
import { BankingLoadError, BankingLoading } from './BankingStates'
import { CategorizeSection } from './categorize/CategorizeSection'
import { TransferSection } from './categorize/TransferSection'
import { TxnWaySwitch } from './categorize/TxnWaySwitch'
import { MatchSection } from './match/MatchSection'
import { BankTxnDrawer } from './review/BankTxnDrawer'

function BankingContent({ model, upload }: { model: BankingScreenModel; upload: BankFileUpload }) {
    if (model.state === 'intro') return null
    const selectedId = model.selected?.id ?? ''
    return (
        <>
            <BankAccountStrip
                rows={model.rows}
                selectedId={selectedId}
                currency={model.currency}
                isWide={model.isWide}
                onSelect={model.onSelect}
            />
            <BankAccountPanel
                row={model.selected}
                files={model.files}
                canWrite={model.canWrite}
                isWide={model.isWide}
                isLoading={model.isPanelLoading}
                isPanelMenuOpen={model.isPanelMenuOpen}
                setPanelMenuOpen={model.setPanelMenuOpen}
                onEditDetails={model.onEditDetails}
                onViewRegister={model.onViewRegister}
                onDisconnect={model.onDisconnect}
                upload={upload}
                tab={model.tab}
                onTab={model.onTab}
                onGoToFiles={model.onGoToFiles}
                currency={model.currency}
                pageRecovery={model.pageRecovery}
                batch={model.batch}
                drawer={model.drawer}
                suggestions={model.suggestions}
                shownRowIds={model.shownRowIds}
            />
        </>
    )
}

// Before the first connection the page is the intro band, which scrolls on its own.
function IntroBody({ model }: { model: BankingScreenModel }) {
    const fabClearanceStyle = useFabClearanceStyle()
    if (model.state !== 'intro') return null
    return (
        <ScrollView className="flex-1" contentContainerStyle={fabClearanceStyle}>
            <BankingIntro canWrite={model.canWrite} onConnect={model.onConnect} />
        </ScrollView>
    )
}

// The open transaction lives in the page store, which every Banking screen reads: an
// earlier Banking screen still stacked under this one (Banking, then Journal Entries, then
// Banking again) would open the same drawer, and register the drawer's keys a second time.
// Only the focused screen draws it.
function PageDrawer({ model, scopeOwner }: { model: BankingScreenModel; scopeOwner: ScopeOwner }) {
    const isFocused = useIsFocused()
    if (!isFocused) return null
    return (
        <BankTxnDrawer
            drawer={model.drawer}
            currency={model.currency}
            onNearEnd={model.match.onNearEnd}
        >
            <DrawerWays model={model} scopeOwner={scopeOwner} />
        </BankTxnDrawer>
    )
}

type WaysProps = { model: BankingScreenModel; scopeOwner: ScopeOwner }

// The section of the shown way: the drawer keys the Categorize and Transfer forms by the
// transaction, so another transaction starts with fresh forms.
function WaySection({ model, scopeOwner }: WaysProps) {
    const { categorize, currency } = model
    if (categorize.way === 'categorize') {
        return (
            <CategorizeSection
                key={categorize.formKey}
                model={categorize}
                scopeOwner={scopeOwner}
            />
        )
    }
    if (categorize.way === 'transfer') {
        return (
            <TransferSection key={categorize.formKey} model={categorize} scopeOwner={scopeOwner} />
        )
    }
    return (
        <MatchSection
            model={model.match}
            scopeOwner={scopeOwner}
            currency={currency}
            isUnderSwitch
        />
    )
}

// A reader sees the Match list when Books has suggestions (or while they load, or after
// their read failed), and nothing when it has none.
function ReaderMatch({ model, scopeOwner }: WaysProps) {
    const { match } = model
    const hasSomething = match.isLoading || match.isError || match.options.length > 0
    if (!hasSomething) return null
    return <MatchSection model={match} scopeOwner={scopeOwner} currency={model.currency} />
}

// Under the drawer's fields: for a writer on a For review transaction, the way switch
// and the section of the shown way (core LoadingState until the suggestions decide the
// default way); for a reader, the Match list only; for a Reviewed or Excluded
// transaction, the Match section as it draws those (Matched to, or nothing).
function DrawerWays({ model, scopeOwner }: WaysProps) {
    const { categorize } = model
    useWayShortcuts(categorize, scopeOwner)
    if (categorize.view === 'reader') return <ReaderMatch model={model} scopeOwner={scopeOwner} />
    if (categorize.view === 'none') {
        return (
            <MatchSection model={model.match} scopeOwner={scopeOwner} currency={model.currency} />
        )
    }
    const section =
        categorize.view === 'switch' ? <WaySection model={model} scopeOwner={scopeOwner} /> : null
    return (
        <>
            <TxnWaySwitch model={categorize} />
            {section}
        </>
    )
}

// A fixed column: the header, the strip, the panel heading and the tab bar stay put, and the
// tab's body fills the rest of the height and scrolls its own content, so a long list can
// window. The transaction drawer sits beside the whole column, as the register's
// EntryDrawer sits beside its screen: inline at full height on a wide window (the column
// narrows), an overlay or a sheet otherwise.
// The page owns one `list` shortcut scope, published to the account panel, where the
// transaction tab keys register against it: a second `useShortcutScope('list')` in a tab
// body would push its own scope on top and turn the page keys (N, U, I) off. The dialogs
// push their own modal scope. Core `Drawer` pushes no scope in any placement, so the
// drawer's keys are in the page's `list` scope too; the drawer renders outside the
// ScopeProvider, so its buttons (Match M, Find other matches F, Undo match Z) get the
// owner as a prop.
export function BankingScreenView({ model }: { model: BankingScreenModel }) {
    const listScope = useShortcutScope('list')
    // One upload for the selected connection, shared by the upload area and the page keys.
    const upload = useBankFileUpload(model.selected?.id ?? '')
    useBankingShortcuts({ model, upload, owner: listScope })
    if (model.state === 'loading') return <BankingLoading />
    if (model.state === 'error') return <BankingLoadError onRetry={model.onRetry} />
    const padding = model.isWide ? 'p-6' : 'p-4'
    // The intro band carries its own Connect button.
    const canConnect = model.canWrite && model.state === 'ready'
    return (
        <>
            <View className="flex-1 flex-row bg-background">
                <View testID="banking-screen" className={`min-h-0 min-w-0 flex-1 gap-4 ${padding}`}>
                    <BankingHeader
                        canConnect={canConnect}
                        isWide={model.isWide}
                        onConnect={model.onConnect}
                    />
                    <IntroBody model={model} />
                    <ScopeProvider owner={listScope}>
                        <BankingContent model={model} upload={upload} />
                    </ScopeProvider>
                </View>
                <PageDrawer model={model} scopeOwner={listScope} />
            </View>
            <BankingDialogs model={model} />
        </>
    )
}
