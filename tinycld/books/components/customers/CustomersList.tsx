import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useCustomerActions } from '../../hooks/useCustomerActions'
import { useCustomerNavigation } from '../../hooks/useCustomerNavigation'
import { useCustomersList } from '../../hooks/useCustomersList'
import { type CustomerRecord, useCustomersQuery } from '../../hooks/useCustomersQuery'
import { useRecordRowMenus } from '../../hooks/useRecordRowMenus'
import {
    CUSTOMER_MENU_LABELS,
    CUSTOMER_MENU_TEST_IDS,
    type CustomerMenuItem,
    customerMenuItems,
} from '../../lib/customer-actions'
import { CUSTOMER_INDENT, customerListCopy } from '../../lib/customer-display'
import { CUSTOMERS_PATH } from '../../lib/customer-route'
import { partyTitle } from '../../lib/party-list'
import { useCustomerFormStore } from '../../stores/customer-form-store'
import { PartyList } from '../party/PartyList'
import { DeleteCustomerDialog } from './DeleteCustomerDialog'

const LOAD_ERROR = 'Could not load customers'

// Only a top-level customer can take sub-customers (one level).
const customerItemsFor = (customer: CustomerRecord, canWrite: boolean) =>
    customerMenuItems({ isTopLevel: customer.parent === '', inactive: customer.inactive }, canWrite)

// The Customers list. The open customer (`openId`, from the URL) is marked on the
// panel surface, where the list stays in view beside it.
export function CustomersList({ openId }: { openId: string }) {
    const navigation = useCustomerNavigation()
    const { canWrite } = useBooksAccess()
    // The one actions instance lives here, so the list's banner and the Delete customer
    // dialog read the same refusals.
    const actions = useCustomerActions()
    const menus = useRecordRowMenus<CustomerRecord, CustomerMenuItem>({
        actions,
        store: useCustomerFormStore,
        openId,
        listPath: CUSTOMERS_PATH,
        navigation,
        canWrite,
        itemsFor: customerItemsFor,
        titleOf: partyTitle,
        onExtra: (customer, item) => {
            if (item === 'add-sub') navigation.openNew(customer.id)
        },
        menu: {
            triggerPrefix: 'customer-menu',
            triggerLabel: 'Customer actions',
            labels: CUSTOMER_MENU_LABELS,
            testIds: CUSTOMER_MENU_TEST_IDS,
        },
    })
    const source = useCustomersQuery()
    const list = useCustomersList(source)
    const loadError = list.viewState === 'error' ? LOAD_ERROR : null
    // Unwrapped, the press event would reach `openNew(parentId?)` as a parent id.
    const openNew = () => navigation.openNew()
    const dialog = (
        <DeleteCustomerDialog
            customer={menus.deleteDialog.record}
            actions={actions}
            isOpenAndDirty={menus.deleteDialog.isOpenAndDirty}
            refusal={menus.deleteDialog.refusal}
            onClose={menus.deleteDialog.onClose}
            onDeleted={menus.deleteDialog.onDeleted}
        />
    )

    return (
        <PartyList
            listPrefix="customers"
            recordPrefix="customer"
            copy={customerListCopy(canWrite)}
            list={list}
            canWrite={canWrite}
            openId={openId}
            indentPx={CUSTOMER_INDENT}
            onOpen={navigation.open}
            onNew={openNew}
            onRetry={source.retry}
            menuFor={menus.menuFor}
            bannerMessage={menus.bannerMessage(loadError)}
            isLoadError={loadError !== null}
            onDismissBanner={menus.dismissRefusal}
            dialog={dialog}
        />
    )
}
