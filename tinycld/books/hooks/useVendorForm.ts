import { useStore } from '@tinycld/core/lib/pocketbase'
import type { RecordChildState } from '../components/RecordChild'
import { VENDOR_HOST_KEY } from '../forms/hosts'
import { recordTitle } from '../lib/record-display'
import { applyPatch } from '../lib/record-save'
import { EMPTY_VENDOR_COLUMNS, EMPTY_VENDOR_FIELDS, vendorColumnsFrom } from '../lib/vendor-columns'
import { VENDOR_SAVE_TEXTS } from '../lib/vendor-messages'
import type { BooksVendors } from '../types'
import { useRecordForm } from './useRecordForm'
import { useRecordSave } from './useRecordSave'
import { useVendorNavigation } from './useVendorNavigation'

// The edited record is the row `useRecord` holds for the route.
export type VendorFormTarget = { mode: 'new' } | { mode: 'edit'; record: BooksVendors }

/** The open vendor's form. A new vendor starts from every field empty. */
export function useVendorForm(target: VendorFormTarget): RecordChildState {
    const record = target.mode === 'edit' ? target.record : undefined
    const base = useRecordForm({
        hostKey: VENDOR_HOST_KEY,
        logContext: 'books.vendors',
        mode: target.mode,
        record,
        createValues: EMPTY_VENDOR_FIELDS,
    })
    const { leave } = useVendorNavigation()
    const [vendorsCollection] = useStore('books_vendors')
    const saver = useRecordSave(
        {
            columnsFrom: vendorColumnsFrom,
            emptyColumns: EMPTY_VENDOR_COLUMNS,
            // Until the 1099 keys join VendorColumns, the row useRecordSave passes has no
            // 1099 type, and pbtsdb's insert needs every column, so the spread supplies
            // them. The vendor form's 1099 fields make this spread redundant.
            insert: row => vendorsCollection.insert({ ...EMPTY_VENDOR_COLUMNS, ...row }),
            update: (id, patch, fields) =>
                vendorsCollection.update(id, draft => applyPatch(draft, patch, fields)),
            ...VENDOR_SAVE_TEXTS,
        },
        {
            mode: target.mode,
            create: base.create,
            edit: base.edit,
            recordId: record?.id ?? '',
            leave,
        }
    )
    return {
        ...base,
        ...saver,
        title: recordTitle('vendor', { mode: target.mode, canWrite: base.canWrite }),
    }
}
