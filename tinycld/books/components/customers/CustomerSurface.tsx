import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { type ReactNode, useId, useMemo, useRef } from 'react'
import { Pressable, Text, View } from 'react-native'
import { type DetailSurface, formRowClassFor } from '../../lib/detail-surface'

interface CustomerSurfaceProps {
    surface: DetailSurface
    title: string
    onLeave: () => void
    // Null draws no footer bar (loading, not found).
    footer: ReactNode
    children: ReactNode
    testID?: string
}

// Escape runs Cancel. The surface owns a `modal` scope, and every core layer (a menu, a
// dialog) pushes its own above it, so an open layer takes Escape first and closes only
// itself. The id is per instance: two customer screens can be mounted for a moment
// while one replaces the other, and a shared id would let the leaving one unregister
// the new one's shortcut.
function useEscapeToLeave(onLeave: () => void) {
    const owner = useShortcutScope('modal')
    const instance = useId()
    const onLeaveRef = useRef(onLeave)
    onLeaveRef.current = onLeave
    const shortcuts = useMemo(
        () => [
            {
                id: `books.customer.leave.${instance}`,
                keys: 'Escape',
                scope: 'modal' as const,
                description: 'Close the customer',
                allowInInputs: true,
                run: () => onLeaveRef.current(),
            },
        ],
        [instance]
    )
    useRegisterShortcuts(shortcuts, owner)
}

function PageHeader({
    surface,
    title,
    onLeave,
}: Pick<CustomerSurfaceProps, 'surface' | 'title' | 'onLeave'>) {
    return (
        <View testID="customer-page-header" className="border-b border-border">
            <View className={`pb-3 pt-2 ${formRowClassFor(surface)}`}>
                <Pressable
                    testID="customer-back"
                    accessibilityRole="button"
                    accessibilityLabel="Back to customers"
                    onPress={onLeave}
                    className="-ml-1 min-h-11 justify-center self-start px-1"
                >
                    <Text className="text-sm text-muted-foreground">‹ Customers</Text>
                </Pressable>
                <Text
                    testID="customer-title"
                    numberOfLines={1}
                    className="text-xl font-semibold text-foreground"
                >
                    {title}
                </Text>
            </View>
        </View>
    )
}

function SurfaceFooter({ surface, footer }: Pick<CustomerSurfaceProps, 'surface' | 'footer'>) {
    if (!footer) return null
    return (
        <View testID="customer-footer" className="border-t border-border bg-background">
            <View
                className={`flex-row items-center justify-end gap-2 py-2 ${formRowClassFor(surface)}`}
            >
                {footer}
            </View>
        </View>
    )
}

/**
 * The chrome around an open customer: a header with "‹ Customers" and the title, the
 * scrolling body (`children`), and a footer that stays at the bottom. The root opts back
 * into pointer events, which the child stack's container turns off on web so the
 * transparent index screen never takes the list's clicks.
 */
export function CustomerSurface({
    surface,
    title,
    onLeave,
    footer,
    children,
    testID = 'customer-page',
}: CustomerSurfaceProps) {
    useEscapeToLeave(onLeave)
    return (
        <View testID={testID} pointerEvents="auto" className="flex-1 bg-background">
            <PageHeader surface={surface} title={title} onLeave={onLeave} />
            <View className="flex-1">{children}</View>
            <SurfaceFooter surface={surface} footer={footer} />
        </View>
    )
}

// Core LoadingState takes no testID, so the wrapper carries it.
export function CustomerLoadingBody() {
    return (
        <View testID="customer-loading" className="flex-1">
            <LoadingState />
        </View>
    )
}
