import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { useWatch } from '@tinycld/core/ui/form'
import { Popover } from '@tinycld/core/ui/popover'
import { Check } from 'lucide-react-native'
import type { ReactElement } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { AccountChoice } from '../../hooks/useAccountOptions'
import type { FilterSpec } from '../../lib/report-definition'
import { ACCOUNT_GROUP_CHOICES } from '../../lib/report-filters'
import { REPORT_TAP_TARGET } from './ReportHeader'

const PICKER_WIDTH = 340
const LIST_MAX_HEIGHT = 360

type PickerSection = { heading: string | null; choices: AccountChoice[] }

const GROUP_CHOICES: AccountChoice[] = ACCOUNT_GROUP_CHOICES.map(choice => ({
    value: choice.id,
    label: choice.label,
}))

// An accounts filter lists the group choices, then its account rows (the active accounts and
// any selected account that is no longer offered); a choice filter lists its own options
// under no heading.
function pickerSections(spec: FilterSpec, rows: AccountChoice[]): PickerSection[] {
    if (spec.kind === 'choice') {
        const choices = spec.options.map(option => ({ value: option.id, label: option.label }))
        return [{ heading: null, choices }]
    }
    return [
        { heading: 'Account groups', choices: GROUP_CHOICES },
        { heading: 'Accounts', choices: rows },
    ]
}

function toggledValue(values: readonly string[], value: string): string[] {
    return values.includes(value) ? values.filter(item => item !== value) : [...values, value]
}

function CheckMark({ isVisible, color }: { isVisible: boolean; color: string }) {
    if (!isVisible) return null
    return <Check size={14} color={color} />
}

const BOX_TONE = {
    checked: 'border-primary bg-primary',
    idle: 'border-border bg-transparent',
}

interface PickRowProps {
    choice: AccountChoice
    isChecked: boolean
    onToggle: (value: string) => void
}

// react-native-web does not emit aria-checked from accessibilityState, so the row passes both.
function PickRow({ choice, isChecked, onToggle }: PickRowProps) {
    const checkColor = useThemeColor('primary-foreground')
    const box = isChecked ? BOX_TONE.checked : BOX_TONE.idle
    return (
        <Pressable
            testID={`report-filter-option-${choice.value}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isChecked }}
            aria-checked={isChecked}
            onPress={() => onToggle(choice.value)}
            className="flex-row items-center gap-3 rounded-md px-2"
            style={{ minHeight: REPORT_TAP_TARGET }}
        >
            <View className={`h-5 w-5 items-center justify-center rounded border ${box}`}>
                <CheckMark isVisible={isChecked} color={checkColor} />
            </View>
            <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-foreground">
                {choice.label}
            </Text>
        </Pressable>
    )
}

function PickHeading({ label }: { label: string | null }) {
    if (!label) return null
    return (
        <Text className="px-2 pb-1 pt-3 text-xs font-semibold uppercase text-muted-foreground">
            {label}
        </Text>
    )
}

interface PickSectionProps {
    section: PickerSection
    values: readonly string[]
    onToggle: (value: string) => void
}

function PickSection({ section, values, onToggle }: PickSectionProps) {
    const rows = section.choices.map(choice => (
        <PickRow
            key={choice.value}
            choice={choice}
            isChecked={values.includes(choice.value)}
            onToggle={onToggle}
        />
    ))
    return (
        <View>
            <PickHeading label={section.heading} />
            {rows}
        </View>
    )
}

type PickerDraft = UseFormReturn<{ values: string[] }>

interface PickerBodyProps {
    isVisible: boolean
    sections: PickerSection[]
    draft: PickerDraft
    onApply: (values: string[]) => void
}

function PickerBody({ isVisible, ...props }: PickerBodyProps) {
    if (!isVisible) return null
    return <OpenPickerBody {...props} />
}

// The draft is owned by the screen and reset when the picker opens, so it survives this body
// re-mounting as a Sheet at a breakpoint change.
function OpenPickerBody({ sections, draft, onApply }: Omit<PickerBodyProps, 'isVisible'>) {
    const values = useWatch({ control: draft.control, name: 'values' })
    const onToggle = (value: string) => {
        draft.setValue('values', toggledValue(values, value), { shouldValidate: true })
    }
    const apply = () => draft.handleSubmit(submitted => onApply(submitted.values))()
    const list = sections.map(section => (
        <PickSection
            key={section.heading ?? 'choices'}
            section={section}
            values={values}
            onToggle={onToggle}
        />
    ))
    // The list scrolls on its own and Apply sits below it, so Apply stays in view. Android
    // scrolls a list nested in the Sheet's or Popover's own scroller only when it opts in.
    return (
        <View className="gap-2">
            <ScrollView style={{ maxHeight: LIST_MAX_HEIGHT }} nestedScrollEnabled>
                {list}
            </ScrollView>
            <View className="border-t border-border pt-2">
                <Button
                    testID="report-filter-apply"
                    style={{ minHeight: REPORT_TAP_TARGET }}
                    isDisabled={!draft.formState.isValid}
                    onPress={apply}
                >
                    <ButtonText>Apply</ButtonText>
                </Button>
            </View>
        </View>
    )
}

interface ReportAccountFilterPickerProps {
    spec: FilterSpec
    trigger: ReactElement
    isOpen: boolean
    draft: PickerDraft
    rows: AccountChoice[]
    onApply: (values: string[]) => void
    onClose: () => void
}

// The trigger opens the picker through its own onPress; an outside press, Escape or the
// sheet's close only ever closes it, and changes nothing.
export function ReportAccountFilterPicker({
    spec,
    trigger,
    isOpen,
    draft,
    rows,
    onApply,
    onClose,
}: ReportAccountFilterPickerProps) {
    const onOpenChange = (open: boolean) => {
        if (!open) onClose()
    }
    return (
        <Popover
            trigger={trigger}
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            title={spec.label}
            sheetSide="bottom"
            width={PICKER_WIDTH}
            testID="report-filter-picker"
        >
            <PickerBody
                isVisible={isOpen}
                sections={pickerSections(spec, rows)}
                draft={draft}
                onApply={onApply}
            />
        </Popover>
    )
}
