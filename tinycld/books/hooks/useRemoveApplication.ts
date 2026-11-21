import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useState } from 'react'
import type { CreditApplicationKind } from '../lib/credit-application-kinds'
import { writeRefusalText } from '../lib/refusal'
import type { CreditApplicationRow } from './useCreditApplications'
import { reportUnexpected } from './useRecordActions'

const LOG_CONTEXT = 'books.removeApplication'

/**
 * Remove of a credit application (vendor credit spec §3.9, apply credit spec §3.7) of the
 * kind's collection (plan decision 4): `ask` names the application the confirm dialog asks
 * about, `confirm` deletes it (one delete), `cancel` closes the dialog. `isVisible` is the
 * dialog's visibility: open while the asked application is still in the owner's list
 * (`applications`) and Remove is still offered (`canRemove`), or while its delete runs. The
 * delete is optimistic, so the row leaves the list before the server answers; the dialog
 * stays open meanwhile, so a refusal (`errorMessage`) shows in it. One owner per screen: a
 * credit's read section, a document's read view.
 */
export function useRemoveApplication(
    kind: CreditApplicationKind,
    input: {
        applications: readonly { id: string }[]
        canRemove: boolean
    }
) {
    const [vendorApplications, memoApplications] = useStore(
        'books_vendor_credit_applications',
        'books_credit_memo_applications'
    )
    const [target, setTarget] = useState<CreditApplicationRow | null>(null)
    const remove = useMutation({
        mutationFn: function* (id: string) {
            if (kind.key === 'vendor_credit') yield vendorApplications.delete(id)
            else yield memoApplications.delete(id)
        },
        onSuccess: () => setTarget(null),
        // The dialog shows the refusal; without this core reports it again as a toast. A
        // fault that is not a refusal (a server failure, a lost request, a client error) is
        // still logged.
        onError: error => reportUnexpected(LOG_CONTEXT, error),
    })
    const ask = (application: CreditApplicationRow) => {
        remove.reset()
        setTarget(application)
    }
    const cancel = () => setTarget(null)
    const confirm = () => {
        if (target === null || remove.isPending) return
        remove.mutate(target.id)
    }
    const isTargetListed = target !== null && input.applications.some(row => row.id === target.id)
    const isVisible = (isTargetListed && input.canRemove) || remove.isPending
    return {
        target,
        isVisible,
        ask,
        cancel,
        confirm,
        isPending: remove.isPending,
        errorMessage: remove.error ? writeRefusalText(remove.error) : null,
    }
}

export type RemoveApplication = ReturnType<typeof useRemoveApplication>
