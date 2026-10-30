import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { Dialog } from '@tinycld/core/ui/dialog'
import { Text } from 'react-native'
import type { useCustomerActions } from '../../hooks/useCustomerActions'
import type { CustomerRecord } from '../../hooks/useCustomersQuery'
import { type DeleteDecision, deleteDecision } from '../../lib/customer-actions'
import {
    HAS_SUB_CUSTOMERS_TITLE,
    SUB_CUSTOMERS_ACTIVE_FIRST,
    UNSAVED_DELETE_WARNING,
} from '../../lib/customer-messages'

type Actions = ReturnType<typeof useCustomerActions>

interface DeleteCustomerDialogProps {
    customer: CustomerRecord | null
    actions: Actions
    // The customer is open beside the list with unsaved edits, which the delete drops.
    isOpenAndDirty: boolean
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

type Confirm = { testID: string; label: string; isDestructive: boolean } | null

const CONFIRM: Record<DialogState, Confirm> = {
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

function DeleteCustomerBody({
    customer,
    actions,
    isOpenAndDirty,
    onClose,
    onDeleted,
}: DeleteCustomerDialogProps & { customer: CustomerRecord }) {
    const state = dialogStateFor(useSubCustomers(customer.id))
    const hasSubs = state === 'make-inactive' || state === 'close-only'
    // Only this customer's refusal; another customer's stays in the list's banner.
    const refusal = actions.actionError?.id === customer.id ? actions.actionError.message : null

    // A write in flight must finish before the dialog goes away.
    const dismiss = () => {
        if (!actions.isWorking) onClose()
    }

    const run = async () => {
        const isDone =
            state === 'make-inactive'
                ? await actions.setInactive(customer.id, true)
                : await actions.deleteCustomer(customer.id, onDeleted)
        if (isDone) onClose()
    }

    return (
        <Dialog
            isOpen
            onClose={dismiss}
            title="Delete customer"
            hasCloseButton={false}
            testID="delete-customer-dialog"
        >
            <Dialog.Body testID="delete-customer-dialog-body">
                <Line isVisible={hasSubs} className="text-sm font-medium text-foreground">
                    {HAS_SUB_CUSTOMERS_TITLE}
                </Line>
                <Line
                    isVisible={EXPLANATION[state] !== null}
                    className="text-sm text-muted-foreground"
                >
                    {EXPLANATION[state]}
                </Line>
                <Text className="text-sm text-foreground">{customer.display_name}</Text>
                <Line isVisible={isOpenAndDirty} className="text-sm text-foreground">
                    {UNSAVED_DELETE_WARNING}
                </Line>
                <ErrorLine message={state === 'check-failed' ? CHECK_FAILED : null} />
                <ErrorLine message={refusal} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    label={CLOSE_LABEL[state]}
                    onPress={dismiss}
                    isDisabled={actions.isWorking}
                    testID="delete-customer-close"
                />
                <ConfirmButton
                    confirm={CONFIRM[state]}
                    isDisabled={actions.isWorking}
                    onPress={run}
                />
            </Dialog.Footer>
        </Dialog>
    )
}

function ConfirmButton({
    confirm,
    isDisabled,
    onPress,
}: {
    confirm: Confirm
    isDisabled: boolean
    onPress: () => void
}) {
    if (!confirm) return null
    return (
        <Dialog.ActionButton
            testID={confirm.testID}
            label={confirm.label}
            onPress={onPress}
            isDisabled={isDisabled}
            isDestructive={confirm.isDestructive}
        />
    )
}

function Line({
    isVisible,
    className,
    children,
}: {
    isVisible: boolean
    className: string
    children: string | null
}) {
    if (!isVisible) return null
    return <Text className={className}>{children}</Text>
}

function ErrorLine({ message }: { message: string | null }) {
    if (!message) return null
    return (
        <Text accessibilityRole="alert" className="text-sm text-danger">
            {message}
        </Text>
    )
}
