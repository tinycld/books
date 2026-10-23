import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { type FieldErrors, FormErrorSummary } from '@tinycld/core/ui/form'
import { Menu } from '@tinycld/core/ui/menu'
import { ChevronDown } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { type ColumnMap, IMPORT_FIELDS, type ImportField } from '../../../lib/account-import'

interface MapStepProps {
    header: string[]
    columnMap: ColumnMap
    setColumn: (field: ImportField, index: number | null) => void
    errors: FieldErrors<ColumnMap>
    onBack: () => void
    onNext: () => void
}

const NOT_MAPPED = 'Not mapped'

function columnName(header: string[], index: number) {
    return header[index] === '' ? `Column ${index + 1}` : header[index]
}

interface FieldRowProps {
    field: ImportField
    label: string
    required: boolean
    header: string[]
    selected: number | null
    setColumn: MapStepProps['setColumn']
}

interface ColumnPickerProps {
    label: string
    current: string
    items: { id: string; label: string; isSelected: boolean; onSelect: () => void }[]
    testID: string
}

// Core's PickMenu chip is under 44pt tall, so the trigger is built here.
function ColumnPicker({ label, current, items, testID }: ColumnPickerProps) {
    const muted = useThemeColor('muted-foreground')
    const rows = items.map(item => (
        <Menu.Item
            key={item.id}
            label={item.label}
            isSelected={item.isSelected}
            onSelect={item.onSelect}
            testID={`${testID}-${item.id}`}
        />
    ))
    const trigger = (
        <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={`Column for ${label}: ${current}`}
            className="min-w-40 flex-row items-center justify-between gap-2 rounded-md border border-border px-3"
            style={{ minHeight: 44 }}
        >
            <Text className="text-sm text-foreground">{current}</Text>
            <ChevronDown size={14} color={muted} />
        </Pressable>
    )
    return (
        <Menu title={`Column for ${label}`} trigger={trigger}>
            {rows}
        </Menu>
    )
}

function RequiredTag({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="text-xs text-muted-foreground">Required</Text>
}

function FieldRow({ field, label, required, header, selected, setColumn }: FieldRowProps) {
    const items = [
        {
            id: 'none',
            label: NOT_MAPPED,
            isSelected: selected === null,
            onSelect: () => setColumn(field, null),
        },
        ...header.map((_, index) => ({
            // Headers can repeat, so the column position is the identity.
            id: String(index),
            label: columnName(header, index),
            isSelected: selected === index,
            onSelect: () => setColumn(field, index),
        })),
    ]
    const current = selected === null ? NOT_MAPPED : columnName(header, selected)
    return (
        <View
            testID={`account-import-map-${field}`}
            className="flex-row items-center justify-between gap-3 py-2"
        >
            <View className="flex-1 flex-row items-center gap-2">
                <Text className="text-sm font-medium text-foreground">{label}</Text>
                <RequiredTag isVisible={required} />
            </View>
            <ColumnPicker
                label={label}
                current={current}
                items={items}
                testID={`account-import-map-${field}-pick`}
            />
        </View>
    )
}

export function MapStep({ header, columnMap, setColumn, errors, onBack, onNext }: MapStepProps) {
    const rows = IMPORT_FIELDS.map(({ field, label, required }) => (
        <FieldRow
            key={field}
            field={field}
            label={label}
            required={required}
            header={header}
            selected={columnMap[field]}
            setColumn={setColumn}
        />
    ))
    return (
        <View className="gap-3">
            <Text className="text-sm text-muted-foreground">
                We matched your file's columns by name. Check each one before you continue. Name and
                Type need a column.
            </Text>
            <View>{rows}</View>
            <FormErrorSummary
                testID="account-import-map-errors"
                errors={errors}
                isEnabled
                showFieldNames={false}
            />
            <View className="flex-row justify-end gap-2">
                <Button variant="outline" className="min-h-11" onPress={onBack}>
                    <ButtonText>Back</ButtonText>
                </Button>
                <Button testID="account-import-next" className="min-h-11" onPress={onNext}>
                    <ButtonText>Continue</ButtonText>
                </Button>
            </View>
        </View>
    )
}
