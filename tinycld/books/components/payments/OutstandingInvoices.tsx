import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { filterRowsByNumber, type OutstandingRow } from '../../lib/payment-allocation'
import type { PaymentFlow } from '../../lib/payment-flow'
import { fillPaymentText, PAYMENT_MESSAGES } from '../../lib/payment-texts'
import { OutstandingCards } from './OutstandingCards'
import { OutstandingGrid, type OutstandingGridProps, tickAllState } from './OutstandingGrid'

export type OutstandingListMode = 'no-party' | 'loading' | 'error' | 'none' | 'rows'

export function outstandingListMode(input: {
    party: string
    isReady: boolean
    isError: boolean
    rowCount: number
}): OutstandingListMode {
    if (input.party === '') return 'no-party'
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    return input.rowCount === 0 ? 'none' : 'rows'
}

function ListSkeleton({ flow }: { flow: PaymentFlow }) {
    const bars = [0, 1, 2].map(index => (
        <View key={index} className="flex-row items-center gap-3 border-b border-border py-3">
            <View className="h-5 w-5 rounded bg-muted" />
            <View className="h-4 flex-1 rounded bg-muted" />
            <View className="h-4 w-24 rounded bg-muted" />
            <View className="h-9 w-32 rounded bg-muted" />
        </View>
    ))
    return (
        <View
            testID={`${flow.testId}-${flow.ids.listLoading}`}
            accessibilityLabel={flow.texts.listLoadingLabel}
        >
            {bars}
        </View>
    )
}

// The Books error banner (ListBanner's look) with Retry.
function ListError({ flow, onRetry }: { flow: PaymentFlow; onRetry: () => void }) {
    return (
        <View
            testID={`${flow.testId}-${flow.ids.listError}`}
            accessibilityRole="alert"
            className="flex-row items-center gap-2 rounded-lg border border-danger-soft-foreground bg-danger-soft px-3 py-1"
        >
            <Text className="min-w-0 flex-1 text-sm text-danger">{flow.texts.listLoadFailed}</Text>
            <Button
                testID={`${flow.testId}-list-retry`}
                variant="outline"
                size="sm"
                style={{ minHeight: 44 }}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function ListMessage({ text, testID }: { text: string; testID: string }) {
    return (
        <Text testID={testID} className="py-6 text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

// The no-documents state's button (the vendor refund's "New vendor credit"); nothing where
// the flow has none.
function NoDocumentsButton({ flow, partyId }: { flow: PaymentFlow; partyId: string }) {
    const orgHref = useOrgHref()
    const hrefOf = flow.texts.noDocumentsHref
    if (hrefOf === null) return null
    const open = () => router.push(orgHref(hrefOf(partyId)))
    return (
        <Button
            testID={`${flow.testId}-new-${flow.documentParam}`}
            variant="outline"
            style={{ minHeight: 44 }}
            onPress={open}
            className="self-start"
        >
            <ButtonText>{flow.texts.noDocumentsLabel}</ButtonText>
        </Button>
    )
}

// The party has no open document: the flow's note, and its button where it has one.
function NoDocuments({
    flow,
    partyId,
    partyName,
}: {
    flow: PaymentFlow
    partyId: string
    partyName: string
}) {
    const text = flow.texts.noDocuments(partyName)
    const testID = `${flow.testId}-${flow.ids.listEmpty}`
    if (flow.texts.noDocumentsHref === null) return <ListMessage text={text} testID={testID} />
    return (
        <View className="gap-2 py-6">
            <Text testID={testID} className="text-sm text-muted-foreground">
                {text}
            </Text>
            <NoDocumentsButton flow={flow} partyId={partyId} />
        </View>
    )
}

// The find field's place above the rows: its own width on a wide list, the list's width
// over cards. Nothing for a flow with no find field.
function FindSlot({ field, isFullWidth }: { field: ReactNode | null; isFullWidth: boolean }) {
    if (field === null) return null
    const style = isFullWidth ? undefined : FIND_WIDE
    return <View style={style}>{field}</View>
}

const FIND_WIDE = { width: 260 }

// The list's props: every listed row; the list draws those the find filter keeps.
export type OutstandingListProps = Omit<OutstandingGridProps, 'tickAll'>

interface OutstandingInvoicesProps {
    flow: PaymentFlow
    mode: OutstandingListMode
    partyId: string
    partyName: string
    onRetry: () => void
    // The received payment's Find invoice no. field, and its filter text; null and '' for
    // a flow with none.
    findField: ReactNode | null
    filterText: string
    list: OutstandingListProps
}

// The rows the find filter keeps, and every row with a message under its Payment cell, so
// a refusal is never hidden.
function shownRows(list: OutstandingListProps, filterText: string): OutstandingRow[] {
    const kept = new Set(filterRowsByNumber(list.rows, filterText).map(row => row.id))
    return list.rows.filter(row => kept.has(row.id) || (list.rowErrors[row.id] ?? '') !== '')
}

/**
 * The list area of the payment form (spec §3.3, §3.5): the flow's find field where it has
 * one, then with no party the flow's prompt, while loading a skeleton of three rows, a
 * failed read the error banner with Retry, a party with no open document the flow's note
 * (with its button where it has one), else the rows the find text keeps: a grid, or cards
 * while the list's own width is below the grid's least width (`doc.gridMinWidth`). A find
 * text that keeps no row says so.
 */
export function OutstandingInvoices({
    flow,
    mode,
    partyId,
    partyName,
    onRetry,
    findField,
    filterText,
    list,
}: OutstandingInvoicesProps) {
    const { width, onLayout } = useContainerWidth()
    const isCards = width > 0 && width < list.doc.gridMinWidth
    const drawn = {
        ...list,
        rows: shownRows(list, filterText),
        tickAll: tickAllState(list.rows, list.payments, list.currency),
    }
    const body = listBody({
        flow,
        mode,
        partyId,
        partyName,
        onRetry,
        grid: drawn,
        isCards,
        filterText: filterText.trim(),
    })
    return (
        <View testID={`${flow.testId}-outstanding`} className="gap-3" onLayout={onLayout}>
            <Text className="text-sm font-semibold text-foreground">{flow.texts.listHeading}</Text>
            <FindSlot field={findField} isFullWidth={isCards} />
            {body}
        </View>
    )
}

function listBody({
    flow,
    mode,
    partyId,
    partyName,
    onRetry,
    grid,
    isCards,
    filterText,
}: {
    flow: PaymentFlow
    mode: OutstandingListMode
    partyId: string
    partyName: string
    onRetry: () => void
    grid: OutstandingGridProps
    isCards: boolean
    // The find text, trimmed.
    filterText: string
}) {
    if (mode === 'no-party') {
        return (
            <ListMessage
                text={flow.texts.listPrompt}
                testID={`${flow.testId}-${flow.ids.listPrompt}`}
            />
        )
    }
    if (mode === 'loading') return <ListSkeleton flow={flow} />
    if (mode === 'error') return <ListError flow={flow} onRetry={onRetry} />
    if (mode === 'none') {
        return <NoDocuments flow={flow} partyId={partyId} partyName={partyName} />
    }
    if (grid.rows.length === 0) {
        const text = fillPaymentText(PAYMENT_MESSAGES.filterEmpty, filterText)
        return <ListMessage text={text} testID={`${flow.testId}-filter-empty`} />
    }
    if (isCards) return <OutstandingCards {...grid} />
    return <OutstandingGrid {...grid} />
}
