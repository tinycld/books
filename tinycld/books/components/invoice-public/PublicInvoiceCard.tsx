import { OrgLogo } from '@tinycld/core/components/OrgLogo'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import { usePublicPdfDownload } from '../../hooks/usePublicPdfDownload'
import {
    INVOICE_PUBLIC_TEXTS,
    type InvoicePublicState,
    invoiceDateLineOf,
    invoiceDueLine,
    invoicePublicHeadingOf,
    invoicePublicPath,
    invoiceReplacedTextOf,
    invoiceVoidTextOf,
    openReplacementLabelOf,
} from '../../lib/invoice-public'
import { formatMoney } from '../../lib/money'
import { todayIso } from '../../lib/register-range'
import type { BooksInvoicePublic } from '../../types'
import { PublicCardSurface } from '../public/PublicFrame'

const TAP = { minHeight: 44 }

export type InvoicePublicView = {
    row: BooksInvoicePublic
    state: InvoicePublicState
    business: string
}

// Core OrgLogo draws an initials avatar when the deployment has no logo; the page shows
// a logo only when one is set.
function CardLogo() {
    const { org } = useOrgInfo()
    const logoUrl = org?.logoUrl ?? ''
    if (logoUrl === '') return null
    return (
        <View className="items-center">
            <OrgLogo org={org} size={48} />
        </View>
    )
}

function BusinessName({ name }: { name: string }) {
    return (
        <Text
            testID="invoice-public-business"
            accessibilityRole="header"
            className="text-center text-lg font-semibold text-foreground"
        >
            {name}
        </Text>
    )
}

function TotalUnder({ row, isVisible }: { row: BooksInvoicePublic; isVisible: boolean }) {
    if (!isVisible) return null
    const text = `Total ${formatMoney(row.total, row.currency)}`
    return (
        <Text testID="invoice-public-total" className="text-center text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

function PaidBlock({ row, isVisible }: { row: BooksInvoicePublic; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className="items-center gap-1">
            <Text
                testID="invoice-public-paid"
                className="mt-3 text-center text-3xl font-semibold text-success"
            >
                {INVOICE_PUBLIC_TEXTS.paid}
            </Text>
            <TotalUnder row={row} isVisible />
        </View>
    )
}

// The balance is the largest text of the page (spark 1); the total shows under it once a
// part is paid.
function BalanceBlock({ row, isVisible }: { row: BooksInvoicePublic; isVisible: boolean }) {
    if (!isVisible) return null
    const balance = formatMoney(row.balance, row.currency)
    const isPartPaid = row.balance !== row.total
    return (
        <View className="items-center gap-1">
            <Text className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
                {INVOICE_PUBLIC_TEXTS.balanceLabel}
            </Text>
            <Text
                testID="invoice-public-balance"
                className="text-center text-3xl font-semibold text-foreground tabular-nums"
            >
                {balance}
            </Text>
            <TotalUnder row={row} isVisible={isPartPaid} />
        </View>
    )
}

function DueText({ row }: { row: BooksInvoicePublic }) {
    const due = invoiceDueLine(row, todayIso())
    if (due.text === '') return null
    const dueClass = due.isOverdue ? 'text-destructive' : 'text-muted-foreground'
    return (
        <Text testID="invoice-public-due" className={dueClass}>
            {due.text}
        </Text>
    )
}

function DatesLine({ row }: { row: BooksInvoicePublic }) {
    const date = invoiceDateLineOf(row)
    const separator = row.due_date === '' ? '' : ' · '
    return (
        <Text testID="invoice-public-dates" className="text-center text-sm text-muted-foreground">
            {date}
            {separator}
            <DueText row={row} />
        </Text>
    )
}

function CardMessage({ text }: { text: string }) {
    if (text.trim() === '') return null
    return (
        <Text
            testID="invoice-public-message"
            className="border-t border-border pt-4 text-sm text-foreground"
        >
            {text}
        </Text>
    )
}

function DownloadPdf({ token, number }: { token: string; number: string }) {
    const download = usePublicPdfDownload('invoice', token, number)
    return (
        <Button testID="invoice-public-pdf" variant="link" style={TAP} onPress={download}>
            <ButtonText>{INVOICE_PUBLIC_TEXTS.downloadPdf}</ButtonText>
        </Button>
    )
}

// Open, overdue or paid: the heading, the amount, the dates, the message and the PDF.
function OpenCard({ view, isVisible }: { view: InvoicePublicView; isVisible: boolean }) {
    if (!isVisible) return null
    const { row, state, business } = view
    const heading = invoicePublicHeadingOf(row)
    const isPaid = state === 'paid'
    return (
        <PublicCardSurface testID="invoice-public">
            <CardLogo />
            <BusinessName name={business} />
            <View className="items-center gap-1">
                <Text
                    testID="invoice-public-heading"
                    className="text-center text-sm text-muted-foreground"
                >
                    {heading}
                </Text>
                <PaidBlock row={row} isVisible={isPaid} />
                <BalanceBlock row={row} isVisible={!isPaid} />
                <DatesLine row={row} />
            </View>
            <CardMessage text={row.message} />
            <DownloadPdf token={row.token} number={row.number} />
        </PublicCardSurface>
    )
}

// One press moves to the replacement's own page; a chain of edits takes one press a step.
function ReplacementButton({ row, isVisible }: { row: BooksInvoicePublic; isVisible: boolean }) {
    const router = useRouter()
    if (!isVisible) return null
    const label = openReplacementLabelOf(row.replaced_by_number)
    const onPress = () => router.replace(invoicePublicPath(row.replaced_by_token))
    return (
        <Button testID="invoice-public-open-replacement" style={TAP} onPress={onPress}>
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}

// Void: one sentence, no amounts and no PDF. Replaced: the forward to the replacement.
function VoidCard({ view, isVisible }: { view: InvoicePublicView; isVisible: boolean }) {
    if (!isVisible) return null
    const { row, state, business } = view
    const isReplaced = state === 'replaced'
    const text = isReplaced
        ? invoiceReplacedTextOf(row.replaced_by_number)
        : invoiceVoidTextOf(business)
    const testID = isReplaced ? 'invoice-public-replaced' : 'invoice-public-void'
    return (
        <PublicCardSurface testID={testID}>
            <CardLogo />
            <BusinessName name={business} />
            <Text className="text-center text-base text-foreground">{text}</Text>
            <ReplacementButton row={row} isVisible={isReplaced} />
        </PublicCardSurface>
    )
}

// The one card of the customer's invoice page (email-share spec §3.5). There is no action
// for the customer: no payment and no reply form.
export function PublicInvoiceCard({ view }: { view: InvoicePublicView }) {
    const isVoid = view.state === 'void' || view.state === 'replaced'
    return (
        <>
            <OpenCard view={view} isVisible={!isVoid} />
            <VoidCard view={view} isVisible={isVoid} />
        </>
    )
}
