import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { newRecordId } from 'pbtsdb/core'
import { refusalMessage } from '../lib/record-refusals'
import { errorStatus, SERVER_UNREACHED, writeRefusalText } from '../lib/refusal'
import { recipientLabel } from '../lib/statement-recipients'
import { type CreateStatementsValues, statementAddress } from '../lib/statement-schema'
import {
    type SavedStatement,
    type StatementRunOutcome,
    useStatementsStore,
} from '../stores/statements-store'
import { type StatementSendRequest, useStatementSend } from './useStatementSend'

type StatementsCollection = ReturnType<typeof useStore<['books_statements']>>[0]

type Recipient = CreateStatementsValues['recipients'][number]

type StartedInsert = {
    id: string
    customer: string
    email: string
    tx: ReturnType<typeof startInsert> | null
    error: unknown
}

// The send route's text for a statement it did not send (server/statement_routes.go,
// msgStatementNotSent), for a stored row its answer does not name.
const NOT_SENT = 'The email could not be sent. Try again.'

// One ticked customer after the store: its stored row's id, number and address, or the
// server's text of the refused store. The number is read once, when the insert settles
// and the row is surely in the store: the create screen has no live query on
// `books_statements`, so a later reload can drop the row.
type StoredRecipient = {
    customer: string
    id: string
    number: string
    email: string
    failure: string | null
}

// What a run gives the create screen: its outcome, and the customers that went through
// (stored on Save, stored and sent on Save and send), whose ticks the screen clears so a
// second press repeats only the failed rows (statements spec §3.4).
export type StatementRun = { outcome: StatementRunOutcome; succeeded: string[] }

// Starts the insert of one statement. The server sets the number, the sequence, the balance
// and the currency, so the row holds only what the run chose (statements spec §4.5).
function startInsert(
    statements: StatementsCollection,
    values: CreateStatementsValues,
    id: string,
    recipient: Recipient
) {
    const hasPeriod = values.type === 'balance_forward'
    return statements.insert({
        id,
        customer: recipient.customer,
        type: values.type,
        statement_date: values.statementDate,
        start_date: hasPeriod ? values.startDate : '',
        end_date: hasPeriod ? values.endDate : '',
        email: statementAddress(recipient.email),
    })
}

// The server's text for one refused write: its own message, else its field messages; a
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
 * Save and Save and send of the create screen (statements spec §3.4, §4.5).
 *
 * The store is one `books_statements` insert for each ticked customer, all in parallel; the
 * server stores them one after the other and numbers each. A refused insert does not stop
 * the others, and its customer is not sent. `saveAndSend` then sends the stored rows, each
 * to its address, in one request (useStatementSend, which files the sent rows).
 *
 * A failed send never makes a new statement: the store keeps each customer's stored,
 * unsent statement (`saved`), a later run inserts nothing for such a customer, and Save and
 * send sends that statement again to the row's current address; a send that succeeds drops
 * the entry. A refused store keeps no entry, so the next run stores that customer again.
 *
 * A run holds the screen (stores/statements-store.ts) from before the first insert until
 * it ends, and clears the last run's outcome when it starts. It resolves to its outcome,
 * read from the settled transactions and the send's answer, and to the customers that went
 * through. When a part failed, the outcome goes to the store for the run notice.
 * `sendRequest` replaces the send route's network call (a test's fake).
 */
export function useCreateStatements(options: { sendRequest?: StatementSendRequest } = {}) {
    const [statements, customers] = useStore('books_statements', 'books_customers')
    const statementSend = useStatementSend({ request: options.sendRequest })

    // The name of a failed customer in the run notice, read once when the run ends; the
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

    const store = useMutation({
        // A generator that yields one promise over every insert settled: core's
        // drainTransactions awaits a yielded array with Promise.all, which rejects at the
        // first refusal, so the others' outcome could not be read after it.
        mutationFn: function* (values: CreateStatementsValues) {
            const ticked = values.recipients.filter(recipient => recipient.ticked)
            const started: StartedInsert[] = ticked.map(recipient => {
                const id = newRecordId()
                const base = {
                    id,
                    customer: recipient.customer,
                    email: statementAddress(recipient.email),
                }
                try {
                    return {
                        ...base,
                        tx: startInsert(statements, values, id, recipient),
                        error: null,
                    }
                } catch (error) {
                    return { ...base, tx: null, error }
                }
            })
            yield Promise.allSettled(started.map(({ tx }) => tx?.when('settled')))
            const stored: StoredRecipient[] = started.map(insert => {
                const refusal = refusalOf(insert)
                const failure = refusal === null ? null : failureText(refusal.error)
                const number = statements.get(insert.id)?.number ?? ''
                return {
                    customer: insert.customer,
                    id: insert.id,
                    number,
                    email: insert.email,
                    failure,
                }
            })
            return stored
        },
    })

    type Failure = StatementRunOutcome['failed'][number]

    const failedOf = (
        customer: string,
        message: string,
        saved: SavedStatement | null = null
    ): Failure => ({
        customer,
        name: nameOf(customer),
        message,
        saved,
    })

    // The saved statement of a stored row whose send failed, with the number read when
    // its insert settled.
    const savedOf = (row: StoredRecipient): SavedStatement => ({
        id: row.id,
        number: row.number,
    })

    // Sends the stored rows and reads which customers went out. A refusal of the whole
    // request fails every stored row with its text.
    const sendStored = async (stored: StoredRecipient[]) => {
        const items = stored.map(row => ({ id: row.id, to: row.email }))
        const failedRow = (row: StoredRecipient, text: string) =>
            failedOf(row.customer, text, savedOf(row))
        let answer: Awaited<ReturnType<typeof statementSend.send>>
        try {
            answer = await statementSend.send(items)
        } catch (error) {
            const text = failureText(error)
            return { sent: [], failures: stored.map(row => failedRow(row, text)) }
        }
        const rowOf = new Map(stored.map(row => [row.id, row]))
        const sentIds = new Set(answer.sent.map(row => row.id))
        // An id this run did not send names no customer of it: it is logged and left out.
        const failures = answer.failed.flatMap(failure => {
            const row = rowOf.get(failure.id)
            if (row === undefined) {
                log.warn('books.statements.send', 'answer names a statement not sent', {
                    id: failure.id,
                })
                return []
            }
            return [failedRow(row, failure.message)]
        })
        // A stored row the answer names in neither list was not sent.
        const answered = new Set([...sentIds, ...answer.failed.map(failure => failure.id)])
        for (const row of stored) {
            if (!answered.has(row.id)) failures.push(failedRow(row, NOT_SENT))
        }
        const sent = stored.filter(row => sentIds.has(row.id)).map(row => row.customer)
        return { sent, failures }
    }

    // The saved statements after a send: a sent customer's entry goes, a failed send of a
    // stored row keeps (or adds) its entry.
    const keepUnsent = (sent: readonly string[], failures: readonly Failure[]) => {
        const next = { ...useStatementsStore.getState().saved }
        for (const customer of sent) delete next[customer]
        for (const failure of failures) {
            if (failure.saved !== null) next[failure.customer] = failure.saved
        }
        useStatementsStore.getState().setSaved(next)
    }

    const runWith = async (
        intent: StatementRunOutcome['intent'],
        values: CreateStatementsValues
    ): Promise<StatementRun> => {
        const runStore = useStatementsStore.getState()
        runStore.clear()
        runStore.hold()
        try {
            // A ticked customer with a statement this screen saved and did not send stores
            // nothing again: its saved statement is sent to the address now in its row
            // (statements spec §3.4).
            const savedBefore = useStatementsStore.getState().saved
            const ticked = values.recipients.filter(recipient => recipient.ticked)
            const toStore = ticked.filter(
                recipient => savedBefore[recipient.customer] === undefined
            )
            const alreadySaved: StoredRecipient[] = ticked.flatMap(recipient => {
                const saved = savedBefore[recipient.customer]
                if (saved === undefined) return []
                const email = statementAddress(recipient.email)
                return [
                    {
                        customer: recipient.customer,
                        id: saved.id,
                        number: saved.number,
                        email,
                        failure: null,
                    },
                ]
            })
            const settled =
                toStore.length === 0
                    ? []
                    : await store.mutateAsync({ ...values, recipients: toStore })
            const storeFailures = settled.flatMap(row =>
                row.failure === null ? [] : [failedOf(row.customer, row.failure)]
            )
            const stored = [...alreadySaved, ...settled.filter(row => row.failure === null)]
            let succeeded = stored.map(row => row.customer)
            let failed = storeFailures
            if (intent === 'send' && stored.length > 0) {
                const sending = await sendStored(stored)
                keepUnsent(sending.sent, sending.failures)
                succeeded = sending.sent
                failed = [...storeFailures, ...sending.failures]
            }
            const outcome: StatementRunOutcome = {
                intent,
                done: succeeded.length,
                total: ticked.length,
                failed,
            }
            if (failed.length > 0) useStatementsStore.getState().setOutcome(outcome)
            return { outcome, succeeded }
        } finally {
            useStatementsStore.getState().release()
        }
    }

    const save = (values: CreateStatementsValues) => runWith('save', values)
    const saveAndSend = (values: CreateStatementsValues) => runWith('send', values)

    return { save, saveAndSend, isSaving: store.isPending || statementSend.isSending }
}
