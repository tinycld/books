import { DropZone } from '@tinycld/core/components/DropZone'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Copy, Upload } from 'lucide-react-native'
import { Platform, Text, View } from 'react-native'
import { useCopyExample } from '../../../hooks/useCopyExample'
import { useCsvPicker } from '../../../hooks/useCsvPicker'
import { importExampleCsv } from '../../../lib/account-import'
import { csvLimits, parseCsv } from '../../../lib/csv'
import type { CsvSource } from '../../../lib/csv-source'

const EXAMPLE = parseCsv(importExampleCsv)

interface UploadStepProps {
    fileError: string | null
    chooseFile: (file: CsvSource) => Promise<void>
    onCancel: () => void
}

function ErrorText({ message }: { message: string | null }) {
    if (!message) return null
    return (
        <Text accessibilityRole="alert" className="text-sm text-danger">
            {message}
        </Text>
    )
}

interface FileInputProps {
    isVisible: boolean
    picker: ReturnType<typeof useCsvPicker>
}

// The browser needs a real input to open its file dialog; it stays hidden behind the button.
function FileInput({ isVisible, picker }: FileInputProps) {
    if (!isVisible) return null
    return (
        <input
            ref={picker.inputRef}
            type="file"
            accept=".csv,text/csv"
            data-testid="account-import-file"
            aria-label="CSV file"
            style={{ display: 'none' }}
            onChange={picker.onInputChange}
        />
    )
}

function ExampleCell({ value }: { value: string }) {
    const text = value === '' ? '—' : value
    return <Text className="flex-1 px-2 text-xs text-foreground">{text}</Text>
}

function ExampleRow({ cells }: { cells: string[] }) {
    // Cells repeat across columns, so the column name keeps keys unique.
    const items = cells.map((cell, i) => <ExampleCell key={EXAMPLE.header[i]} value={cell} />)
    return <View className="flex-row border-t border-border py-2">{items}</View>
}

function ExampleTable() {
    const header = EXAMPLE.header.map(cell => (
        <Text key={cell} className="flex-1 px-2 text-xs font-semibold text-muted-foreground">
            {cell}
        </Text>
    ))
    const rows = EXAMPLE.rows.map(cells => <ExampleRow key={cells.join('|')} cells={cells} />)
    return (
        <View className="overflow-hidden rounded-lg border border-border">
            <View className="flex-row py-2">{header}</View>
            {rows}
        </View>
    )
}

function CopyExampleButton() {
    const { copy, label } = useCopyExample()
    const color = useThemeColor('foreground')
    return (
        <Button
            testID="account-import-copy-example"
            variant="outline"
            size="sm"
            className="min-h-11"
            onPress={copy}
        >
            <Copy size={14} color={color} />
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}

export function UploadStep({ fileError, chooseFile, onCancel }: UploadStepProps) {
    const picker = useCsvPicker(chooseFile)
    const muted = useThemeColor('muted-foreground')
    const isWeb = Platform.OS === 'web'
    const prompt = isWeb ? 'Drag a CSV file here, or choose one' : 'Choose a CSV file'
    return (
        <View className="gap-4">
            <DropZone
                testID="account-import-drop"
                isEnabled={isWeb}
                label="Drop the CSV file to import"
                onDrop={picker.onDrop}
            >
                <View className="items-center gap-3 rounded-xl border border-dashed border-border p-8">
                    <Upload size={28} color={muted} />
                    <Text className="text-base font-medium text-foreground">{prompt}</Text>
                    <Button className="min-h-11" onPress={picker.open}>
                        <ButtonText>Choose file</ButtonText>
                    </Button>
                    <FileInput isVisible={isWeb} picker={picker} />
                </View>
            </DropZone>
            <ErrorText message={picker.pickError ?? fileError} />
            <Text className="text-sm text-muted-foreground">
                {`One file, a header row is required, UTF-8. Up to ${csvLimits.maxRows} rows and 1 MB.`}
            </Text>
            <Text className="text-sm text-muted-foreground">
                Imported balances are not supported.
            </Text>
            <View className="flex-row items-center justify-between gap-3">
                <Text className="text-sm font-semibold text-foreground">Example</Text>
                <CopyExampleButton />
            </View>
            <ExampleTable />
            <View className="flex-row justify-end gap-2">
                <Button variant="outline" className="min-h-11" onPress={onCancel}>
                    <ButtonText>Cancel</ButtonText>
                </Button>
            </View>
        </View>
    )
}
