import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { View } from 'react-native'
import { type CustomerPageState, useCustomerPage } from '../../../hooks/useCustomerPage'
import { useDetailSurface } from '../../../hooks/useDetailSurface'
import { CUSTOMER_DISCARD_MESSAGE } from '../../../lib/customer-messages'
import { type CustomerTab, SHOWN_CUSTOMER_TABS } from '../../../lib/customer-page-tabs'
import type { DetailSurface } from '../../../lib/detail-surface'
import type { BooksCustomers } from '../../../types'
import { ListBanner } from '../../ListBanner'
import { NewTransactionMenu } from '../../party/page/NewTransactionMenu'
import { PartyBalance } from '../../party/page/PartyBalance'
import { PartyContactsTab } from '../../party/page/PartyContactsTab'
import { PartyDetailsTab } from '../../party/page/PartyDetailsTab'
import { PartyNotesTab } from '../../party/page/PartyNotesTab'
import { PartyPageHeader } from '../../party/page/PartyPageHeader'
import { PartyPageSaveBar } from '../../party/page/PartyPageSaveBar'
import { PartyTabs } from '../../party/page/PartyTabs'
import { DiscardDialog } from '../../RecordChild'
import { RecordSurface } from '../../RecordSurface'
import { CustomerIdentity } from './CustomerIdentity'
import { CustomerMoreMenu } from './CustomerMoreMenu'
import { CustomerTransactionsTab } from './CustomerTransactionsTab'

const PREFIX = 'customer'

interface TabBodyProps {
    tab: CustomerTab
    record: BooksCustomers
    page: CustomerPageState
    surface: DetailSurface
    rowClassName: string
    gutterClass: string
}

// Only the selected tab's body is mounted; the forms it edits live in the page.
function TabBody({ tab, record, page, surface, rowClassName, gutterClass }: TabBodyProps) {
    if (tab === 'transactions') {
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
    if (tab === 'contacts') {
        return (
            <PartyContactsTab
                party="customer"
                id={record.id}
                canWrite={page.canWrite}
                gutterClass={gutterClass}
                testIdPrefix={PREFIX}
            />
        )
    }
    if (tab === 'notes') {
        return (
            <PartyNotesTab
                notes={page.notes}
                readOnly={page.readOnly}
                rowClassName={rowClassName}
                testIdPrefix={PREFIX}
            />
        )
    }
    return (
        <PartyDetailsTab
            details={page.details}
            surface={surface}
            rowClassName={rowClassName}
            testIdPrefix={PREFIX}
        />
    )
}

// The page's gutter, and the left-aligned column the forms fill.
function columnsFor(isPhone: boolean) {
    if (isPhone) return { gutterClass: 'px-4', rowClassName: 'w-full px-4' }
    return { gutterClass: 'px-6', rowClassName: 'w-full max-w-[720px] px-6' }
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
                <TabBody
                    tab={page.tab}
                    record={record}
                    page={page}
                    surface={surface}
                    rowClassName={rowClassName}
                    gutterClass={gutterClass}
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
