import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import type { useCustomerActions } from '../../hooks/useCustomerActions'
import type { CustomerRecord } from '../../hooks/useCustomersQuery'
import { type DeleteDecision, deleteDecision } from '../../lib/customer-actions'
import {
    HAS_SUB_CUSTOMERS_TITLE,
    SUB_CUSTOMERS_ACTIVE_FIRST,
    UNSAVED_DELETE_WARNING,
} from '../../lib/customer-messages'
import {
    type DeleteDialogConfirm,
    type DeleteDialogLine,
    DeleteRecordDialog,
} from '../DeleteRecordDialog'

type Actions = ReturnType<typeof useCustomerActions>

interface DeleteCustomerDialogProps {
    customer: CustomerRecord | null
    actions: Actions
    // The customer is open beside the list with unsaved edits, which the delete drops.
    isOpenAndDirty: boolean
    // This customer's refusal, or null; another customer's stays in the list's banner.
    refusal: string | null
    onClose: () => void
    // Takes the user off the customer once the delete lands, if they still see it, and
    // says whether it did.
    onDeleted?: () => boolean
}

// The sub-customer query lives in the body, so a closed dialog costs nothing. The
// mutation state belongs to the list, which owns the one actions instance.
export function DeleteCustomerDialog({ customer, ...props }: DeleteCustomerDialogProps) {
    if (!customer) return null
    return <DeleteCustomerBody customer={customer} {...props} />
}

// Every sub-customer, active or not: the server refuses a delete while any exist.
function useSubCustomers(customerId: string) {
    const [customersCollection] = useStore('books_customers')
    const subs = useLiveQuery({
        query: query =>
            query
                .from({ sub: customersCollection })
                .where(({ sub }) => eq(sub.parent, customerId))
                .select(({ sub }) => ({ id: sub.id, inactive: sub.inactive })),
        queryKey: ['books.customers.delete-subs', customerId],
    })
    return { subs: subs.data ?? [], isReady: subs.isReady, isError: subs.isError }
}

// What the dialog can offer. Nothing but Close until the sub-customers are known, so a
// customer with sub-customers never shows a Delete for a moment, and nothing but Close
// when they cannot be known.
type DialogState = DeleteDecision | 'checking' | 'check-failed'

function dialogStateFor(subs: ReturnType<typeof useSubCustomers>): DialogState {
    if (subs.isError) return 'check-failed'
    if (!subs.isReady) return 'checking'
    return deleteDecision(subs.subs)
}

const CONFIRM: Record<DialogState, DeleteDialogConfirm> = {
    delete: { testID: 'delete-customer-confirm', label: 'Delete', isDestructive: true },
    'make-inactive': {
        testID: 'delete-customer-make-inactive',
        label: 'Make inactive',
        isDestructive: false,
    },
    'close-only': null,
    checking: null,
    'check-failed': null,
}

const EXPLANATION: Record<DialogState, string | null> = {
    delete: 'This cannot be undone.',
    'make-inactive':
        'It cannot be deleted while it has sub-customers. Make it inactive to hide it from lists.',
    'close-only': `It cannot be deleted while it has sub-customers. ${SUB_CUSTOMERS_ACTIVE_FIRST}, then make it inactive to hide it from lists.`,
    checking: null,
    'check-failed': null,
}

const CHECK_FAILED = "Could not check this customer's sub-customers. Close and try again."

// Close when nothing can be done here; Cancel when the dialog offers an action.
const CLOSE_LABEL: Record<DialogState, string> = {
    delete: 'Cancel',
    'make-inactive': 'Cancel',
    'close-only': 'Close',
    checking: 'Cancel',
    'check-failed': 'Close',
}

type LineInput = Omit<DeleteDialogLine, 'text'> & { text: string | null; isVisible: boolean }

// The dialog's lines in order; a line with no text or not visible is left out.
function linesOf(inputs: readonly LineInput[]): DeleteDialogLine[] {
    return inputs.flatMap(({ key, text, tone, isVisible }) =>
        isVisible && text ? [{ key, text, tone }] : []
    )
}

function DeleteCustomerBody({
    customer,
    actions,
    isOpenAndDirty,
    refusal,
    onClose,
    onDeleted,
}: DeleteCustomerDialogProps & { customer: CustomerRecord }) {
    const state = dialogStateFor(useSubCustomers(customer.id))
    const hasSubs = state === 'make-inactive' || state === 'close-only'
    const lines = linesOf([
        { key: 'has-subs', text: HAS_SUB_CUSTOMERS_TITLE, tone: 'title', isVisible: hasSubs },
        { key: 'explanation', text: EXPLANATION[state], tone: 'muted', isVisible: true },
        { key: 'name', text: customer.display_name, tone: 'plain', isVisible: true },
        {
            key: 'unsaved',
            text: UNSAVED_DELETE_WARNING,
            tone: 'plain',
            isVisible: isOpenAndDirty,
        },
        {
            key: 'check-failed',
            text: CHECK_FAILED,
            tone: 'error',
            isVisible: state === 'check-failed',
        },
        { key: 'refusal', text: refusal, tone: 'error', isVisible: true },
    ])

    const onConfirm = () =>
        state === 'make-inactive'
            ? actions.setInactive(customer.id, true)
            : actions.deleteRecord(customer.id, onDeleted)

    return (
        <DeleteRecordDialog
            testIdPrefix="delete-customer"
            title="Delete customer"
            lines={lines}
            confirm={CONFIRM[state]}
            closeLabel={CLOSE_LABEL[state]}
            isWorking={actions.isWorking}
            onClose={onClose}
            onConfirm={onConfirm}
        />
    )
}
