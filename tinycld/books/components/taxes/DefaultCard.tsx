import { SelectInput, type SelectOption, useForm, z, zodResolver } from '@tinycld/core/ui/form'
import { Text, View } from 'react-native'
import { DEFAULT_HELP } from '../../lib/tax-messages'
import type { TaxesControls, TaxesView } from '../../lib/taxes-view'

interface DefaultCardProps {
    view: TaxesView
    controls: TaxesControls
    options: SelectOption[]
    isWorking: boolean
    onChoose(id: string): void
}

const defaultSchema = z.object({ taxDefault: z.string() })

type DefaultForm = z.infer<typeof defaultSchema>

interface DefaultPickerProps {
    isVisible: boolean
    defaultId: string
    options: SelectOption[]
    isDisabled: boolean
    onChoose(id: string): void
}

// The value follows the page's default (the pending choice while its write runs), so
// a refused choice goes back to the stored one. A choice saves at once: no Save.
function DefaultPicker({
    isVisible,
    defaultId,
    options,
    isDisabled,
    onChoose,
}: DefaultPickerProps) {
    const form = useForm<DefaultForm>({
        resolver: zodResolver(defaultSchema),
        values: { taxDefault: defaultId },
    })
    if (!isVisible) return null
    return (
        <SelectInput
            control={form.control}
            name="taxDefault"
            label="Default for new sales"
            hideLabel
            options={options}
            disabled={isDisabled}
            onValueChange={onChoose}
            testID="tax-default-select"
        />
    )
}

// A reader sees the default as text, with no picker.
function DefaultText({ isVisible, text }: { isVisible: boolean; text: string }) {
    if (!isVisible) return null
    return (
        <Text testID="tax-default-text" className="mb-2 text-sm text-foreground">
            {text}
        </Text>
    )
}

function defaultText(view: TaxesView) {
    const row = view.defaultRow
    return row ? `${row.name} ${row.percent}` : 'None'
}

export function DefaultCard({ view, controls, options, isWorking, onChoose }: DefaultCardProps) {
    if (!view.showDefaultCard) return null
    return (
        <View
            testID="tax-default-card"
            className="rounded-xl border border-border bg-surface-secondary p-4"
        >
            <Text className="mb-3 text-base font-bold text-foreground">Default for new sales</Text>
            <DefaultPicker
                isVisible={controls.showActions}
                defaultId={view.defaultRow?.id ?? ''}
                options={options}
                isDisabled={!controls.canPressWrites || isWorking}
                onChoose={onChoose}
            />
            <DefaultText isVisible={!controls.showActions} text={defaultText(view)} />
            <Text className="text-xs text-muted-foreground">{DEFAULT_HELP}</Text>
        </View>
    )
}
