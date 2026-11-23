import { useWatch } from '@tinycld/core/ui/form'
import { useState } from 'react'
import {
    type CloseDateValues,
    closeDateSchema,
    closeDateValue,
    closeDateValues,
    isReopening,
} from '../lib/settings-schema'
import type { BooksSettings } from '../types'
import { useSettingsForm } from './useSettingsForm'

// The row comes from the settings panel, which keeps it through a later failed or reloading
// read: a read of its own here would fall back to "not closed" then, and a reopen would
// save with no question.
export function useCloseBooks(settings: BooksSettings) {
    // The one-dialog question that nothing else reads, so it stays local
    const [reopen, setReopen] = useState<{ oldDate: string } | null>(null)
    const save = useSettingsForm<CloseDateValues>({
        schema: closeDateSchema,
        values: closeDateValues(settings),
        toPatch: values => ({ close_date: closeDateValue(values) }),
    })
    const { form } = save
    const isClosed = useWatch({ control: form.control, name: 'closed' })

    // Validation runs first, so an invalid date never asks the question
    const submit = form.handleSubmit(parsed => {
        const oldDate = settings.close_date
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
