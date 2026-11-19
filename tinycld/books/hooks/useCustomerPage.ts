import { selectRecordTab } from '../components/RecordTabs'
import {
    CUSTOMER_TAB_ORDER,
    type CustomerTab,
    customerPageControls,
    DEFAULT_CUSTOMER_TAB,
} from '../lib/customer-page-tabs'
import { CUSTOMERS_PATH } from '../lib/customer-route'
import { useCustomerFormStore } from '../stores/customer-form-store'
import type { BooksCustomers } from '../types'
import { useCustomerActions } from './useCustomerActions'
import { type CustomerPageSave, useCustomerForm } from './useCustomerForm'
import { useCustomerNavigation } from './useCustomerNavigation'
import { usePartyPage } from './usePartyPage'

// One function for the page's life, so the tab strip's keys stay registered as they are.
function selectCustomerTab(key: CustomerTab) {
    selectRecordTab(DEFAULT_CUSTOMER_TAB, key)
}

function useCustomerDetails(record: BooksCustomers, followUps: CustomerPageSave) {
    return useCustomerForm({ mode: 'edit', record }, followUps)
}

/**
 * The customer page's state (`usePartyPage`): the customer's Details form, form store,
 * navigation, list actions and page controls.
 */
export function useCustomerPage(record: BooksCustomers) {
    const navigation = useCustomerNavigation()
    const actions = useCustomerActions()
    return usePartyPage({
        party: 'customer',
        record,
        listPath: CUSTOMERS_PATH,
        tabOrder: CUSTOMER_TAB_ORDER,
        selectTab: selectCustomerTab,
        useDetails: useCustomerDetails,
        store: useCustomerFormStore,
        navigation,
        actions,
        controlsFor: access =>
            customerPageControls({
                ...access,
                inactive: record.inactive,
                isTopLevel: record.parent === '',
            }),
    })
}

export type CustomerPageState = ReturnType<typeof useCustomerPage>
