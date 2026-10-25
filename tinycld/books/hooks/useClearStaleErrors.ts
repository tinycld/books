import { type UseFormReturn, useFormContext } from 'react-hook-form'
import type { EntryFormValues } from '../lib/entry-schema'

type EntryFormApi = Pick<
    UseFormReturn<EntryFormValues>,
    'clearErrors' | 'getFieldState' | 'trigger'
>

// A server refusal describes the values that were sent, so any edit makes it stale. The
// unbalanced message is a validation result, so it is re-checked in the change event, and
// only while it is showing, so a clean form is not validated early.
export function staleErrorClearers({ clearErrors, getFieldState, trigger }: EntryFormApi) {
    const onEdit = () => clearErrors('root')
    const onAmountEdit = () => {
        onEdit()
        if (getFieldState('lines').error?.root) void trigger('lines')
    }
    return { onEdit, onAmountEdit }
}

export function useClearStaleErrors() {
    return staleErrorClearers(useFormContext<EntryFormValues>())
}
