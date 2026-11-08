import { DropZone } from '@tinycld/core/components/DropZone'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { Upload } from 'lucide-react-native'
import { ActivityIndicator, Platform, Text, View } from 'react-native'
import type { BankFileUpload } from '../../hooks/useBankFileUpload'
import type { UploadState } from '../../stores/banking-ui-store'

// Only the web has a drop; native offers the document picker alone.
const PROMPT =
    Platform.OS === 'web'
        ? 'Drag the file you exported from your bank here, or choose it'
        : 'Choose the file you exported from your bank'

function DropPrompt({ state }: { state: UploadState }) {
    const color = useThemeColor('muted-foreground')
    if (state.kind === 'uploading') {
        const busyText = `Uploading ${state.name}…`
        return (
            <View testID="bank-upload-busy" className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color={color} />
                <Text className="text-base font-medium text-foreground">{busyText}</Text>
            </View>
        )
    }
    return <Text className="text-center text-base font-medium text-foreground">{PROMPT}</Text>
}

function UploadDone({
    name,
    fileId,
    isWriteBlocked,
}: {
    name: string
    fileId: string
    isWriteBlocked: boolean
}) {
    const orgHref = useOrgHref()
    const doneText = `${name} uploaded.`
    const openImport = () => router.push(orgHref(`books/banking/import/${fileId}`))
    return (
        <View className="flex-row flex-wrap items-center gap-2">
            <Text testID="bank-upload-done" className="text-sm text-success">
                {doneText}
            </Text>
            <Button
                testID="bank-upload-import"
                size="sm"
                style={{ minHeight: 36 }}
                isDisabled={isWriteBlocked}
                onPress={openImport}
            >
                <ButtonText>Import transactions</ButtonText>
            </Button>
        </View>
    )
}

function UploadStatus({ state, isWriteBlocked }: { state: UploadState; isWriteBlocked: boolean }) {
    if (state.kind === 'done') {
        return (
            <UploadDone name={state.name} fileId={state.fileId} isWriteBlocked={isWriteBlocked} />
        )
    }
    if (state.kind === 'error') {
        return (
            <Text
                testID="bank-upload-error"
                accessibilityRole="alert"
                className="text-sm text-danger"
            >
                {state.message}
            </Text>
        )
    }
    return null
}

// The caller owns the upload hook, so the button here and the page's keys share one
// upload state. On native DropZone renders its children in a plain view.
export function BankFileDrop({ upload }: { upload: BankFileUpload }) {
    const muted = useThemeColor('muted-foreground')
    const { state, pick, drop, isBusy, isWriteBlocked } = upload
    const isUnavailable = isBusy || isWriteBlocked
    return (
        <View className="gap-2">
            <DropZone
                testID="bank-file-drop"
                isEnabled={!isUnavailable}
                label="Drop the bank file here"
                onDrop={drop}
            >
                <View className="items-center gap-3 rounded-xl border border-dashed border-border p-8">
                    <Upload size={28} color={muted} />
                    <DropPrompt state={state} />
                    <Button
                        testID="bank-choose-file"
                        className="min-h-11"
                        isDisabled={isUnavailable}
                        onPress={pick}
                    >
                        <ButtonText>Choose file</ButtonText>
                    </Button>
                    <Text className="text-center text-sm text-muted-foreground">
                        One CSV, OFX, QFX or QBO file at a time, up to 5 MB.
                    </Text>
                </View>
            </DropZone>
            <UploadStatus state={state} isWriteBlocked={isWriteBlocked} />
        </View>
    )
}
