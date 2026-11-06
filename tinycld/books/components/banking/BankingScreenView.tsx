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

function BankingContent({ model, upload }: { model: BankingScreenModel; upload: BankFileUpload }) {
    if (model.state === 'intro') {
        return <BankingIntro canWrite={model.canWrite} onConnect={model.onConnect} />
    }
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
            />
        </>
    )
}

export function BankingScreenView({ model }: { model: BankingScreenModel }) {
    const fabClearanceStyle = useFabClearanceStyle()
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
            <ScrollView
                testID="banking-screen"
                className="flex-1 bg-background"
                contentContainerStyle={fabClearanceStyle}
            >
                <View className={`gap-4 ${padding}`}>
                    <BankingHeader
                        canConnect={canConnect}
                        isWide={model.isWide}
                        onConnect={model.onConnect}
                    />
                    <BankingContent model={model} upload={upload} />
                </View>
            </ScrollView>
            <BankingDialogs model={model} />
        </>
    )
}
