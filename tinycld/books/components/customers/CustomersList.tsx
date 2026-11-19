import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useCustomerActions } from '../../hooks/useCustomerActions'
import { useCustomerNavigation } from '../../hooks/useCustomerNavigation'
import { type CustomerRecord, useCustomersQuery } from '../../hooks/useCustomersQuery'
import { useListFilters } from '../../hooks/useListFilters'
import { useRecordList } from '../../hooks/useRecordList'
import { useRecordRowMenus } from '../../hooks/useRecordRowMenus'
import { useShippedReportHref } from '../../hooks/useShippedReportHref'
import {
    CUSTOMER_MENU_LABELS,
    CUSTOMER_MENU_TEST_IDS,
    type CustomerMenuItem,
    customerMenuItems,
} from '../../lib/customer-actions'
import { CUSTOMER_INDENT, customerListCopy } from '../../lib/customer-display'
import { CUSTOMERS_PATH } from '../../lib/customer-route'
import type { ListLayout } from '../../lib/detail-surface'
import { partyTitle } from '../../lib/party-list'
import {
    AR_AGING_SHIPPED_KEY,
    CUSTOMER_BALANCE_SHIPPED_KEY,
    SALES_BY_CUSTOMER_SHIPPED_KEY,
} from '../../lib/shipped-reports'
import { useCustomerFormStore } from '../../stores/customer-form-store'
import { PartyList } from '../party/PartyList'
import { ShippedReportsMenu } from '../reports/ShippedReportsMenu'
import { DeleteCustomerDialog } from './DeleteCustomerDialog'

const LOAD_ERROR = 'Could not load customers'

// Only a top-level customer can take sub-customers (one level).
const customerItemsFor = (customer: CustomerRecord, canWrite: boolean) =>
    customerMenuItems({ isTopLevel: customer.parent === '', inactive: customer.inactive }, canWrite)

// The Customers list. The open customer (`openId`, from the URL) is marked on the
// panel surface, where the list stays in view beside it; beside a customer page it shows
// the names only (`layout`).
export function CustomersList({ openId, layout }: { openId: string; layout: ListLayout }) {
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
    const filters = useListFilters()
    const source = useCustomersQuery(filters.listFilters)
    const list = useRecordList(filters, source)
    const loadError = list.viewState === 'error' ? LOAD_ERROR : null
    // Unwrapped, the press event would reach `openNew(parentId?)` as a parent id.
    const openNew = () => navigation.openNew()
    // Each is null while its report loads, when its read fails and when the reader has
    // none: the menu then leaves its item out (no menu when all are null) and the list
    // stays usable; the live query shows it once it loads.
    const balanceHref = useShippedReportHref(CUSTOMER_BALANCE_SHIPPED_KEY)
    const agingHref = useShippedReportHref(AR_AGING_SHIPPED_KEY)
    const salesHref = useShippedReportHref(SALES_BY_CUSTOMER_SHIPPED_KEY)
    const reportItems = [
        {
            key: CUSTOMER_BALANCE_SHIPPED_KEY,
            label: 'Customer Balance',
            href: balanceHref,
            testID: 'customers-reports-balance',
        },
        {
            key: AR_AGING_SHIPPED_KEY,
            label: 'A/R Aging',
            href: agingHref,
            testID: 'customers-reports-aging',
        },
        {
            key: SALES_BY_CUSTOMER_SHIPPED_KEY,
            label: 'Sales by Customer',
            href: salesHref,
            testID: 'customers-reports-sales',
        },
    ]
    // Undefined, not a menu that renders null, so the header draws no empty button group.
    const hasReport = balanceHref !== null || agingHref !== null || salesHref !== null
    const reportsMenu = hasReport ? (
        <ShippedReportsMenu items={reportItems} testID="customers-reports" />
    ) : undefined
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
            headerAction={reportsMenu}
            layout={layout}
        />
    )
}
