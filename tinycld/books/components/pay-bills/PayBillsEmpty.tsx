import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { Text, View } from 'react-native'
import type { PayBillsList } from '../../lib/pay-bills-screen-state'
import { PAY_BILLS_MESSAGES } from '../../lib/pay-bills-texts'

const TAP = { minHeight: 44 }
const NEW_BILL_HREF = 'books/bills/new'

interface MessageProps {
    text: string
    testID: string
    action: string
    actionTestID: string
    isDisabled: boolean
    onAction: () => void
}

function ListMessage({ text, testID, action, actionTestID, isDisabled, onAction }: MessageProps) {
    return (
        <View testID={testID} className="items-start gap-3 py-6">
            <Text className="text-sm text-muted-foreground">{text}</Text>
            <Button
                testID={actionTestID}
                variant="outline"
                style={TAP}
                isDisabled={isDisabled}
                onPress={onAction}
            >
                <ButtonText>{action}</ButtonText>
            </Button>
        </View>
    )
}

interface PayBillsEmptyProps {
    list: PayBillsList
    onClearFilters: () => void
    isDisabled: boolean
}

/**
 * The list's empty states (spec §3.3 Empty): no open bill at all, with New bill; or the
 * filters hide every bill, with Clear filters. Nothing while rows show.
 */
export function PayBillsEmpty({ list, onClearFilters, isDisabled }: PayBillsEmptyProps) {
    const orgHref = useOrgHref()
    if (list === 'rows') return null
    if (list === 'empty') {
        const openNewBill = () => router.push(orgHref(NEW_BILL_HREF))
        return (
            <ListMessage
                text={PAY_BILLS_MESSAGES.noOpenBills}
                testID="pay-bills-empty"
                action="New bill"
                actionTestID="pay-bills-new-bill"
                isDisabled={isDisabled}
                onAction={openNewBill}
            />
        )
    }
    return (
        <ListMessage
            text={PAY_BILLS_MESSAGES.filterEmpty}
            testID="pay-bills-filter-empty"
            action="Clear filters"
            actionTestID="pay-bills-clear-filters"
            isDisabled={isDisabled}
            onAction={onClearFilters}
        />
    )
}
