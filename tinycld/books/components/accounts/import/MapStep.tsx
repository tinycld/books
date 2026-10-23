import { Button, ButtonText } from '@tinycld/core/ui/button'
import { type FieldErrors, FormErrorSummary } from '@tinycld/core/ui/form'
import { PickMenu } from '@tinycld/core/ui/pick-menu'
import { Text, View } from 'react-native'
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
            <PickMenu
                label={current}
                purpose={`Column for ${label}`}
                items={items}
                size="touch"
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
