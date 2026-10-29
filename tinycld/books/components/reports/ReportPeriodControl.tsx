import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { Popover } from '@tinycld/core/ui/popover'
import { Calendar } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { ReportOptionsForm } from '../../hooks/useReportOptionsForm'
import type { PeriodPreset, ReportSpec } from '../../lib/report-definition'
import { PERIOD_PRESET_LABELS } from '../../lib/report-period'
import { REPORT_TAP_TARGET } from './ReportHeader'

const POPOVER_WIDTH = 360

const PILL_TONE = {
    selected: { box: 'border-primary bg-primary', text: 'text-primary-foreground' },
    idle: { box: 'border-border bg-transparent', text: 'text-foreground' },
}

interface PresetPillProps {
    preset: PeriodPreset
    isSelected: boolean
    onPress: (preset: PeriodPreset) => void
}

// react-native-web does not emit aria-checked from accessibilityState, so the pill passes both.
function PresetPill({ preset, isSelected, onPress }: PresetPillProps) {
    const tone = isSelected ? PILL_TONE.selected : PILL_TONE.idle
    return (
        <Pressable
            testID={`report-period-preset-${preset}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            aria-checked={isSelected}
            onPress={() => onPress(preset)}
            className={`justify-center rounded-full border px-3 ${tone.box}`}
            style={{ minHeight: REPORT_TAP_TARGET }}
        >
            <Text className={`text-sm font-medium ${tone.text}`}>
                {PERIOD_PRESET_LABELS[preset]}
            </Text>
        </Pressable>
    )
}

function FieldError({ message }: { message: string | undefined }) {
    if (!message) return null
    return (
        <Text testID="report-period-error" role="alert" className="text-xs text-danger">
            {message}
        </Text>
    )
}

interface PeriodDateProps {
    label: string
    value: string | null
    error: string | undefined
    testID: string
    onChange: (value: string | null) => void
}

function PeriodDate({ label, value, error, testID, onChange }: PeriodDateProps) {
    return (
        <View className="gap-1.5">
            <Text className="text-sm font-semibold text-foreground">{label}</Text>
            <DateField
                value={value}
                onChange={onChange}
                withTime={false}
                accessibilityLabel={label}
                testID={testID}
            />
            <FieldError message={error} />
        </View>
    )
}

interface PeriodDatesProps {
    kind: ReportSpec['period']['kind']
    form: ReportOptionsForm
}

// An as-of report reads one date; a range report reads From and To.
function PeriodDates({ kind, form }: PeriodDatesProps) {
    const { errors } = form
    if (kind === 'as-of') {
        return (
            <PeriodDate
                label="As of"
                value={form.pendingTo}
                error={errors.to?.message}
                testID="report-period-as-of"
                onChange={value => form.onDateChange('to', value)}
            />
        )
    }
    return (
        <View className="gap-3">
            <PeriodDate
                label="From"
                value={form.pendingFrom}
                error={errors.from?.message}
                testID="report-period-from"
                onChange={value => form.onDateChange('from', value)}
            />
            <PeriodDate
                label="To"
                value={form.pendingTo}
                error={errors.to?.message}
                testID="report-period-to"
                onChange={value => form.onDateChange('to', value)}
            />
        </View>
    )
}

// An element, not a component: the Popover clones its trigger with a ref and an onPress,
// which a plain Pressable takes as they are.
function periodChip(label: string, iconColor: string) {
    return (
        <Pressable
            testID="report-period"
            accessibilityRole="button"
            accessibilityLabel={`Report period: ${label}`}
            className="flex-row items-center gap-1.5 rounded-full border border-border bg-secondary px-3"
            style={{ minHeight: REPORT_TAP_TARGET }}
        >
            <Calendar size={14} color={iconColor} />
            <Text numberOfLines={1} className="text-sm text-secondary-foreground">
                {label}
            </Text>
        </Pressable>
    )
}

interface ReportPeriodControlProps {
    label: string
    period: ReportSpec['period']
    form: ReportOptionsForm
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    onDismiss: () => void
}

// A preset applies at once, so its pill closes the popover and the chip shows the result.
// Custom and a date edit keep it open, so the inline error stays in view.
export function ReportPeriodControl({
    label,
    period,
    form,
    isOpen,
    onOpenChange,
    onDismiss,
}: ReportPeriodControlProps) {
    const muted = useThemeColor('muted-foreground')
    const presets: readonly PeriodPreset[] = period.presets
    const onPreset = (preset: PeriodPreset) => {
        form.onPreset(preset)
        if (preset !== 'custom') onOpenChange(false)
    }
    // Escape, an outside press or the sheet's close goes through onDismiss, which drops an
    // invalid typed date. A preset pick closes through onPreset instead, because its values are
    // about to become the options.
    const onPopoverOpenChange = (open: boolean) => {
        if (open) onOpenChange(true)
        else onDismiss()
    }
    const pills = presets.map(preset => (
        <PresetPill
            key={preset}
            preset={preset}
            isSelected={preset === form.preset}
            onPress={onPreset}
        />
    ))
    return (
        <Popover
            trigger={periodChip(label, muted)}
            isOpen={isOpen}
            onOpenChange={onPopoverOpenChange}
            title="Report period"
            sheetSide="bottom"
            width={POPOVER_WIDTH}
            testID="report-period-popover"
        >
            <View className="gap-3 p-2">
                <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
                    {pills}
                </View>
                <PeriodDates kind={period.kind} form={form} />
            </View>
        </Popover>
    )
}
