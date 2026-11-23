import { Button, ButtonText } from '@tinycld/core/ui/button'
import { type Href, Link } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { Loadable } from '../../lib/dashboard-figures'
import { WIDGET_NAMES, type WidgetId } from '../../lib/dashboard-prefs'

// Each widget's skeleton is about the height of its loaded body, so the grid does not
// jump when the reads land.
const SKELETON_HEIGHTS: Record<WidgetId, number> = {
    invoices: 200,
    expenses: 200,
    bankAccounts: 140,
    profitAndLoss: 140,
    sales: 160,
}

const LINK_STYLE = { minHeight: 44 }
const NO_SHRINK = { flexShrink: 0 }

export type FigureTone = 'normal' | 'danger'

function toneClass(tone: FigureTone): string {
    return tone === 'danger' ? 'text-danger' : 'text-foreground'
}

export function WidgetSkeleton({ widget }: { widget: WidgetId }) {
    const height = SKELETON_HEIGHTS[widget]
    return (
        <View
            testID={`dashboard-widget-${widget}-skeleton`}
            accessibilityLabel="Loading"
            className="gap-3"
        >
            <View className="h-8 rounded bg-border" style={{ width: 160 }} />
            <View className="rounded-lg bg-border" style={{ height, opacity: 0.6 }} />
        </View>
    )
}

export function WidgetError({ widget, onRetry }: { widget: WidgetId; onRetry: () => void }) {
    return (
        <View testID={`dashboard-widget-${widget}-error`} className="items-start gap-3">
            <Text className="text-sm text-muted-foreground">This widget could not load.</Text>
            <Button
                testID={`dashboard-widget-${widget}-retry`}
                variant="outline"
                size="sm"
                style={LINK_STYLE}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

interface WidgetCardProps {
    widget: WidgetId
    // The widget's name unless a widget passes its own.
    title?: string
    state: Loadable<unknown>
    onRetry: () => void
    // Beside the title: a period picker.
    headerRight?: ReactNode
    // Drawn only when the state is ready.
    children: ReactNode
}

function WidgetBody({ widget, state, onRetry, children }: Omit<WidgetCardProps, 'title'>) {
    if (state.status === 'loading') return <WidgetSkeleton widget={widget} />
    if (state.status === 'error') return <WidgetError widget={widget} onRetry={onRetry} />
    return <>{children}</>
}

// A dashboard card: the title row, then the skeleton while its reads load, the error with
// Retry when one failed, else the widget's body. The card fills its grid cell, so the
// cards of a row share the height of the tallest.
export function WidgetCard({
    widget,
    title,
    state,
    onRetry,
    headerRight,
    children,
}: WidgetCardProps) {
    const name = title ?? WIDGET_NAMES[widget]
    return (
        <View
            testID={`dashboard-widget-${widget}`}
            className="flex-1 gap-2 rounded-xl border border-border bg-surface p-4"
            style={{ minWidth: 0 }}
        >
            <View className="flex-row items-center justify-between gap-2" style={{ minHeight: 32 }}>
                <Text className="text-xs uppercase text-muted-foreground">{name}</Text>
                {headerRight}
            </View>
            <WidgetBody widget={widget} state={state} onRetry={onRetry}>
                {children}
            </WidgetBody>
        </View>
    )
}

interface WidgetEmptyProps {
    widget: WidgetId
    text: string
    actionLabel?: string
    // The create screen the action opens (plan D16: a real link).
    actionHref?: Href
    isActionVisible: boolean
}

function EmptyAction({
    widget,
    label,
    href,
    isVisible,
}: {
    widget: WidgetId
    label: string | undefined
    href: Href | undefined
    isVisible: boolean
}) {
    if (!isVisible || !label || !href) return null
    return (
        <Link href={href} asChild>
            <Pressable
                testID={`dashboard-widget-${widget}-action`}
                accessibilityRole="link"
                className="items-center justify-center rounded-lg bg-primary px-3 web:cursor-pointer"
                style={LINK_STYLE}
            >
                <Text className="text-sm font-medium text-primary-foreground">{label}</Text>
            </Pressable>
        </Link>
    )
}

export function WidgetEmpty({
    widget,
    text,
    actionLabel,
    actionHref,
    isActionVisible,
}: WidgetEmptyProps) {
    return (
        <View testID={`dashboard-widget-${widget}-empty`} className="items-start gap-3">
            <Text className="text-sm text-muted-foreground">{text}</Text>
            <EmptyAction
                widget={widget}
                label={actionLabel}
                href={actionHref}
                isVisible={isActionVisible}
            />
        </View>
    )
}

// The figure that leads a card. `text` is already drawn by dashboardAmount, so the mask
// keeps the figure's size (plan D4).
export function Figure({
    label,
    text,
    tone = 'normal',
    testID,
}: {
    label: string
    text: string
    tone?: FigureTone
    testID?: string
}) {
    const figureClass = `text-3xl font-semibold tabular-nums ${toneClass(tone)}`
    return (
        <View>
            <Text testID={testID} className={figureClass} numberOfLines={1}>
                {text}
            </Text>
            <Text className="text-xs text-muted-foreground">{label}</Text>
        </View>
    )
}

export interface BarPart {
    key: string
    weight: number
    className: string
}

// One proportional bar: each part's flex weight is its share of the track. A part of
// weight 0 is not drawn, so all parts 0 leave the empty track.
export function Bar({ parts, testID }: { parts: readonly BarPart[]; testID?: string }) {
    const fills = parts
        .filter(part => part.weight > 0)
        .map(part => (
            <View key={part.key} className={part.className} style={{ flex: part.weight }} />
        ))
    return (
        <View testID={testID} className="h-3 flex-row overflow-hidden rounded-full bg-border">
            {fills}
        </View>
    )
}

interface AmountLineProps {
    label: string
    text: string
    tone?: FigureTone
    // The test id of the amount text.
    textTestID?: string
    // The test id of the whole line (the link, when it is one).
    testID?: string
    // A line that opens a screen (plan D16: a real link); plain text without it.
    href?: Href | null
}

function AmountLineBody({
    label,
    text,
    tone = 'normal',
    textTestID,
    isLink,
}: AmountLineProps & { isLink: boolean }) {
    const labelClass = `flex-1 text-sm ${isLink ? 'text-primary' : 'text-foreground'}`
    const amountClass = `text-sm font-medium tabular-nums ${toneClass(tone)}`
    return (
        <>
            <Text className={labelClass} numberOfLines={1}>
                {label}
            </Text>
            <Text testID={textTestID} className={amountClass} style={NO_SHRINK}>
                {text}
            </Text>
        </>
    )
}

const AMOUNT_LINE_CLASS = 'flex-row items-center justify-between gap-3 border-t border-border'

// A labelled amount on its own line under the figure.
export function AmountLine({ href, testID, ...props }: AmountLineProps) {
    if (!href) {
        return (
            <View testID={testID} className={AMOUNT_LINE_CLASS} style={LINK_STYLE}>
                <AmountLineBody {...props} isLink={false} />
            </View>
        )
    }
    return (
        <Link href={href} asChild>
            <Pressable
                testID={testID}
                accessibilityRole="link"
                className={`${AMOUNT_LINE_CLASS} web:cursor-pointer`}
                style={LINK_STYLE}
            >
                <AmountLineBody {...props} isLink />
            </Pressable>
        </Link>
    )
}

// The card's links, at its foot: `marginTop: 'auto'` takes the room a shorter card has
// beside the tallest of its row.
export function LinksRow({ children }: { children: ReactNode }) {
    return (
        <View className="flex-row flex-wrap gap-x-4" style={{ marginTop: 'auto' }}>
            {children}
        </View>
    )
}

export function TextLink({
    label,
    href,
    isVisible = true,
    testID,
}: {
    label: string
    href: Href | null
    isVisible?: boolean
    testID?: string
}) {
    if (!isVisible || !href) return null
    return (
        <Link href={href} asChild>
            <Pressable
                testID={testID}
                accessibilityRole="link"
                className="justify-center web:cursor-pointer"
                style={LINK_STYLE}
            >
                <Text className="text-sm text-primary">{label}</Text>
            </Pressable>
        </Link>
    )
}
