import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useListFilters } from '../../hooks/useListFilters'
import { useRecordList } from '../../hooks/useRecordList'
import { useRecordRowMenus } from '../../hooks/useRecordRowMenus'
import { useShippedReportHref } from '../../hooks/useShippedReportHref'
import { useVendorActions } from '../../hooks/useVendorActions'
import { useVendorNavigation } from '../../hooks/useVendorNavigation'
import { useVendorsQuery, type VendorRecord } from '../../hooks/useVendorsQuery'
import type { ListLayout } from '../../lib/detail-surface'
import { partyTitle } from '../../lib/party-list'
import {
    RECORD_MENU_LABELS,
    type RecordMenuItem,
    recordMenuItems,
    recordMenuTestIds,
} from '../../lib/record-menu'
import {
    AP_AGING_SHIPPED_KEY,
    EXPENSES_BY_VENDOR_SHIPPED_KEY,
    FORM_1099_SHIPPED_KEY,
    OPEN_PURCHASE_ORDERS_SHIPPED_KEY,
    VENDOR_BALANCE_SHIPPED_KEY,
} from '../../lib/shipped-reports'
import { vendorListCopy } from '../../lib/vendor-display'
import { VENDOR_LOAD_ERROR } from '../../lib/vendor-messages'
import { VENDORS_PATH } from '../../lib/vendor-route'
import { useVendorFormStore } from '../../stores/vendor-form-store'
import { PartyList } from '../party/PartyList'
import { ShippedReportsMenu } from '../reports/ShippedReportsMenu'
import { DeleteVendorDialog } from './DeleteVendorDialog'

const VENDOR_MENU = {
    triggerPrefix: 'vendor-menu',
    triggerLabel: 'Vendor actions',
    labels: RECORD_MENU_LABELS,
    testIds: recordMenuTestIds('vendor'),
}

// The Vendors list. The open vendor (`openId`, from the URL) is marked on the panel
// surface, where the list stays in view beside it; beside a vendor page it shows the
// names only (`layout`). A row's Edit opens the vendor's page on its Details tab.
export function VendorsList({ openId, layout }: { openId: string; layout: ListLayout }) {
    const navigation = useVendorNavigation()
    const { canWrite } = useBooksAccess()
    // The one actions instance lives here, so the list's banner and the Delete vendor
    // dialog read the same refusals.
    const actions = useVendorActions()
    const menus = useRecordRowMenus<VendorRecord, RecordMenuItem>({
        actions,
        store: useVendorFormStore,
        openId,
        listPath: VENDORS_PATH,
        navigation,
        openEdit: navigation.openDetails,
        canWrite,
        itemsFor: recordMenuItems,
        titleOf: partyTitle,
        menu: VENDOR_MENU,
    })
    const filters = useListFilters()
    const source = useVendorsQuery(filters.listFilters)
    const list = useRecordList(filters, source)
    const loadError = list.viewState === 'error' ? VENDOR_LOAD_ERROR : null
    // Null while the report loads, when its read fails and when the reader has none:
    // then that item is not drawn (ShippedReportsMenu keeps only items with an href),
    // the list stays usable, and the live query shows the item once the report loads.
    const balanceHref = useShippedReportHref(VENDOR_BALANCE_SHIPPED_KEY)
    const agingHref = useShippedReportHref(AP_AGING_SHIPPED_KEY)
    const expensesHref = useShippedReportHref(EXPENSES_BY_VENDOR_SHIPPED_KEY)
    const form1099Href = useShippedReportHref(FORM_1099_SHIPPED_KEY)
    const openOrdersHref = useShippedReportHref(OPEN_PURCHASE_ORDERS_SHIPPED_KEY)
    const reportItems = [
        {
            key: VENDOR_BALANCE_SHIPPED_KEY,
            label: 'Vendor Balance',
            href: balanceHref,
            testID: 'vendors-reports-balance',
        },
        {
            key: AP_AGING_SHIPPED_KEY,
            label: 'A/P Aging',
            href: agingHref,
            testID: 'vendors-reports-aging',
        },
        {
            key: EXPENSES_BY_VENDOR_SHIPPED_KEY,
            label: 'Expenses by Vendor',
            href: expensesHref,
            testID: 'vendors-reports-expenses',
        },
        {
            key: FORM_1099_SHIPPED_KEY,
            label: '1099 Summary and Detail',
            href: form1099Href,
            testID: 'vendors-reports-1099',
        },
        {
            key: OPEN_PURCHASE_ORDERS_SHIPPED_KEY,
            label: 'Open Purchase Orders',
            href: openOrdersHref,
            testID: 'vendors-reports-purchase-orders',
        },
    ]
    // Undefined, not a menu that renders null, so the header draws no empty button group.
    const hasReport =
        balanceHref !== null ||
        agingHref !== null ||
        expensesHref !== null ||
        form1099Href !== null ||
        openOrdersHref !== null
    const reportsMenu = hasReport ? (
        <ShippedReportsMenu items={reportItems} testID="vendors-reports" />
    ) : undefined
    const dialog = (
        <DeleteVendorDialog
            vendor={menus.deleteDialog.record}
            actions={actions}
            isOpenAndDirty={menus.deleteDialog.isOpenAndDirty}
            refusal={menus.deleteDialog.refusal}
            onClose={menus.deleteDialog.onClose}
            onDeleted={menus.deleteDialog.onDeleted}
        />
    )

    return (
        <PartyList
            listPrefix="vendors"
            recordPrefix="vendor"
            copy={vendorListCopy(canWrite)}
            list={list}
            canWrite={canWrite}
            openId={openId}
            indentPx={0}
            onOpen={navigation.open}
            onNew={navigation.openNew}
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
