import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { View } from 'react-native'
import { type CustomerPageState, useCustomerPage } from '../../../hooks/useCustomerPage'
import { useDetailSurface } from '../../../hooks/useDetailSurface'
import { CUSTOMER_DISCARD_MESSAGE } from '../../../lib/customer-messages'
import { SHOWN_CUSTOMER_TABS } from '../../../lib/customer-page-tabs'
import type { DetailSurface } from '../../../lib/detail-surface'
import type { BooksCustomers } from '../../../types'
import { ListBanner } from '../../ListBanner'
import { NewTransactionMenu } from '../../party/page/NewTransactionMenu'
import { PartyBalance } from '../../party/page/PartyBalance'
import { PartyPageHeader } from '../../party/page/PartyPageHeader'
import { PartyPageSaveBar } from '../../party/page/PartyPageSaveBar'
import { PartyTabBody } from '../../party/page/PartyTabBody'
import { PartyTabs } from '../../party/page/PartyTabs'
import { columnsFor } from '../../party/page/party-page-layout'
import { DiscardDialog } from '../../RecordChild'
import { RecordSurface } from '../../RecordSurface'
import { CustomerIdentity } from './CustomerIdentity'
import { CustomerMoreMenu } from './CustomerMoreMenu'
import { CustomerTransactionsTab } from './CustomerTransactionsTab'

const PREFIX = 'customer'

interface TransactionsProps {
    record: BooksCustomers
    page: CustomerPageState
    gutterClass: string
}

// The customer's Transactions tab; its empty state's New transaction opens the header menu.
function TransactionsTab({ record, page, gutterClass }: TransactionsProps) {
    const openNewMenu = () => page.setNewMenuOpen(true)
    return (
        <CustomerTransactionsTab
            customerId={record.id}
            canWrite={page.canWrite}
            newTransactionDisabled={page.controls.newTransactionDisabled}
            onNewTransaction={openNewMenu}
            gutterClass={gutterClass}
        />
    )
}

interface HeaderProps {
    record: BooksCustomers
    page: CustomerPageState
    surface: DetailSurface
    isPhone: boolean
}

// The shared header with the customer's slots: its identity lines, balance, New
// transaction menu and More menu. Call uses the phone, else the mobile.
function CustomerHeader({ record, page, surface, isPhone }: HeaderProps) {
    const { navigation, controls } = page
    const identity = <CustomerIdentity record={record} onOpenParent={navigation.open} />
    const balance = <PartyBalance party="customer" id={record.id} testIdPrefix={PREFIX} />
    const newTransaction = (
        <NewTransactionMenu
            party="customer"
            id={record.id}
            isVisible={controls.showNewTransaction}
            isDisabled={controls.newTransactionDisabled}
            isFullWidth={isPhone}
            isOpen={page.newMenuOpen}
            onOpenChange={page.setNewMenuOpen}
            testIdPrefix={PREFIX}
        />
    )
    const more = <CustomerMoreMenu record={record} page={page} isPhone={isPhone} />
    const phone = record.phone || record.mobile
    return (
        <PartyPageHeader
            title={record.display_name}
            email={record.email}
            phone={phone}
            isInactive={record.inactive}
            surface={surface}
            backLabel="Customers"
            onBack={navigation.leave}
            identity={identity}
            right={balance}
            action={newTransaction}
            more={more}
            party="customer"
            testIdPrefix={PREFIX}
        />
    )
}

/**
 * One customer's page: the header, the tabs and the selected tab's body, with the save
 * bar at the bottom while Details or Notes has unsaved edits. The forms and the leave
 * guard live here, above the surface chrome and the tabs, so neither a tab switch nor a
 * window crossing the panel width loses an edit.
 */
export function CustomerPage({ record }: { record: BooksCustomers }) {
    const surface = useDetailSurface()
    const isPhone = useBreakpoint() === 'mobile'
    const { gutterClass, rowClassName } = columnsFor(isPhone)
    const page = useCustomerPage(record)
    const { navigation, actions } = page
    const header = (
        <CustomerHeader record={record} page={page} surface={surface} isPhone={isPhone} />
    )
    const transactions = <TransactionsTab record={record} page={page} gutterClass={gutterClass} />
    const dismissBanner = () => actions.clearActionError()
    const save = () => void page.save()
    return (
        <RecordSurface
            surface={surface}
            testIdPrefix={PREFIX}
            backLabel="Customers"
            title={record.display_name}
            onLeave={navigation.leave}
            isLeaveDisabled={page.isDirty}
            surfaceRef={page.details.surfaceRef}
            header={header}
            footer={null}
        >
            <View className={gutterClass}>
                <ListBanner
                    testIdPrefix="customer-action"
                    message={page.bannerMessage}
                    onDismiss={dismissBanner}
                    isFlush
                />
            </View>
            <PartyTabs
                tabs={SHOWN_CUSTOMER_TABS}
                selected={page.tab}
                onSelect={page.selectTab}
                gutterClass={gutterClass}
                testIdPrefix={PREFIX}
                shortcutGroup="Customer"
            />
            <View className="flex-1">
                <PartyTabBody
                    tab={page.tab}
                    party="customer"
                    id={record.id}
                    page={page}
                    transactions={transactions}
                    surface={surface}
                    rowClassName={rowClassName}
                    gutterClass={gutterClass}
                    testIdPrefix={PREFIX}
                />
            </View>
            <PartyPageSaveBar
                isVisible={page.isDirty}
                isSaving={page.isSaving}
                onSave={save}
                onCancel={page.cancel}
                rootError={page.rootError}
                gutterClass={gutterClass}
                testIdPrefix={PREFIX}
            />
            <DiscardDialog guard={page.guard} message={CUSTOMER_DISCARD_MESSAGE} />
            <DiscardDialog guard={page.cancelQuestion} message={CUSTOMER_DISCARD_MESSAGE} />
        </RecordSurface>
    )
}
