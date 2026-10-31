import { useStore } from '@tinycld/core/lib/pocketbase'
import { useWatch } from '@tinycld/core/ui/form'
import { CUSTOMER_HOST_KEY } from '../forms/hosts'
import {
    customerColumnsFrom,
    EMPTY_CUSTOMER_COLUMNS,
    EMPTY_CUSTOMER_FIELDS,
} from '../lib/customer-columns'
import { customerTitle } from '../lib/customer-display'
import { CUSTOMER_NOT_SAVED, CUSTOMER_SAVE_FAILED } from '../lib/customer-messages'
import { applyPatch } from '../lib/record-save'
import type { BooksCustomers } from '../types'
import { useCustomerNavigation } from './useCustomerNavigation'
import { useRecordForm } from './useRecordForm'
import { useRecordSave } from './useRecordSave'

// The edited record is the row `useRecord` holds for the route.
export type CustomerFormTarget =
    | { mode: 'new'; parentId: string }
    | { mode: 'edit'; record: BooksCustomers }

/**
 * The open customer's form. A new customer starts with the parent from `?parent` and
 * its shipping address folded into billing (null).
 */
export function useCustomerForm(target: CustomerFormTarget) {
    const record = target.mode === 'edit' ? target.record : undefined
    const parentId = target.mode === 'new' ? target.parentId : ''
    const base = useRecordForm({
        hostKey: CUSTOMER_HOST_KEY,
        logContext: 'books.customers',
        mode: target.mode,
        record,
        createValues: { ...EMPTY_CUSTOMER_FIELDS, parent: parentId },
    })
    // A new customer's title follows the Parent customer field, not `?parent`.
    const chosenParent = useWatch({ control: base.form.control, name: 'parent' })
    const { leave } = useCustomerNavigation()
    const [customersCollection] = useStore('books_customers')
    const saver = useRecordSave(
        {
            columnsFrom: customerColumnsFrom,
            emptyColumns: EMPTY_CUSTOMER_COLUMNS,
            insert: row => customersCollection.insert(row),
            update: (id, patch, fields) =>
                customersCollection.update(id, draft => applyPatch(draft, patch, fields)),
            logContext: 'books.customers',
            notSavedTitle: CUSTOMER_NOT_SAVED,
            clientSaveFailed: CUSTOMER_SAVE_FAILED,
        },
        {
            mode: target.mode,
            create: base.create,
            edit: base.edit,
            recordId: record?.id ?? '',
            leave,
            host: base.host,
            context: base.context,
        }
    )
    const title = customerTitle({
        mode: target.mode,
        isSubCustomer: typeof chosenParent === 'string' && chosenParent !== '',
        canWrite: base.canWrite,
    })
    return { ...base, ...saver, title }
}
