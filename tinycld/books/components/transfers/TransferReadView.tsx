import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { ReadyTransferDetail } from '../../hooks/useTransferDetail'
import { useTransferReadActions } from '../../hooks/useTransferReadActions'
import { stampText } from '../../lib/entry-display'
import { formatMoney } from '../../lib/money'
import { formatDay } from '../../lib/register-range'
import { EntryReadOnlyActions } from '../entries/EntryReadOnlyActions'
import { VoidDialog } from '../entries/VoidDialog'
import { FlowArrow } from './FlowArrow'
import { TransferHeader } from './TransferHeader'

// A transfer is corrected by Edit or Void; `reverse` is never among its actions.
function noReverse() {}

// A draft has no number until it is posted; only a reader sees a draft here.
function transferTitle(number: string): string {
    return number ? `Transfer ${number}` : 'Draft transfer'
}

function ReadAccount({ testID, name }: { testID: string; name: string }) {
    return (
        <Text testID={testID} className="text-base font-medium text-foreground">
            {name}
        </Text>
    )
}

interface ReadPairProps {
    fromName: string
    toName: string
    isWide: boolean
}

function ReadPair({ fromName, toName, isWide }: ReadPairProps) {
    const layout = isWide ? 'flex-row flex-wrap items-center gap-3' : 'gap-1'
    return (
        <View testID="transfer-read-pair" className={layout}>
            <ReadAccount testID="transfer-read-from" name={fromName} />
            <FlowArrow isWide={isWide} isInForm={false} />
            <ReadAccount testID="transfer-read-to" name={toName} />
        </View>
    )
}

function Detail({ id, label, value }: { id: string; label: string; value: string }) {
    if (value.trim() === '') return null
    return (
        <Text testID={`transfer-detail-${id}`} className="text-xs text-muted-foreground">
            {label}
            {'\n'}
            <Text className="text-sm text-foreground">{value}</Text>
        </Text>
    )
}

function Stamp({ testID, label, stamp }: { testID: string; label: string; stamp: string }) {
    if (stamp === '') return null
    return (
        <Text testID={testID} className="text-sm text-muted-foreground">
            {`${label} ${stamp}`}
        </Text>
    )
}

// Replace, not push: a pushed entry screen would stay mounted under this one.
function ViewEntryLink({ entryId }: { entryId: string }) {
    const orgHref = useOrgHref()
    return (
        <Pressable
            testID="transfer-view-entry"
            accessibilityRole="link"
            onPress={() => router.replace(orgHref(`books/entries/${entryId}`))}
            className="self-start"
            style={{ minHeight: 44, justifyContent: 'center' }}
        >
            <Text className="text-sm text-primary">View journal entry</Text>
        </Pressable>
    )
}

export function TransferReadView({ detail }: { detail: ReadyTransferDetail }) {
    const isWide = useBreakpoint() !== 'mobile'
    const { entry, accounts, currency } = detail
    const actions = useTransferReadActions(detail)
    const title = transferTitle(entry.number)
    const amountText = formatMoney(detail.amountCents, currency)
    const fromName = accounts.names.get(detail.from) ?? ''
    const toName = accounts.names.get(detail.to) ?? ''
    const dateText = formatDay(entry.date)
    const postedStamp = stampText(detail.postedByName, entry.posted_at)
    const voidStamp = entry.status === 'void' ? stampText(detail.voidedByName, entry.voided_at) : ''
    return (
        <View testID="transfer-read-only" className="min-w-0 flex-1 bg-background">
            <TransferHeader title={title} status={entry.status} amountText={amountText} />
            <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4">
                <View className="gap-3 rounded-xl border border-border bg-surface-secondary p-4">
                    <ReadPair fromName={fromName} toName={toName} isWide={isWide} />
                    <Detail id="date" label="Date" value={dateText} />
                    <Detail id="memo" label="Memo" value={entry.memo} />
                </View>
                <Stamp testID="transfer-posted-by" label="Posted by" stamp={postedStamp} />
                <Stamp testID="transfer-voided-by" label="Voided by" stamp={voidStamp} />
                <ViewEntryLink entryId={entry.id} />
            </ScrollView>
            <EntryReadOnlyActions
                isVisible
                isWide={isWide}
                actions={actions.actions}
                isBusy={actions.isVoiding}
                shortcutGroup="Transfer"
                onEdit={actions.onEdit}
                onReverse={noReverse}
                onVoid={actions.onVoid}
            />
            <VoidDialog
                isVisible={actions.isVoidOpen}
                entryNumber={actions.entryNumber}
                isPending={actions.isVoiding}
                errorMessage={actions.voidError}
                onConfirm={actions.confirmVoid}
                onCancel={actions.onClose}
            />
        </View>
    )
}
