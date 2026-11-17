import { Pressable, Text, View } from 'react-native'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import type { UnappliedVendorCredit } from '../../hooks/useUnappliedVendorCredits'
import { unappliedCreditText } from '../../lib/pay-bills-texts'
import { VENDOR_CREDIT_KIND } from '../../lib/sales-document-kinds'

const TAP = { minHeight: 44 }

// One credit: "Vendor credit 1002 · Office Supply World · $50.00 unapplied", a link that
// opens the credit (pushed, so Back returns to Pay Bills with its filters).
function CreditLink({ credit }: { credit: UnappliedVendorCredit }) {
    const open = useOpenDocument(VENDOR_CREDIT_KIND, credit.id)
    const text = unappliedCreditText(credit)
    return (
        <Pressable
            testID={`pay-bills-credit-${credit.id}`}
            accessibilityRole="link"
            onPress={open}
            className="justify-center self-start"
            style={TAP}
        >
            <Text className="text-sm text-primary underline">{text}</Text>
        </Pressable>
    )
}

interface PayBillsCreditsNoticeProps {
    // False with no credit to list.
    isVisible: boolean
    // The unapplied credits of the shown bills' vendors, in the order to list them.
    credits: readonly UnappliedVendorCredit[]
}

/**
 * Pay Bills' notice of unapplied vendor credits (vendor credit spec §3.10), above the open
 * bills: one link row per posted credit with a balance of a vendor that has a shown open
 * bill. Nothing when there is none. Its read is one of the screen's reads, so the screen's
 * loading state, load error and Retry cover it.
 */
export function PayBillsCreditsNotice({ isVisible, credits }: PayBillsCreditsNoticeProps) {
    if (!isVisible) return null
    const links = credits.map(credit => <CreditLink key={credit.id} credit={credit} />)
    return (
        <View
            testID="pay-bills-credits-notice"
            className="gap-1 rounded-xl border border-border bg-surface-secondary px-4 py-2"
        >
            {links}
        </View>
    )
}
