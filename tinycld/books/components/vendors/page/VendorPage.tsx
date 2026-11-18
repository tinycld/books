import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { View } from 'react-native'
import { useDetailSurface } from '../../../hooks/useDetailSurface'
import { useVendorPage, type VendorPageState } from '../../../hooks/useVendorPage'
import type { DetailSurface } from '../../../lib/detail-surface'
import { VENDOR_DISCARD_MESSAGE } from '../../../lib/vendor-messages'
import { SHOWN_VENDOR_TABS } from '../../../lib/vendor-page-tabs'
import type { BooksVendors } from '../../../types'
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
import { VendorIdentity } from './VendorIdentity'
import { VendorMoreMenu } from './VendorMoreMenu'
import { VendorTransactionsTab } from './VendorTransactionsTab'

const PREFIX = 'vendor'

interface HeaderProps {
    record: BooksVendors
    page: VendorPageState
    surface: DetailSurface
    isPhone: boolean
}

// The shared header with the vendor's slots: its identity lines, balance, New transaction
// menu and More menu. Call uses the phone, else the mobile.
function VendorHeader({ record, page, surface, isPhone }: HeaderProps) {
    const { controls } = page
    const identity = <VendorIdentity record={record} />
    const balance = <PartyBalance party="vendor" id={record.id} testIdPrefix={PREFIX} />
    const newTransaction = (
        <NewTransactionMenu
            party="vendor"
            id={record.id}
            isVisible={controls.showNewTransaction}
            isDisabled={controls.newTransactionDisabled}
            isFullWidth={isPhone}
            isOpen={page.newMenuOpen}
            onOpenChange={page.setNewMenuOpen}
            testIdPrefix={PREFIX}
        />
    )
    const more = <VendorMoreMenu record={record} page={page} isPhone={isPhone} />
    const phone = record.phone || record.mobile
    return (
        <PartyPageHeader
            title={record.display_name}
            email={record.email}
            phone={phone}
            isInactive={record.inactive}
            surface={surface}
            backLabel="Vendors"
            onBack={page.navigation.leave}
            identity={identity}
            right={balance}
            action={newTransaction}
            more={more}
            party="vendor"
            testIdPrefix={PREFIX}
        />
    )
}

/**
 * One vendor's page: the header, the tabs and the selected tab's body, with the save bar
 * at the bottom while Details or Notes has unsaved edits. The forms and the leave guard
 * live here, above the surface chrome and the tabs, so neither a tab switch nor a window
 * crossing the panel width loses an edit.
 */
export function VendorPage({ record }: { record: BooksVendors }) {
    const surface = useDetailSurface()
    const isPhone = useBreakpoint() === 'mobile'
    const { gutterClass, rowClassName } = columnsFor(isPhone)
    const page = useVendorPage(record)
    const { navigation, actions } = page
    const header = <VendorHeader record={record} page={page} surface={surface} isPhone={isPhone} />
    const transactions = (
        <VendorTransactionsTab record={record} page={page} gutterClass={gutterClass} />
    )
    const dismissBanner = () => actions.clearActionError()
    const save = () => void page.save()
    return (
        <RecordSurface
            surface={surface}
            testIdPrefix={PREFIX}
            backLabel="Vendors"
            title={record.display_name}
            onLeave={navigation.leave}
            isLeaveDisabled={page.isDirty}
            surfaceRef={page.details.surfaceRef}
            header={header}
            footer={null}
        >
            <View className={gutterClass}>
                <ListBanner
                    testIdPrefix="vendor-action"
                    message={page.bannerMessage}
                    onDismiss={dismissBanner}
                    isFlush
                />
            </View>
            <PartyTabs
                tabs={SHOWN_VENDOR_TABS}
                selected={page.tab}
                onSelect={page.selectTab}
                gutterClass={gutterClass}
                testIdPrefix={PREFIX}
                shortcutGroup="Vendor"
            />
            <View className="flex-1">
                <PartyTabBody
                    tab={page.tab}
                    party="vendor"
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
            <DiscardDialog guard={page.guard} message={VENDOR_DISCARD_MESSAGE} />
            <DiscardDialog guard={page.cancelQuestion} message={VENDOR_DISCARD_MESSAGE} />
        </RecordSurface>
    )
}
