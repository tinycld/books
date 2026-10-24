import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { useAccountImport } from '../../../hooks/useAccountImport'
import { useBackToAccounts } from '../../../hooks/useBackToAccounts'
import { ImportSteps } from './ImportSteps'
import { ImportSummary } from './ImportSummary'
import { MapStep } from './MapStep'
import { PreviewStep } from './PreviewStep'
import { UploadStep } from './UploadStep'

type Flow = ReturnType<typeof useAccountImport>

interface ImportViewProps {
    canWrite: boolean
    isReady: boolean
    // Present only when the existing accounts could not be loaded.
    loadError?: { retry: () => void }
    flow: Flow
}

function BackLink() {
    const orgHref = useOrgHref()
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            accessibilityRole="link"
            onPress={() => router.push(orgHref('books/lists'))}
            className="flex-row items-center gap-1 self-start"
            style={{ minHeight: 44 }}
        >
            <ArrowLeft size={14} color={color} />
            <Text className="text-sm text-muted-foreground">All lists</Text>
        </Pressable>
    )
}

interface StepsProps {
    flow: Flow
    isWide: boolean
    onCancel: () => void
}

function StepBody({ flow, isWide, onCancel }: StepsProps) {
    if (flow.step === 1) {
        return (
            <UploadStep
                fileError={flow.fileError}
                chooseFile={flow.chooseFile}
                onCancel={onCancel}
            />
        )
    }
    if (flow.step === 2) {
        return (
            <MapStep
                header={flow.header}
                columnMap={flow.columnMap}
                setColumn={flow.setColumn}
                errors={flow.mapForm.formState.errors}
                onBack={flow.reset}
                onNext={flow.goToPreview}
            />
        )
    }
    if (flow.step === 3) {
        return (
            <PreviewStep
                isWide={isWide}
                isRunning={flow.isRunning}
                preview={flow.preview}
                readyCount={flow.readyCount}
                progress={flow.progress}
                failure={flow.failure}
                onBack={flow.goToMap}
                onRun={flow.runImport}
            />
        )
    }
    return <ImportSummary result={flow.result} />
}

function NoAccess({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View accessibilityRole="alert" className="items-center p-8">
            <Text className="text-base text-foreground">You need bookkeeper access</Text>
        </View>
    )
}

function LoadError({ loadError }: { loadError: ImportViewProps['loadError'] }) {
    if (!loadError) return null
    return (
        <View
            testID="account-import-error"
            accessibilityRole="alert"
            className="items-center gap-3 p-6"
        >
            <Text className="text-sm text-foreground">Could not load accounts</Text>
            <Button
                testID="account-import-retry"
                size="sm"
                variant="outline"
                className="min-h-11"
                onPress={loadError.retry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function Loading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <LoadingState />
}

function Steps({ isVisible, ...props }: StepsProps & { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className="gap-4">
            <ImportSteps step={props.flow.step} />
            <StepBody {...props} />
        </View>
    )
}

export function ImportView({ canWrite, isReady, loadError, flow }: ImportViewProps) {
    const isWide = useBreakpoint() !== 'mobile'
    const cancel = useBackToAccounts()
    return (
        <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4">
            <BackLink />
            <Text className="text-2xl font-semibold text-foreground">Import accounts</Text>
            <Loading isVisible={!isReady} />
            <NoAccess isVisible={isReady && !canWrite} />
            <LoadError loadError={loadError} />
            <Steps
                isVisible={isReady && canWrite && !loadError}
                flow={flow}
                isWide={isWide}
                onCancel={cancel}
            />
        </ScrollView>
    )
}
