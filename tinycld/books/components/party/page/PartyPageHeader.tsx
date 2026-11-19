import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { DetailSurface } from '../../../lib/detail-surface'
import type { DocumentPartyKey } from '../../../lib/sales-document-kinds'
import { StatusBadge } from '../../StatusBadge'
import { PartyContactActions } from './PartyContactActions'

interface BackLinkProps {
    isVisible: boolean
    label: string
    onPress: () => void
    testIdPrefix: string
}

function BackLink({ isVisible, label, onPress, testIdPrefix }: BackLinkProps) {
    if (!isVisible) return null
    const accessibilityLabel = `Back to ${label.toLowerCase()}`
    const text = `‹ ${label}`
    return (
        <Pressable
            testID={`${testIdPrefix}-back`}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={onPress}
            className="-ml-1 min-h-11 justify-center self-start px-1"
        >
            <Text className="text-sm text-muted-foreground">{text}</Text>
        </Pressable>
    )
}

function InactiveBadge({ isVisible, testIdPrefix }: { isVisible: boolean; testIdPrefix: string }) {
    if (!isVisible) return null
    return <StatusBadge label="Inactive" tone="muted" testID={`${testIdPrefix}-inactive-badge`} />
}

interface NameRowProps {
    title: string
    email: string
    phone: string
    isInactive: boolean
    party: DocumentPartyKey
    testIdPrefix: string
    trailing: ReactNode
}

function NameRow({ title, email, phone, isInactive, party, testIdPrefix, trailing }: NameRowProps) {
    return (
        <View className="min-w-0 flex-row items-center gap-1">
            <Text
                testID={`${testIdPrefix}-title`}
                numberOfLines={2}
                className="shrink text-2xl font-semibold text-foreground"
            >
                {title}
            </Text>
            <PartyContactActions
                name={title}
                email={email}
                phone={phone}
                party={party}
                testIdPrefix={testIdPrefix}
            />
            <InactiveBadge isVisible={isInactive} testIdPrefix={testIdPrefix} />
            <View className="flex-1" />
            {trailing}
        </View>
    )
}

interface PartyPageHeaderProps {
    title: string
    email: string
    // The number the Call action dials ('' draws no Call).
    phone: string
    isInactive: boolean
    surface: DetailSurface
    // The list's name: "‹ <backLabel>" above the name on the page surface.
    backLabel: string
    onBack: () => void
    // The party's own lines under the name (company, address, parent).
    identity: ReactNode
    // The balance figures: to the right on a wide window, under the identity on a phone.
    right: ReactNode
    // The New transaction button: before More in the actions row on a wide window, full
    // width under the figures on a phone.
    action: ReactNode
    // The More menu: in the actions row on a wide window, at the top right on a phone.
    more: ReactNode
    party: DocumentPartyKey
    testIdPrefix: string
}

/**
 * Who the party is and how to reach them, and what the balance is. On the page surface a
 * "‹ <list>" back button sits above the name; beside the list (a very wide window) there
 * is none. On a phone the header stacks: name and icons with More as an icon at the top
 * right, the identity lines, the figures, then the full-width action. A `null` slot draws
 * nothing.
 */
export function PartyPageHeader({
    title,
    email,
    phone,
    isInactive,
    surface,
    backLabel,
    onBack,
    identity,
    right,
    action,
    more,
    party,
    testIdPrefix,
}: PartyPageHeaderProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const gutter = isPhone ? 'px-4' : 'px-6'
    const back = (
        <BackLink
            isVisible={surface === 'page'}
            label={backLabel}
            onPress={onBack}
            testIdPrefix={testIdPrefix}
        />
    )
    const nameProps = { title, email, phone, isInactive, party, testIdPrefix }
    if (isPhone) {
        // More stays at the top right when a long name wraps to a second line.
        const topRightMore = more === null ? null : <View className="self-start">{more}</View>
        return (
            <View testID={`${testIdPrefix}-header`} className={`gap-3 pb-4 pt-2 ${gutter}`}>
                <View className="gap-1">
                    {back}
                    <NameRow {...nameProps} trailing={topRightMore} />
                    {identity}
                </View>
                {right}
                {action}
            </View>
        )
    }
    return (
        <View testID={`${testIdPrefix}-header`} className={`gap-1 pb-4 pt-2 ${gutter}`}>
            {back}
            <View className="flex-row items-start justify-between gap-6">
                <View className="min-w-0 flex-1 gap-1">
                    <NameRow {...nameProps} trailing={null} />
                    {identity}
                </View>
                <View className="items-end gap-4">
                    {right}
                    <View className="flex-row items-start gap-2">
                        {action}
                        {more}
                    </View>
                </View>
            </View>
        </View>
    )
}
