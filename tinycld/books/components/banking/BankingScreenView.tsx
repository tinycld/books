import { ScrollView, View } from 'react-native'
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

// A fixed column: the header, the strip, the panel heading and the tab bar stay put, and the
// tab's body fills the rest of the height and scrolls its own content, so a long list can
// window. The transaction drawer sits beside the whole column, as the register's
// EntryDrawer sits beside its screen: inline at full height on a wide window (the column
// narrows), an overlay or a sheet otherwise.
export function BankingScreenView({ model }: { model: BankingScreenModel }) {
    // One upload for the selected connection, shared by the upload area and the page keys.
    const upload = useBankFileUpload(model.selected?.id ?? '')
    useBankingShortcuts({ model, upload })
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
                    <BankingContent model={model} upload={upload} />
                </View>
                <BankTxnDrawer drawer={model.drawer} currency={model.currency} />
            </View>
            <BankingDialogs model={model} />
        </>
    )
}
