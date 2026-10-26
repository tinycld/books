import { useForm, type z, zodResolver } from '@tinycld/core/ui/form'
import { useEffect, useRef } from 'react'
import type { UseFormReturn } from 'react-hook-form'

// Host values are flat: strings, and the shipping toggle's boolean. The type holds
// callers to that, so this shallow compare never sees a nested value.
type FlatValues = Record<string, string | boolean>

function sameValues(a: FlatValues, b: FlatValues) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every(key => Object.is(a[key], b[key]))
}

/**
 * A local form for a host component. Core hands a host component only `value` and
 * `onChange`, while core TextInput and Toggle bind to a react-hook-form `control`; this
 * form gives them one. The host value is the source, and each input sends the whole
 * value back through `onChange`. The schema mirrors the server's limits, and its errors
 * never block the outer save: the server stays the authority.
 *
 * RHF's `values` option gets only the first host value. Fed every host value, it
 * resets the form whenever the host value differs from the last value it reset to, so
 * each keystroke's echo resets it, and a reset drops the validation still running for
 * that keystroke (a length error never shows). The form is reset only when the host
 * value differs from what the form holds: a change from outside, such as the outer
 * form's reset or the shipping toggle.
 */
export function useHostValueForm<T extends FlatValues>(
    schema: z.ZodType<T, T>,
    values: T
): UseFormReturn<T> {
    // The first host value only: RHF never resets from it again, the effect below does.
    const firstValues = useRef(values).current
    const form = useForm<T, unknown, T>({
        resolver: zodResolver(schema),
        values: firstValues,
        mode: 'onChange',
    })
    const { getValues, reset } = form
    useEffect(() => {
        if (!sameValues(getValues(), values)) reset(values)
    }, [getValues, reset, values])
    return form
}
