import { useWatch } from '@tinycld/core/ui/form'
import { useState } from 'react'
import {
    type CloseDateValues,
    closeDateSchema,
    closeDateValue,
    closeDateValues,
    isReopening,
} from '../lib/settings-schema'
import { useBooksSettings } from './useBooksSettings'
import { useSettingsForm } from './useSettingsForm'

const NOT_CLOSED: CloseDateValues = { closed: false, close_date: '' }

export function useCloseBooks() {
    const { settings } = useBooksSettings()
    // The one-dialog question that nothing else reads, so it stays local
    const [reopen, setReopen] = useState<{ oldDate: string } | null>(null)
    const save = useSettingsForm({
        schema: closeDateSchema,
        values: settings ? closeDateValues(settings) : NOT_CLOSED,
        toPatch: values => ({ close_date: closeDateValue(values) }),
    })
    const { form } = save
    const isClosed = useWatch({ control: form.control, name: 'closed' })

    // Validation runs first, so an invalid date never asks the question
    const submit = form.handleSubmit(parsed => {
        const oldDate = settings?.close_date ?? ''
        if (isReopening(oldDate, parsed)) setReopen({ oldDate })
        else save.submit()
    })

    return {
        form,
        submit: () => void submit(),
        isPending: save.isPending,
        isDirty: save.isDirty,
        isClosed,
        reopen,
        confirmReopen: () => {
            setReopen(null)
            save.submit()
        },
        cancelReopen: () => setReopen(null),
    }
}
