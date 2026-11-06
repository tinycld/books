import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ChevronLeft } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type {
    BankImportData,
    BankImportHeader,
    BankImportModel,
} from '../../../hooks/useBankImport'
import { useBankImportFlow } from '../../../hooks/useBankImportFlow'
import { bankImportStepLabels, chooseStepNumber } from '../../../lib/bank-import-view'
import { useFabClearanceStyle } from '../../../lib/fab-clearance'
import { ImportSteps } from '../../ImportSteps'
import { FormatChip } from '../BankFileList'
import { BankImportMessage, BankImportToBanking } from './BankImportMessage'
import { ChooseStep } from './ChooseStep'
import { ImportResult } from './ImportResult'
import { MapColumnsStep } from './MapColumnsStep'

// While an import runs the back link is disabled, like Back and Cancel.
function PageHeader({ onBack, isBusy }: { onBack: () => void; isBusy: boolean }) {
    const color = useThemeColor('muted-foreground')
    const linkClass = `flex-row items-center gap-1 self-start ${isBusy ? 'opacity-50' : ''}`
    const accessibilityState = { disabled: isBusy }
    return (
        <>
            <Pressable
                testID="bank-import-banking-link"
                accessibilityRole="link"
                accessibilityState={accessibilityState}
                disabled={isBusy}
                onPress={onBack}
                className={linkClass}
                style={{ minHeight: 44 }}
            >
                <ChevronLeft size={16} color={color} />
                <Text className="text-sm text-muted-foreground">Banking</Text>
            </Pressable>
            <Text className="text-2xl font-semibold text-foreground">Import bank transactions</Text>
        </>
    )
}

function DetailsText({ text }: { text: string }) {
    if (!text) return null
    return <Text className="text-sm text-muted-foreground">{text}</Text>
}

function FileLines({ header }: { header: BankImportHeader | null }) {
    if (!header) return null
    const fileText = `File: ${header.fileName}`
    const intoText = `Into: ${header.accountLabel}`
    return (
        <View className="gap-1">
            <View testID="bank-import-file" className="flex-row flex-wrap items-center gap-2">
                <Text className="text-sm text-foreground" numberOfLines={1}>
                    {fileText}
                </Text>
                <FormatChip format={header.format} />
            </View>
            <View testID="bank-import-into" className="flex-row flex-wrap items-center gap-x-2">
                <Text className="text-sm font-medium text-foreground">{intoText}</Text>
                <DetailsText text={header.details} />
            </View>
        </View>
    )
}

function ResultOrLoading({ flow }: { flow: ReturnType<typeof useBankImportFlow> }) {
    if (!flow.result) {
        return (
            <View testID="bank-import-loading">
                <LoadingState />
            </View>
        )
    }
    return <ImportResult result={flow.result} onBack={flow.onCancel} onMore={flow.onImportMore} />
}

function StepBody({
    flow,
    data,
    isWide,
}: {
    flow: ReturnType<typeof useBankImportFlow>
    data: BankImportData
    isWide: boolean
}) {
    if (flow.step === 'map') return <MapColumnsStep onCancel={flow.onCancel} />
    if (flow.step === 'result') return <ResultOrLoading flow={flow} />
    return <ChooseStep flow={flow} format={data.format} isWide={isWide} />
}

// Mounted only with loaded data, so the flow's form starts from it. It draws the page
// header too, so the back link can read whether the import runs.
function BankImportFlowView({ model, data }: { model: BankImportModel; data: BankImportData }) {
    const flow = useBankImportFlow(data)
    const steps = bankImportStepLabels(data.format)
    const current = flow.step === 'map' ? 2 : chooseStepNumber(data.format)
    // The result replaces the steps.
    const hasSteps = flow.step !== 'result'
    return (
        <>
            <PageHeader onBack={model.backToBanking} isBusy={flow.isBusy} />
            <FileLines header={model.header} />
            <View className="gap-4">
                <ImportSteps
                    testID="bank-import-steps"
                    steps={steps}
                    current={current}
                    isVisible={hasSteps}
                />
                <StepBody flow={flow} data={data} isWide={model.isWide} />
            </View>
        </>
    )
}

// Every state but the ready one: nothing runs, so the back link is always enabled.
function PageMessage({ model }: { model: BankImportModel }) {
    return (
        <>
            <PageHeader onBack={model.backToBanking} isBusy={false} />
            <PageMessageBody model={model} />
        </>
    )
}

function PageMessageBody({ model }: { model: BankImportModel }) {
    const { state, header, backToBanking } = model
    if (state === 'loading') {
        return (
            <View testID="bank-import-loading">
                <LoadingState />
            </View>
        )
    }
    if (state === 'error') {
        return (
            <BankImportMessage
                testID="bank-import-load-error"
                tone="danger"
                text="Books could not load this bank file."
            >
                <Button
                    testID="bank-import-retry"
                    variant="outline"
                    className="min-h-11"
                    onPress={model.onRetry}
                >
                    <ButtonText>Retry</ButtonText>
                </Button>
            </BankImportMessage>
        )
    }
    if (state === 'readOnly') {
        return (
            <BankImportMessage
                testID="bank-import-read-only"
                text="You need bookkeeper access to import bank transactions."
            >
                <BankImportToBanking onPress={backToBanking} />
            </BankImportMessage>
        )
    }
    if (state === 'notFound') {
        return (
            <BankImportMessage
                testID="bank-import-not-found"
                text="This bank file is not in Books. It may have been removed."
            >
                <BankImportToBanking onPress={backToBanking} />
            </BankImportMessage>
        )
    }
    return (
        <>
            <FileLines header={header} />
            <BankImportMessage
                testID="bank-import-unreadable"
                tone="danger"
                text="Books could not read the rows of this file. Remove it and upload it again."
            >
                <BankImportToBanking onPress={backToBanking} />
            </BankImportMessage>
        </>
    )
}

function PageBody({ model }: { model: BankImportModel }) {
    if (model.state !== 'ready' || !model.data) return <PageMessage model={model} />
    return <BankImportFlowView model={model} data={model.data} />
}

export function BankImportView({ model }: { model: BankImportModel }) {
    const clearance = useFabClearanceStyle()
    const padding = model.isWide ? 'p-6' : 'p-4'
    return (
        <ScrollView
            testID="bank-import-screen"
            className="flex-1 bg-background"
            contentContainerClassName={`gap-4 ${padding}`}
            contentContainerStyle={clearance}
        >
            <PageBody model={model} />
        </ScrollView>
    )
}
