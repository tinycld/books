import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { useFormContext } from 'react-hook-form'
import { Text, View } from 'react-native'
import { useDocumentFormScope } from '../components/documents/document-form-context'
import { ContactInput } from '../components/forms/ContactInput'
import { acceptanceShown, ESTIMATE_STATUS_OPTIONS } from '../lib/estimate-status'
import { formatDay, todayIso } from '../lib/register-range'
import { HostSelect } from './account-fields'
import { DayField } from './document-fields'

// The estimate host's own header built-ins (books:estimate). Core hands each one only
// its own value and onChange; Status sets Accepted date through the form in its change
// handler, never in an effect.

const DIRTY = { shouldDirty: true } as const

// Status: Pending, Accepted or Rejected (only the server closes an estimate). Picking
// Accepted while Accepted date is empty fills it with today.
export function EstimateStatusField(props: BuiltinFieldProps) {
    const { getValues, setValue } = useFormContext<FormValues>()
    const onChange = (next: unknown) => {
        props.onChange(next)
        const acceptedDate = getValues('accepted_date')
        const isEmpty = typeof acceptedDate !== 'string' || acceptedDate === ''
        if (typeof next === 'string' && acceptanceShown(next) && isEmpty) {
            setValue('accepted_date', todayIso(), DIRTY)
        }
    }
    return (
        <View testID="estimate-status">
            <HostSelect
                fieldKey={props.fieldKey}
                label={props.label}
                value={props.value}
                onChange={onChange}
                disabled={props.disabled}
                options={ESTIMATE_STATUS_OPTIONS}
            />
        </View>
    )
}

// "Expired on <date>" under the input (lesson 27), from the saved estimate only.
function ExpiredHint({ expiredOn }: { expiredOn: string | null }) {
    if (expiredOn === null) return null
    const text = `Expired on ${formatDay(expiredOn)}`
    return (
        <Text testID="estimate-expired-hint" className="text-xs text-muted-foreground">
            {text}
        </Text>
    )
}

// Expiration date: optional; the form's schema and the server refuse a day before the
// estimate date. The Expired hint follows the saved row (the form scope's `expiredOn`),
// so an unsaved date never shows it.
export function ExpirationDateField(props: BuiltinFieldProps) {
    const { expiredOn } = useDocumentFormScope()
    return (
        <View testID="estimate-expiration-date" className="gap-1">
            <DayField {...props} />
            <ExpiredHint expiredOn={expiredOn} />
        </View>
    )
}

// Accepted by: the person who accepted, shown only while Status is Accepted. A text
// built-in (the form's schema bounds it at 200 characters with the estimate's own words);
// drawn here only so the band row can find it by its test id.
export function AcceptedByField(props: BuiltinFieldProps) {
    return (
        <View testID="estimate-accepted-by">
            <ContactInput
                {...props}
                keyboardType="default"
                autoComplete="name"
                autoCapitalize="words"
            />
        </View>
    )
}

// Accepted date: shown only while Status is Accepted, and required then.
export function AcceptedDateField(props: BuiltinFieldProps) {
    return (
        <View testID="estimate-accepted-date">
            <DayField {...props} />
        </View>
    )
}
