import { SelectInput, type SelectOption, TextAreaInput } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { useController } from 'react-hook-form'
import { Text, View } from 'react-native'
import type { AdjustmentForm } from '../../hooks/useAdjustmentForm'
import { adjustmentFormTitle } from '../../lib/adjustment-kind'
import { INVENTORY_TEXTS } from '../../lib/inventory-adjust-fixture'
import { DocumentHeader } from '../documents/DocumentHeader'
import { BackLink } from '../entries/EntryHeader'
import { FieldError } from '../payments/PaymentMoneyField'

const BAND = 'rounded-xl border border-border bg-surface-secondary p-4'
const DATE_WIDTH = 180
const ACCOUNT_WIDTH = 280
const MEMO_MIN = 220
// The band's `gap-4`, and its `p-4` and `border`, both sides together.
const FIELD_GAP = 16
const BAND_EDGES = 32 + 2
// Under a 640 px form the fields stack (spec §3.2; the band is the form less its `px-4`).
// At 640 px and more Date and Account share a row; Memo joins them while the row holds all
// three at their widths, else it takes its own row below them.
const FORM_PADDING = 32
const STACK_BELOW = 640 - FORM_PADDING
const ONE_ROW_MIN = DATE_WIDTH + ACCOUNT_WIDTH + MEMO_MIN + 2 * FIELD_GAP + BAND_EDGES
const DATE_WIDE = { width: DATE_WIDTH }
const ACCOUNT_WIDE = { width: ACCOUNT_WIDTH }
const MEMO_IN_ROW = { flex: 1, minWidth: MEMO_MIN }
const MEMO_OWN_ROW = { width: '100%' as const }

type BandLayout = 'one-row' | 'two-rows' | 'stacked'

function bandLayoutOf(width: number): BandLayout {
    if (width >= ONE_ROW_MIN) return 'one-row'
    if (width >= STACK_BELOW) return 'two-rows'
    return 'stacked'
}

const BAND_ROW: Record<BandLayout, string> = {
    'one-row': 'flex-row items-start gap-4',
    'two-rows': 'flex-row flex-wrap items-start gap-4',
    stacked: 'gap-3',
}

const MEMO_STYLE = { 'one-row': MEMO_IN_ROW, 'two-rows': MEMO_OWN_ROW, stacked: undefined }

type AdjustmentControl = AdjustmentForm['form']['control']

function DateInput({
    control,
    isDisabled,
    hasFocusOnOpen,
}: {
    control: AdjustmentControl
    isDisabled: boolean
    hasFocusOnOpen: boolean
}) {
    const { field } = useController({ control, name: 'date' })
    const handleChange = (next: string | null) => field.onChange(next ?? '')
    return (
        <DateField
            value={field.value}
            onChange={handleChange}
            withTime={false}
            disabled={isDisabled}
            autoFocus={hasFocusOnOpen}
            accessibilityLabel="Date"
            testID="adjustment-date"
        />
    )
}

// "Empty uses Inventory shrinkage…" while no account is chosen.
function AccountHint({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="adjustment-account-hint" className="mt-1 text-xs text-muted-foreground">
            {INVENTORY_TEXTS.shrinkageHint}
        </Text>
    )
}

interface AdjustmentFormHeaderProps {
    adjustmentForm: AdjustmentForm
    // The stored draft's number; '' for a new adjustment and a draft (no number yet).
    number: string
    // A save stored the adjustment: its title and its Draft badge.
    isSaved: boolean
    // The Adjustment account's options (lib/adjustment-accounts.ts) and the trigger's text
    // for a stored account they leave out.
    accountOptions: SelectOption[]
    accountTriggerLabel: string
    // A save runs: the fields wait for it.
    isDisabled: boolean
    // The Date takes the first focus (web only, spec §3.2).
    hasFocusOnOpen: boolean
    onBack: () => void
}

/**
 * The adjustment form's head (inventory-adjust spec §3.2): the back link to the list (off
 * while a write runs), the title ("New inventory adjustment" with no badge; a saved draft
 * "Inventory adjustment" with the Draft badge) and help (DocumentHeader, no figure), and
 * the band: Date (core DateField), the Adjustment account (core SelectInput; the shrinkage
 * hint while it is empty) and Memo (core TextAreaInput, at most 4000 characters, with its
 * hint). At 640 px and more Date and Account share a row, with Memo in it while the row
 * holds all three, else on its own row below; under 640 px they stack.
 */
export function AdjustmentFormHeader({
    adjustmentForm,
    number,
    isSaved,
    accountOptions,
    accountTriggerLabel,
    isDisabled,
    hasFocusOnOpen,
    onBack,
}: AdjustmentFormHeaderProps) {
    const { form, values } = adjustmentForm
    const band = useContainerWidth()
    const layout = bandLayoutOf(band.width)
    const isStacked = layout === 'stacked'
    const row = BAND_ROW[layout]
    const dateStyle = isStacked ? undefined : DATE_WIDE
    const accountStyle = isStacked ? undefined : ACCOUNT_WIDE
    const memoStyle = MEMO_STYLE[layout]
    const title = adjustmentFormTitle(number, isSaved)
    const dateError = form.formState.errors.date?.message ?? ''
    const placeholder = accountTriggerLabel || 'Choose an account'
    return (
        <View className="gap-4">
            <BackLink
                label="Inventory adjustments"
                testID="inventory-adjustment-back"
                onPress={onBack}
                disabled={isDisabled}
            />
            <DocumentHeader
                title={title}
                status="draft"
                isExpired={false}
                isBadgeHidden={!isSaved}
            />
            <View testID="adjustment-band" onLayout={band.onLayout} className={`${BAND} ${row}`}>
                <View className="min-w-0" style={dateStyle}>
                    <Text className="mb-1 text-sm font-semibold text-foreground">Date</Text>
                    <DateInput
                        control={form.control}
                        isDisabled={isDisabled}
                        hasFocusOnOpen={hasFocusOnOpen}
                    />
                    <FieldError message={dateError} testID="adjustment-date-error" />
                </View>
                <View className="min-w-0" style={accountStyle}>
                    <SelectInput
                        name="account"
                        control={form.control}
                        label="Adjustment account"
                        options={accountOptions}
                        placeholder={placeholder}
                        disabled={isDisabled}
                        testID="adjustment-account"
                    />
                    <AccountHint isVisible={values.account === ''} />
                </View>
                <View className="min-w-0" style={memoStyle}>
                    <TextAreaInput
                        name="memo"
                        control={form.control}
                        label="Memo"
                        maxLength={4000}
                        editable={!isDisabled}
                        testID="adjustment-memo"
                    />
                    <Text
                        testID="adjustment-memo-hint"
                        className="mt-1 text-xs text-muted-foreground"
                    >
                        {INVENTORY_TEXTS.memoHint}
                    </Text>
                </View>
            </View>
        </View>
    )
}
