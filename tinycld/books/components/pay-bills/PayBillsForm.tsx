import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { ScrollView, View } from 'react-native'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { usePayBillsForm } from '../../hooks/usePayBillsForm'
import { usePayBillsSave } from '../../hooks/usePayBillsSave'
import type { PayBillsScreenData } from '../../hooks/usePayBillsScreen'
import { usePayBillsShortcuts } from '../../hooks/usePayBillsShortcuts'
import { creditsOfVendors } from '../../hooks/useUnappliedVendorCredits'
import {
    PAY_BILLS_KEY_DESCRIPTIONS,
    PAY_BILLS_SAVE_DESCRIPTION,
} from '../../lib/pay-bills-shortcuts'
import { PAY_BILLS_MESSAGES } from '../../lib/pay-bills-texts'
import { PAYMENT_FORM_KEYS } from '../../lib/payment-shortcuts'
import { rootErrorOnly } from '../../lib/root-errors'
import { DocumentBar, type DocumentBarAction } from '../documents/DocumentActionBar'
import { DocumentHeader } from '../documents/DocumentHeader'
import { DiscardDialog } from '../entries/DiscardDialog'
import { EntryBackLink } from '../entries/EntryHeader'
import { EntryLeaveContext } from '../entries/EntryLeaveContext'
import { ClearPaymentsLink } from '../payments/ClearPaymentsLink'
import { PayBillsBand } from './PayBillsBand'
import { PayBillsCreditsNotice } from './PayBillsCreditsNotice'
import { PayBillsOpenBills } from './PayBillsOpenBills'
import { PayBillsSummary } from './PayBillsSummary'

// The bar (spec §3.5): wide Cancel (Esc), Pay & new (⌘⇧↵), Pay (⌘↵, primary); phone
// Cancel, Pay, More (Pay & new, whose ⌘⇧↵ usePayBillsShortcuts registers there). Pay and
// Pay & new are server actions, so they, their keys and the More row are idle offline.
// On `?replaces` (spec §3.6): Cancel (Esc) and Save (⌘↵, primary, a server action).
function barActionsOf(
    mode: 'new' | 'replaces',
    onCancel: () => void,
    onPay: () => void,
    onPayAndNew: () => void
): DocumentBarAction[] {
    if (mode === 'replaces') {
        return [
            {
                id: 'cancel',
                label: PAY_BILLS_KEY_DESCRIPTIONS.cancel,
                keys: PAYMENT_FORM_KEYS.cancel,
                onPress: onCancel,
            },
            {
                id: 'save',
                label: PAY_BILLS_SAVE_DESCRIPTION,
                keys: PAYMENT_FORM_KEYS.post,
                onPress: onPay,
                isPrimary: true,
                isServerAction: true,
            },
        ]
    }
    return [
        {
            id: 'cancel',
            label: PAY_BILLS_KEY_DESCRIPTIONS.cancel,
            keys: PAYMENT_FORM_KEYS.cancel,
            onPress: onCancel,
        },
        {
            id: 'pay-new',
            label: PAY_BILLS_KEY_DESCRIPTIONS.postAndNew,
            keys: PAYMENT_FORM_KEYS.postAndNew,
            onPress: onPayAndNew,
            isServerAction: true,
            wideOnly: true,
        },
        {
            id: 'pay',
            label: PAY_BILLS_KEY_DESCRIPTIONS.post,
            keys: PAYMENT_FORM_KEYS.post,
            onPress: onPay,
            isPrimary: true,
            isServerAction: true,
        },
    ]
}

interface PayBillsFormProps {
    screen: PayBillsScreenData
    scopeOwner: ScopeOwner
}

/**
 * The Pay Bills form (spec §3.2–§3.5): header with Total payment, the band, the filters,
 * the notice of unapplied vendor credits (vendor credit spec §3.10; after the filters, so
 * its links are Tab stops between the filters and the first row) and the open bills, Clear
 * payments, the summary with the balance lines, and the bar,
 * with the Discard dialog. Every text, list and handler comes from the hooks.
 */
export function PayBillsForm({ screen, scopeOwner }: PayBillsFormProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const payForm = usePayBillsForm({
        rows: screen.rows,
        vendorOptions: screen.vendorOptions,
        currency: screen.currency,
        today: screen.today,
        startBill: screen.startBill,
        startVendor: screen.startVendor,
        mode: screen.mode,
        original: screen.original,
    })
    const backToEntries = useBackToEntries()
    const save = usePayBillsSave({
        form: payForm.form,
        rows: payForm.listRows,
        currency: screen.currency,
        focusPaidFrom: payForm.focusPaidFrom,
        resetFilters: payForm.resetFilters,
        leaveFallback: backToEntries.onBack,
        replaces: screen.original?.payment ?? null,
    })
    const isBusy = save.isPending || payForm.isHolding
    const pay = () => void save.pay()
    const payAndNew = () => void save.payAndNew()
    const barActions = barActionsOf(screen.mode, save.cancel, pay, payAndNew)
    const shortcuts = usePayBillsShortcuts({
        scopeOwner,
        canWrite: screen.canWrite,
        isPending: isBusy,
        isDialogOpen: save.isDiscardOpen,
        mode: screen.mode,
        hasShownRows: payForm.hasShownRows,
        hasPaidRows: payForm.hasPaidRows,
        isPhone,
        run: {
            payAll: payForm.onTickAll,
            toggleRow: payForm.onRowToggle,
            postAndNew: payAndNew,
        },
    })
    // The notice lists the unapplied credits of the vendors of the shown bills.
    const shownVendors = new Set(payForm.shown.map(row => row.vendor))
    const shownCredits = creditsOfVendors(screen.unappliedCredits, shownVendors)
    const creditsNotice = (
        <PayBillsCreditsNotice isVisible={shownCredits.length > 0} credits={shownCredits} />
    )
    const summaryErrors = rootErrorOnly(payForm.form.formState.errors)
    const hasRows = payForm.list === 'rows'
    const isClearDisabled = isBusy || !shortcuts.offered.includes('clearPayments')
    const isSummaryVisible = payForm.list !== 'empty'
    return (
        <EntryLeaveContext.Provider value={save.cancel}>
            <View testID="pay-bills-form" className="min-w-0 flex-1 bg-background">
                <ScrollView
                    className="flex-1"
                    contentContainerClassName="gap-4 px-4 pt-2 pb-6"
                    keyboardShouldPersistTaps="handled"
                >
                    <EntryBackLink />
                    <DocumentHeader
                        title={screen.title}
                        status="draft"
                        figure={payForm.figureText}
                        isExpired={false}
                        isBadgeHidden
                    />
                    <FormErrorSummary
                        errors={summaryErrors}
                        title={null}
                        variant="destructive"
                        showFieldNames={false}
                        testID="pay-bills-error-summary"
                        isEnabled
                    />
                    <PayBillsBand
                        payForm={payForm}
                        currency={screen.currency}
                        isPhone={isPhone}
                        isDisabled={isBusy}
                    />
                    <PayBillsOpenBills
                        payForm={payForm}
                        currency={screen.currency}
                        today={screen.today}
                        isDisabled={isBusy}
                        notice={creditsNotice}
                    />
                    <ClearPaymentsLink
                        isVisible={hasRows}
                        isDisabled={isClearDisabled}
                        onPress={payForm.onClear}
                        scopeOwner={scopeOwner}
                        linkRef={payForm.clearRef}
                    />
                    <PayBillsSummary
                        payForm={payForm}
                        isPhone={isPhone}
                        isVisible={isSummaryVisible}
                    />
                </ScrollView>
                <DocumentBar
                    actions={barActions}
                    isSaving={isBusy}
                    isPhone={isPhone}
                    scopeOwner={scopeOwner}
                />
                <DiscardDialog
                    title={PAY_BILLS_MESSAGES.discard}
                    isVisible={save.isDiscardOpen}
                    onDiscard={save.discard}
                    onKeepEditing={save.keepEditing}
                />
            </View>
        </EntryLeaveContext.Provider>
    )
}
