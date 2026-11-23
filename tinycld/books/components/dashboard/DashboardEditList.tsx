import { SortableDragHandle, SortableList } from '@tinycld/core/components/SortableList'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { Switch } from '@tinycld/core/ui/switch'
import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { type RefObject, useRef } from 'react'
import { type PressableInstance, Text, View } from 'react-native'
import { type FocusRequest, type MoveDirection, useMovedFocus } from '../../hooks/useMovedFocus'
import {
    type DashboardPrefs,
    moveWidget,
    resetArrangement,
    setWidgetShown,
    WIDGET_NAMES,
    type WidgetId,
} from '../../lib/dashboard-prefs'
import { DashboardIconButton } from './DashboardIconButton'

function ShowLabel({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="text-sm text-muted-foreground">Show</Text>
}

interface EditRowProps {
    id: WidgetId
    index: number
    prefs: DashboardPrefs
    isPhone: boolean
    focusRequest: RefObject<FocusRequest | null>
    onPrefsChange: (next: DashboardPrefs) => void
}

function EditRow({ id, index, prefs, isPhone, focusRequest, onPrefsChange }: EditRowProps) {
    const server = useServerActionState()
    const upRef = useRef<PressableInstance>(null)
    const downRef = useRef<PressableInstance>(null)
    const name = WIDGET_NAMES[id]
    // The place comes from the saved order, not from the list's render index: the sortable
    // list draws a new order a render later than the saved one (and, on native, keeps its
    // cells after a drop).
    const place = prefs.order.indexOf(id)
    const isFirst = place === 0
    const isLast = place === prefs.order.length - 1
    useMovedFocus({ id, index, place, isFirst, isLast, focusRequest, upRef, downRef })
    // The Move buttons are the keyboard and screen-reader path of the drag (spec §6). They
    // are disabled at the end they point to and while writes are unavailable.
    const up = useServerActionState({ isDisabled: isFirst })
    const down = useServerActionState({ isDisabled: isLast })
    const isShown = !prefs.hidden.includes(id)
    const nameClass = isShown
        ? 'flex-1 text-base text-foreground'
        : 'flex-1 text-base text-muted-foreground'
    const move = (direction: MoveDirection) => {
        focusRequest.current = { id, direction }
        onPrefsChange(moveWidget(prefs, id, direction === 'up' ? -1 : 1))
    }
    const moveUp = () => move('up')
    const moveDown = () => move('down')
    const onShowChange = (next: boolean) => onPrefsChange(setWidgetShown(prefs, id, next))
    return (
        <View
            testID={`dashboard-edit-row-${id}`}
            className="mb-2 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
        >
            <SortableDragHandle
                testID={`dashboard-edit-handle-${id}`}
                disabled={server.isDisabled}
            />
            <Text className={nameClass} numberOfLines={1}>
                {name}
            </Text>
            <DashboardIconButton
                buttonRef={upRef}
                testID={`dashboard-edit-up-${id}`}
                label={`Move up: ${name}`}
                icon={ArrowUp}
                iconSize={16}
                isDisabled={up.isDisabled}
                accessibilityHint={up.accessibilityHint}
                onPress={moveUp}
            />
            <DashboardIconButton
                buttonRef={downRef}
                testID={`dashboard-edit-down-${id}`}
                label={`Move down: ${name}`}
                icon={ArrowDown}
                iconSize={16}
                isDisabled={down.isDisabled}
                accessibilityHint={down.accessibilityHint}
                onPress={moveDown}
            />
            <View className="flex-row items-center gap-2">
                <ShowLabel isVisible={!isPhone} />
                <Switch
                    testID={`dashboard-edit-show-${id}`}
                    value={isShown}
                    onValueChange={onShowChange}
                    isDisabled={server.isDisabled}
                    accessibilityLabel={`Show ${name}`}
                />
            </View>
        </View>
    )
}

interface DashboardEditListProps {
    isVisible: boolean
    prefs: DashboardPrefs
    // Every change is saved at once; a failed save shows the dashboard toast and the saved
    // value comes back (hooks/useDashboardPrefs.ts).
    onPrefsChange: (next: DashboardPrefs) => void
}

const LIST_STYLE = { maxWidth: 560 }

function keyOf(id: WidgetId) {
    return id
}

// Edit mode (spec §3 "Customize"): one row per widget in the user's order, hidden widgets
// included, in the page (core SortableList, as core NavigationSection uses it).
export function DashboardEditList({ isVisible, prefs, onPrefsChange }: DashboardEditListProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const focusRequest = useRef<FocusRequest | null>(null)
    if (!isVisible) return null

    const onReorder = (order: WidgetId[]) => onPrefsChange({ ...prefs, order })
    const onReset = () => onPrefsChange(resetArrangement(prefs))
    const renderItem = ({ item, index }: { item: WidgetId; index: number }) => (
        <EditRow
            id={item}
            index={index}
            prefs={prefs}
            isPhone={isPhone}
            focusRequest={focusRequest}
            onPrefsChange={onPrefsChange}
        />
    )

    return (
        <View testID="dashboard-edit-list" className="gap-3" style={LIST_STYLE}>
            <Text className="text-sm text-muted-foreground">
                Drag a row, or use the arrows, to change the order. Changes are saved at once.
            </Text>
            <SortableList
                data={prefs.order}
                keyExtractor={keyOf}
                onReorder={onReorder}
                renderItem={renderItem}
            />
            <ServerActionButton
                testID="dashboard-reset"
                variant="outline"
                className="self-start"
                onPress={onReset}
            >
                <ButtonText>Reset to default</ButtonText>
            </ServerActionButton>
        </View>
    )
}
