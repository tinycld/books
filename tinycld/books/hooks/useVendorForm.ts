import { useStore } from '@tinycld/core/lib/pocketbase'
import type { RecordChildState } from '../components/RecordChild'
import { VENDOR_HOST_KEY } from '../forms/hosts'
import { recordTitle } from '../lib/record-display'
import { applyPatch } from '../lib/record-save'
import { EMPTY_VENDOR_COLUMNS, EMPTY_VENDOR_FIELDS, vendorColumnsFrom } from '../lib/vendor-columns'
import { VENDOR_SAVE_TEXTS } from '../lib/vendor-messages'
import type { BooksVendors } from '../types'
import { useRecordForm } from './useRecordForm'
import { type RecordSaveFollowUps, useRecordSave } from './useRecordSave'
import { useVendorNavigation } from './useVendorNavigation'

// The edited record is the row `useRecord` holds for the route.
export type VendorFormTarget = { mode: 'new' } | { mode: 'edit'; record: BooksVendors }

// What the vendor page does after its Details save, in place of leaving.
export type VendorPageSave = Pick<RecordSaveFollowUps, 'afterEdit' | 'afterWrite' | 'onRefused'>

/**
 * The open vendor's form. A new vendor starts from every field empty; its Save opens the
 * new vendor's page (a replace of `vendors/new`). An existing vendor's form is the vendor
 * page's Details, which passes what follows its save (`page`).
 */
export function useVendorForm(
    target: VendorFormTarget,
    page: VendorPageSave = {}
): RecordChildState {
    const record = target.mode === 'edit' ? target.record : undefined
    const base = useRecordForm({
        hostKey: VENDOR_HOST_KEY,
        logContext: 'books.vendors',
        mode: target.mode,
        record,
        createValues: EMPTY_VENDOR_FIELDS,
    })
    const navigation = useVendorNavigation()
    const [vendorsCollection] = useStore('books_vendors')
    const followUps: RecordSaveFollowUps =
        target.mode === 'new'
            ? { afterCreate: id => navigation.open(id) }
            : {
                  afterEdit: page.afterEdit,
                  afterWrite: page.afterWrite,
                  onRefused: page.onRefused,
              }
    const saver = useRecordSave(
        {
            columnsFrom: vendorColumnsFrom,
            emptyColumns: EMPTY_VENDOR_COLUMNS,
            insert: row => vendorsCollection.insert(row),
            update: (id, patch, fields) =>
                vendorsCollection.update(id, draft => applyPatch(draft, patch, fields)),
            ...VENDOR_SAVE_TEXTS,
        },
        {
            mode: target.mode,
            create: base.create,
            edit: base.edit,
            recordId: record?.id ?? '',
            leave: navigation.leave,
            host: base.host,
            context: base.context,
            ...followUps,
        }
    )
    return {
        ...base,
        ...saver,
        title: recordTitle('vendor', { mode: target.mode, canWrite: base.canWrite }),
    }
}
