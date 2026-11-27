import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { formatDateTime } from '../../lib/entry-display'

// The parts a payment read view (receive-payment §3.7, pay-bills §3.8) is drawn from.

export const READ_BAND = 'rounded-xl border border-border bg-surface-secondary p-4'
const TAP = { minHeight: 44 }

export function Detail({ label, value, testID }: { label: string; value: string; testID: string }) {
    if (value === '') return null
    return (
        <View testID={testID} className="min-w-0 max-w-full gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <Text className="text-sm text-foreground">{value}</Text>
        </View>
    )
}

export function TextLink({
    text,
    onPress,
    testID,
}: {
    text: string
    onPress: () => void
    testID: string
}) {
    return (
        <Pressable
            testID={testID}
            accessibilityRole="link"
            onPress={onPress}
            className="justify-center self-start"
            style={TAP}
        >
            <Text className="text-sm text-primary underline">{text}</Text>
        </Pressable>
    )
}

export function Stamp({ text, testID }: { text: string; testID: string }) {
    if (text === '') return null
    return (
        <Text testID={testID} className="text-xs text-muted-foreground">
            {text}
        </Text>
    )
}

/**
 * "<Verb> by <name>, <date time>"; "<Verb> <date time>" when no person did it (an
 * adjustment Books made), so the date never reads as the person. Empty with no time.
 */
export function stampOf(verb: string, userName: string | undefined, at: string): string {
    const when = formatDateTime(at)
    if (when === '') return ''
    return userName ? `${verb} by ${userName}, ${when}` : `${verb} ${when}`
}

interface ReplacedByProps {
    // The payment that replaced this one; nothing shows when there is none.
    replacement: { id: string; number: string } | undefined
    // The read view route of the replacement: 'books/payments' or 'books/bill-payments'.
    routeBase: string
    testID: string
}

/** "Replaced by 1004 (edited)" on a replaced original: a link to the correction. */
export function ReplacedBy({ replacement, routeBase, testID }: ReplacedByProps) {
    const orgHref = useOrgHref()
    if (!replacement) return null
    const open = () => router.push(orgHref(`${routeBase}/${replacement.id}`))
    const text = `Replaced by ${replacement.number} (edited)`
    return <TextLink text={text} onPress={open} testID={testID} />
}
