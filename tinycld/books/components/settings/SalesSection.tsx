import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { useBooksSettings } from '../../hooks/useBooksSettings'
import { useDepositAccounts } from '../../hooks/useDepositAccounts'
import { SALES_RECEIPT_MESSAGES } from '../../lib/document-texts'
import { defaultMessageReadOnlyText, salesDepositReadOnlyText } from '../../lib/sales-settings'
import type { BooksSettings } from '../../types'
import { DefaultMessageForm } from './DefaultMessageForm'
import { SalesDepositForm } from './SalesDepositForm'
import { ReadOnlyRow, SectionCard } from './SectionCard'

type DepositAccounts = ReturnType<typeof useDepositAccounts>

function DepositLoadError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View
            accessibilityRole="alert"
            className="flex-row flex-wrap items-center gap-3"
            testID="books-settings-sales-deposit-error"
        >
            <Text className="text-sm text-danger">{SALES_RECEIPT_MESSAGES.depositLoadFailed}</Text>
            <Button
                size="sm"
                variant="outline"
                testID="books-settings-sales-deposit-retry"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

// The read-only "Sales deposited to": a set account is named only once the accounts are
// read, so the row never shows a guess. When the read failed, it says "An account" next to
// the load error and its Retry.
function depositReadOnlyValue(storedId: string, deposit: DepositAccounts): string {
    if (storedId !== '' && deposit.isError) return salesDepositReadOnlyText(storedId, [])
    if (storedId !== '' && !deposit.isReady) return 'Loading…'
    return salesDepositReadOnlyText(storedId, deposit.rows)
}

interface CardsProps {
    settings: BooksSettings
    deposit: DepositAccounts
    onRetry: () => void
}

function SalesReadOnly({ settings, deposit, onRetry }: CardsProps) {
    const depositText = depositReadOnlyValue(settings.sales_deposit_account ?? '', deposit)
    const messageText = defaultMessageReadOnlyText(settings.default_customer_message ?? '')
    return (
        <View className="gap-4">
            <SectionCard title="Sales receipts">
                <ReadOnlyRow
                    label="Sales deposited to"
                    value={depositText}
                    testID="books-settings-sales-deposit-readonly"
                />
                <DepositLoadError isVisible={deposit.isError} onRetry={onRetry} />
            </SectionCard>
            <SectionCard title="Invoices and sales receipts">
                <ReadOnlyRow
                    label="Default message to customer"
                    value={messageText}
                    multiline
                    testID="books-settings-default-message-readonly"
                />
            </SectionCard>
        </View>
    )
}

function SalesForms({ settings, deposit, onRetry }: CardsProps) {
    return (
        <View className="gap-4">
            <SectionCard title="Sales receipts">
                <View className="gap-4">
                    <SalesDepositForm settings={settings} deposit={deposit} />
                    <DepositLoadError isVisible={deposit.isError} onRetry={onRetry} />
                </View>
            </SectionCard>
            <SectionCard title="Invoices and sales receipts">
                <DefaultMessageForm settings={settings} />
            </SectionCard>
        </View>
    )
}

/**
 * Settings → Sales (spec §3.11): "Sales deposited to" and "Default message to customer".
 * Every Books user sees it; an admin edits each card on its own Save (the books_settings
 * update rule is admin-only), others see read-only rows.
 */
export function SalesSection({ isAdmin }: { isAdmin: boolean }) {
    const { settings } = useBooksSettings()
    const deposit = useDepositAccounts()
    if (!settings) return null
    const retry = () => {
        void recoverLiveQueries({
            ...deposit.recovery,
            onError: error => log.error('books.settings', error),
        })
    }
    if (!isAdmin) return <SalesReadOnly settings={settings} deposit={deposit} onRetry={retry} />
    return <SalesForms settings={settings} deposit={deposit} onRetry={retry} />
}
