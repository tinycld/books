import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { newRecordId } from 'pbtsdb/core'
import { refusalMessage } from '../lib/record-refusals'
import { errorStatus, SERVER_UNREACHED, writeRefusalText } from '../lib/refusal'
import { recipientLabel } from '../lib/statement-recipients'
import type { CreateStatementsValues } from '../lib/statement-schema'
import { type StatementRunOutcome, useStatementsStore } from '../stores/statements-store'

type StatementsCollection = ReturnType<typeof useStore<['books_statements']>>[0]

type StartedInsert = { customer: string; tx: ReturnType<typeof startInsert> | null; error: unknown }

// Starts the insert of one statement. The server sets the number, the sequence, the balance
// and the currency, so the row holds only what the run chose (statements spec §4.5).
function startInsert(
    statements: StatementsCollection,
    values: CreateStatementsValues,
    recipient: CreateStatementsValues['recipients'][number]
) {
    const hasPeriod = values.type === 'balance_forward'
    return statements.insert({
        id: newRecordId(),
        customer: recipient.customer,
        type: values.type,
        statement_date: values.statementDate,
        start_date: hasPeriod ? values.startDate : '',
        end_date: hasPeriod ? values.endDate : '',
        email: recipient.email,
    })
}

// The server's text for one refused insert: its own message, else its field messages; a
// write that never reached the server reads as such.
function failureText(error: unknown): string {
    if (errorStatus(error) === 0) return SERVER_UNREACHED
    return refusalMessage(error) ?? writeRefusalText(error)
}

// The refusal of an insert that was not stored, or null when it was.
function refusalOf({ tx, error }: StartedInsert): { error: unknown } | null {
    if (tx === null) return { error }
    if (tx.state !== 'failed') return null
    return { error: tx.error?.error }
}

/**
 * Save of the create screen (statements spec §3.4, §4.5): one `books_statements` insert for
 * each ticked customer, all in parallel; the server stores them one after the other and
 * numbers each. `save` holds the screen (stores/statements-store.ts) from before the first
 * insert until the last one settles, and resolves to the run's outcome, read from the
 * settled transactions: a refused insert does not stop the others.
 */
export function useCreateStatements() {
    const [statements, customers] = useStore('books_statements', 'books_customers')

    // The name of a refused customer in the run notice, read once when the run ends; the
    // create screen's live query holds the customer rows.
    const nameOf = (id: string) => {
        const customer = customers.get(id)
        if (customer === undefined) return ''
        const parent = customer.parent === '' ? undefined : customers.get(customer.parent)
        return recipientLabel({
            name: customer.display_name,
            parentName: parent?.display_name ?? '',
            inactive: customer.inactive,
        })
    }

    const mutation = useMutation({
        // A generator that yields one promise over every insert settled: core's
        // drainTransactions awaits a yielded array with Promise.all, which rejects at the
        // first refusal, so the others' outcome could not be read after it.
        mutationFn: function* (values: CreateStatementsValues) {
            const ticked = values.recipients.filter(recipient => recipient.ticked)
            const started: StartedInsert[] = ticked.map(recipient => {
                try {
                    return {
                        customer: recipient.customer,
                        tx: startInsert(statements, values, recipient),
                        error: null,
                    }
                } catch (error) {
                    return { customer: recipient.customer, tx: null, error }
                }
            })
            yield Promise.allSettled(started.map(({ tx }) => tx?.when('settled')))
            const failed = started.flatMap(insert => {
                const refusal = refusalOf(insert)
                if (refusal === null) return []
                const { customer } = insert
                return [{ customer, name: nameOf(customer), message: failureText(refusal.error) }]
            })
            const outcome: StatementRunOutcome = {
                intent: 'save',
                done: started.length - failed.length,
                total: started.length,
                failed,
            }
            return outcome
        },
    })

    const save = async (values: CreateStatementsValues): Promise<StatementRunOutcome> => {
        const store = useStatementsStore.getState()
        store.hold()
        try {
            const outcome = await mutation.mutateAsync(values)
            store.setOutcome(outcome)
            return outcome
        } finally {
            useStatementsStore.getState().release()
        }
    }

    return { save, isSaving: mutation.isPending }
}
