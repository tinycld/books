import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useRegisterShortcuts, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { X } from 'lucide-react-native'
import { type ReactNode, type Ref, useId, useMemo, useRef } from 'react'
import { Pressable, Text, View, type ViewInstance } from 'react-native'
import { type DetailSurface, formRowClassFor } from '../../lib/detail-surface'

const noop = () => {}

interface CustomerSurfaceProps {
    surface: DetailSurface
    title: string
    onLeave: () => void
    // Null draws no footer bar (loading, not found).
    footer: ReactNode
    children: ReactNode
    // True while a save is in flight: the back button and Escape do nothing. Other ways
    // out (the package rail, the tab bar, the search palette, another list row, the
    // browser's or hardware back) still leave; the save routes its answer by whether the
    // user still sees the form.
    isLeaveDisabled?: boolean
    // Set on the root view, so the form can tell when the surface has closed.
    surfaceRef?: Ref<ViewInstance>
}

// Escape runs Cancel. The surface owns a `modal` scope, and every core layer (a menu, a
// dialog) pushes its own above it, so an open layer takes Escape first and closes only
// itself. The id is per instance: two customer screens can be mounted for a moment
// while one replaces the other, and a shared id would let the leaving one unregister
// the new one's shortcut.
function useEscapeToLeave(onLeave: () => void, isLeaveDisabled: boolean) {
    const owner = useShortcutScope('modal')
    const instance = useId()
    const onLeaveRef = useRef(onLeave)
    onLeaveRef.current = isLeaveDisabled ? noop : onLeave
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

type HeaderProps = Pick<CustomerSurfaceProps, 'surface' | 'title' | 'onLeave'> & {
    isLeaveDisabled: boolean
}

// A way out that is disabled while a save runs looks disabled too.
function leaveDimClass(isLeaveDisabled: boolean) {
    return isLeaveDisabled ? 'opacity-50' : ''
}

function PanelHeader({ title, onLeave, isLeaveDisabled }: HeaderProps) {
    const color = useThemeColor('foreground')
    return (
        <View
            testID="customer-panel-header"
            className="h-[52px] flex-row items-center justify-between gap-2 border-b border-border pl-4 pr-1"
        >
            <Text
                testID="customer-title"
                numberOfLines={1}
                className="shrink text-lg font-semibold text-foreground"
            >
                {title}
            </Text>
            <Pressable
                testID="customer-close"
                accessibilityRole="button"
                accessibilityLabel="Close"
                disabled={isLeaveDisabled}
                onPress={onLeave}
                className={`h-11 w-11 items-center justify-center ${leaveDimClass(isLeaveDisabled)}`}
            >
                <X size={18} color={color} />
            </Pressable>
        </View>
    )
}

function PageHeader({ surface, title, onLeave, isLeaveDisabled }: HeaderProps) {
    return (
        <View testID="customer-page-header" className="border-b border-border">
            <View className={`pb-3 pt-2 ${formRowClassFor(surface)}`}>
                <Pressable
                    testID="customer-back"
                    accessibilityRole="button"
                    accessibilityLabel="Back to customers"
                    disabled={isLeaveDisabled}
                    onPress={onLeave}
                    className={`-ml-1 min-h-11 justify-center self-start px-1 ${leaveDimClass(isLeaveDisabled)}`}
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

function SurfaceHeader(props: HeaderProps) {
    if (props.surface === 'panel') return <PanelHeader {...props} />
    return <PageHeader {...props} />
}

/**
 * The chrome around an open customer: a header (the title and a ✕ in the panel,
 * "‹ Customers" and the title on the page), the scrolling body (`children`), and a footer
 * that stays at the bottom. Only the header element differs between surfaces, so the body
 * and the form inside it stay mounted when the window crosses the panel width. The root
 * opts back into pointer events, which the child stack's container turns off on web so
 * the transparent index screen never takes the list's clicks.
 */
export function CustomerSurface({
    surface,
    title,
    onLeave,
    footer,
    children,
    isLeaveDisabled = false,
    surfaceRef,
}: CustomerSurfaceProps) {
    useEscapeToLeave(onLeave, isLeaveDisabled)
    return (
        <View
            ref={surfaceRef}
            testID={`customer-${surface}`}
            pointerEvents="auto"
            className="flex-1 bg-background"
        >
            <SurfaceHeader
                surface={surface}
                title={title}
                onLeave={onLeave}
                isLeaveDisabled={isLeaveDisabled}
            />
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
