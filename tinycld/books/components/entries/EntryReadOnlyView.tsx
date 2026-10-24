import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { ReadyEntryDetail } from '../../hooks/useEntryDetail'
import { entryNumberText, reversalSummary, stampText } from '../../lib/entry-display'
import { sumLines } from '../../lib/entry-lines'
import { formatDay } from '../../lib/register-range'
import { EntryHeader } from './EntryHeader'
import { EntryLineCard } from './EntryLineCard'
import { EntryLineTable } from './EntryLineTable'
import { EntryStatusBadge } from './EntryStatusBadge'
import { EntryTotals } from './EntryTotals'

// The label and value are one Text so the row reads as one phrase ("Posted by Dana, Sep 30 4:12 PM").
function Detail({
    id,
    label,
    valueId,
    children,
}: {
    id: string
    label: string
    valueId?: string
    children: ReactNode
}) {
    return (
        <Text testID={`entry-detail-${id}`} className="text-xs text-muted-foreground">
            {label}
            {'\n'}
            <Text testID={valueId} className="text-sm text-foreground">
                {children}
            </Text>
        </Text>
    )
}

function Stamp({
    id,
    label,
    userName,
    at,
}: {
    id: string
    label: string
    userName: string | undefined
    at: string
}) {
    const text = stampText(userName, at)
    if (text === '') return null
    return (
        <Detail id={id} label={label}>
            {text}
        </Detail>
    )
}

// Replace, not push: a stacked screen stays mounted under the new one, so two entries would share one page.
function EntryLink({ id, text, entryId }: { id: string; text: string; entryId: string }) {
    const orgHref = useOrgHref()
    return (
        <Pressable
            testID={id}
            accessibilityRole="link"
            onPress={() => router.replace(orgHref(`books/entries/${entryId}`))}
            style={{ minHeight: 44, justifyContent: 'center' }}
        >
            <Text className="text-sm text-primary">{text}</Text>
        </Pressable>
    )
}

function LinkRows({ detail }: { detail: ReadyEntryDetail }) {
    const { entry, reversesEntry, reversedBy, replacesEntry } = detail
    const { linkText } = reversalSummary(reversedBy, entry.auto_reverse_on)
    const links: ReactNode[] = []
    if (entry.reverses) {
        links.push(
            <EntryLink
                key="reverses"
                id="entry-link-reverses"
                entryId={entry.reverses}
                text={`Reverses ${reversesEntry?.number ?? '…'}`}
            />
        )
    }
    if (reversedBy && linkText) {
        links.push(
            <EntryLink
                key="reversed-by"
                id="entry-link-reversed-by"
                entryId={reversedBy.id}
                text={linkText}
            />
        )
    }
    if (entry.replaces) {
        links.push(
            <EntryLink
                key="replaces"
                id="entry-link-replaces"
                entryId={entry.replaces}
                text={`Replaces ${replacesEntry?.number ?? '…'}`}
            />
        )
    }
    return <View className="flex-row flex-wrap gap-x-6">{links}</View>
}

function DetailFields({ detail }: { detail: ReadyEntryDetail }) {
    const { entry } = detail
    const autoReverseText =
        reversalSummary(detail.reversedBy, entry.auto_reverse_on).autoReverseText ?? 'None'
    return (
        <View className="gap-3">
            <View className="flex-row flex-wrap gap-x-6 gap-y-3">
                <Detail id="date" label="Date">
                    {formatDay(entry.date)}
                </Detail>
                <Detail id="auto-reverse" label="Auto-reverse on" valueId="entry-auto-reverse">
                    {autoReverseText}
                </Detail>
                <Stamp
                    id="posted-by"
                    label="Posted by"
                    userName={detail.postedByName}
                    at={entry.posted_at}
                />
                <Stamp
                    id="voided-by"
                    label="Voided by"
                    userName={detail.voidedByName}
                    at={entry.voided_at}
                />
            </View>
            <LinkRows detail={detail} />
            <Detail id="memo" label="Memo">
                {entry.memo}
            </Detail>
        </View>
    )
}

function Lines({ detail, isWide }: { detail: ReadyEntryDetail; isWide: boolean }) {
    const { lines, accountNames, currency } = detail
    if (isWide)
        return <EntryLineTable lines={lines} accountNames={accountNames} currency={currency} />
    const cards = lines.map((line, index) => (
        <EntryLineCard
            key={line.id}
            line={line}
            index={index}
            accountNames={accountNames}
            currency={currency}
        />
    ))
    return <View testID="entry-lines">{cards}</View>
}

export function EntryReadOnlyView({ detail }: { detail: ReadyEntryDetail }) {
    const isWide = useBreakpoint() !== 'mobile'
    const { entry, currency } = detail
    const number = entryNumberText(entry)
    const title = entry.number ? `Journal entry ${number}` : 'Journal entry'
    const totals = sumLines(
        detail.lines.map(line => ({ debit: centsText(line.debit), credit: centsText(line.credit) }))
    )
    return (
        <View testID="entry-read-only" className="min-w-0 flex-1 bg-background">
            <EntryHeader
                title={title}
                badge={<EntryStatusBadge status={entry.status} />}
                bigTotal={entry.total}
                currency={currency}
            />
            <ScrollView className="flex-1" contentContainerClassName="gap-4 py-4">
                <View className="px-4">
                    <DetailFields detail={detail} />
                </View>
                <Lines detail={detail} isWide={isWide} />
            </ScrollView>
            <EntryTotals totals={totals} currency={currency} />
        </View>
    )
}

// sumLines reads amount text; whole cents become "d.cc" without a float division.
function centsText(cents: number): string {
    const whole = Math.floor(cents / 100)
    return `${whole}.${String(cents % 100).padStart(2, '0')}`
}
