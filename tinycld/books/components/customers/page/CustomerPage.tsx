import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { View } from 'react-native'
import { type CustomerPageState, useCustomerPage } from '../../../hooks/useCustomerPage'
import { useDetailSurface } from '../../../hooks/useDetailSurface'
import { CUSTOMER_DISCARD_MESSAGE } from '../../../lib/customer-messages'
import type { CustomerTab } from '../../../lib/customer-page-tabs'
import type { DetailSurface } from '../../../lib/detail-surface'
import type { BooksCustomers } from '../../../types'
import { ListBanner } from '../../ListBanner'
import { DiscardDialog } from '../../RecordChild'
import { RecordSurface } from '../../RecordSurface'
import { CustomerBalance } from './CustomerBalance'
import { CustomerDetailsTab } from './CustomerDetailsTab'
import { CustomerNotesTab } from './CustomerNotesTab'
import { CustomerPageHeader } from './CustomerPageHeader'
import { CustomerPageSaveBar } from './CustomerPageSaveBar'
import { CustomerTabs } from './CustomerTabs'
import { CustomerTransactionsTab } from './CustomerTransactionsTab'
import { NewTransactionMenu } from './NewTransactionMenu'

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
    if (tab === 'notes') {
        return (
            <CustomerNotesTab
                notes={page.notes}
                readOnly={page.readOnly}
                rowClassName={rowClassName}
            />
        )
    }
    return (
        <CustomerDetailsTab details={page.details} surface={surface} rowClassName={rowClassName} />
    )
}

// The page's gutter, and the left-aligned column the forms fill.
function columnsFor(isPhone: boolean) {
    if (isPhone) return { gutterClass: 'px-4', rowClassName: 'w-full px-4' }
    return { gutterClass: 'px-6', rowClassName: 'w-full max-w-[720px] px-6' }
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
    const { navigation, actions, controls } = page
    const balance = <CustomerBalance customerId={record.id} />
    const newTransaction = (
        <NewTransactionMenu
            customerId={record.id}
            isVisible={controls.showNewTransaction}
            isDisabled={controls.newTransactionDisabled}
            isFullWidth={isPhone}
            isOpen={page.newMenuOpen}
            onOpenChange={page.setNewMenuOpen}
        />
    )
    const header = (
        <CustomerPageHeader
            record={record}
            surface={surface}
            right={balance}
            action={newTransaction}
            page={page}
        />
    )
    const dismissBanner = () => actions.clearActionError()
    const save = () => void page.save()
    return (
        <RecordSurface
            surface={surface}
            testIdPrefix="customer"
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
            <CustomerTabs selected={page.tab} onSelect={page.selectTab} gutterClass={gutterClass} />
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
            <CustomerPageSaveBar
                isVisible={page.isDirty}
                isSaving={page.isSaving}
                onSave={save}
                onCancel={page.cancel}
                rootError={page.rootError}
                gutterClass={gutterClass}
            />
            <DiscardDialog guard={page.guard} message={CUSTOMER_DISCARD_MESSAGE} />
            <DiscardDialog guard={page.cancelQuestion} message={CUSTOMER_DISCARD_MESSAGE} />
        </RecordSurface>
    )
}
