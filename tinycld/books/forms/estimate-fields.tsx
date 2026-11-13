import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import type { FormValues } from '@tinycld/core/lib/forms/logic'
import { useFormContext } from 'react-hook-form'
import { View } from 'react-native'
import { acceptanceShown, ESTIMATE_STATUS_OPTIONS } from '../lib/estimate-status'
import { todayIso } from '../lib/register-range'
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

// Expiration date: optional; the form's schema and the server refuse a day before the
// estimate date.
export function ExpirationDateField(props: BuiltinFieldProps) {
    return (
        <View testID="estimate-expiration-date">
            <DayField {...props} />
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
