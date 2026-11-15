import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { type FieldValues, useForm, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { ClientResponseError } from 'pocketbase'
import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { PublicEstimateRow } from '../lib/estimate-public'
import {
    type AcceptValues,
    acceptSchema,
    type DeclineValues,
    declineSchema,
    isNetworkFailure,
    RESPONSE_NETWORK_TEXT,
} from '../lib/estimate-response-schema'
import { messageOnlyRefusal, writeRefusalText } from '../lib/refusal'

type Decision = 'accepted' | 'declined'

interface ResponseInput {
    decision: Decision
    name: string
    reason: string
}

const LOG_CONTEXT = 'books.estimate-public'

export interface EstimateResponse {
    // Empties both forms and drops an earlier refusal: a step that opens or closes starts
    // a new answer.
    restart(): void
    acceptForm: UseFormReturn<AcceptValues>
    declineForm: UseFormReturn<DeclineValues>
    submitAccept(): void
    submitDecline(): void
    sending: Decision | null
    refusal: string
}

function rootError<T extends FieldValues>(form: UseFormReturn<T>, message: string) {
    form.setError('root', { type: 'server', message })
}

// The customer's Accept or Decline on the public page (spec §3.3, §4.3): the two forms and
// the one response write. It lives in PublicEstimateReady, so a refusal outlives the re-read
// of the view that follows it. The open step lives in PublicDecision (useDecisionStep), which
// unmounts while the estimate is not waiting for an answer, so a step never comes back with
// an old refusal when the estimate is Pending again.
export function useEstimateResponse(
    row: PublicEstimateRow,
    reload: () => Promise<void>
): EstimateResponse {
    const [responsesCollection] = useStore('books_estimate_responses')
    const [refusal, setRefusal] = useState('')
    const acceptForm = useForm<AcceptValues>({
        resolver: zodResolver(acceptSchema),
        defaultValues: { name: '' },
    })
    const declineForm = useForm<DeclineValues>({
        resolver: zodResolver(declineSchema),
        defaultValues: { reason: '' },
    })

    // A failed re-read shows as the view's own load error; it only needs a log here.
    const reread = async () => {
        try {
            await reload()
        } catch (error) {
            log.error(LOG_CONTEXT, error)
        }
    }

    const resetForms = () => {
        acceptForm.reset()
        declineForm.reset()
    }

    const restart = () => {
        resetForms()
        setRefusal('')
    }

    const onError = (error: unknown, input: ResponseInput) => {
        const isAccept = input.decision === 'accepted'
        const setRoot = (message: string) =>
            isAccept ? rootError(acceptForm, message) : rootError(declineForm, message)
        if (!(error instanceof ClientResponseError)) {
            // Not a PocketBase answer: a defect on this side. The customer still gets the
            // retry text, since the answer did not reach the server.
            log.error(LOG_CONTEXT, error)
            setRoot(RESPONSE_NETWORK_TEXT)
            return
        }
        if (isNetworkFailure(error)) {
            log.warn(LOG_CONTEXT, 'the response did not reach the server', { error })
            setRoot(RESPONSE_NETWORK_TEXT)
            return
        }
        const message = messageOnlyRefusal(error)
        if (message !== null) {
            // The estimate changed meanwhile, expired or went away: say why, and show the
            // state it is in now.
            log.warn(LOG_CONTEXT, 'the response was refused', { message })
            setRoot(writeRefusalText(error))
            setRefusal(message)
            void reread()
            return
        }
        log.warn(LOG_CONTEXT, 'a field of the response was refused', { error })
        const handle = isAccept
            ? handleMutationErrorsWithForm({
                  setError: acceptForm.setError,
                  getValues: acceptForm.getValues,
                  operation: 'books.estimate-public.accept',
              })
            : handleMutationErrorsWithForm({
                  setError: declineForm.setError,
                  getValues: declineForm.getValues,
                  operation: 'books.estimate-public.decline',
              })
        handle(error)
    }

    const send = useMutation({
        mutationFn: function* (input: ResponseInput) {
            yield responsesCollection.insert({ id: newRecordId(), estimate: row.id, ...input })
        },
        // The page shows the answer's outcome only once the view is read again; the step
        // stays in its sending state until then.
        onSuccess: async () => {
            await reread()
            resetForms()
        },
        onError,
    })

    // A new answer replaces whatever an earlier one was refused with.
    const sendAnswer = (input: ResponseInput) => {
        setRefusal('')
        send.mutate(input)
    }

    const submitAccept = () => {
        if (send.isPending) return
        void acceptForm.handleSubmit(values =>
            sendAnswer({ decision: 'accepted', name: values.name, reason: '' })
        )()
    }
    const submitDecline = () => {
        if (send.isPending) return
        void declineForm.handleSubmit(values =>
            sendAnswer({ decision: 'declined', name: '', reason: values.reason })
        )()
    }

    const sending = send.isPending ? (send.variables?.decision ?? null) : null

    return {
        restart,
        acceptForm,
        declineForm,
        submitAccept,
        submitDecline,
        sending,
        refusal,
    }
}
