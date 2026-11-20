import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Check, Minus } from 'lucide-react-native'
import type { ComponentRef, Ref } from 'react'
import { type GestureResponderEvent, type KeyDownEvent, Pressable, Text, View } from 'react-native'
import type { SelectBoxState } from '../lib/bank-import-view'

export type { SelectBoxState }

function BoxMark({ state, color }: { state: SelectBoxState; color: string }) {
    if (state === 'checked') return <Check size={14} color={color} />
    if (state === 'mixed') return <Minus size={14} color={color} />
    return null
}

function ariaChecked(state: SelectBoxState): boolean | 'mixed' {
    if (state === 'mixed') return 'mixed'
    return state === 'checked'
}

interface SelectBoxProps {
    state: SelectBoxState
    isDisabled?: boolean
    label: string
    testID?: string
    onPress?: () => void
    ref?: Ref<ComponentRef<typeof Pressable>>
    // -1 takes the box out of the Tab order where keys do what it does (lesson 29).
    tabIndex?: 0 | -1
    // A visible label beside the box, inside the press target, so a tap on it ticks too.
    text?: string
}

const BOX_ONLY = { width: 44, minHeight: 44 }
const BOX_WITH_TEXT = { minHeight: 44 }

// The 20 × 20 mark; with a text, centered in a 44 px slot so it lines up with the plain
// boxes of the cards under it, and followed by the text.
function BoxContent({
    state,
    fill,
    dim,
    color,
    text,
}: {
    state: SelectBoxState
    fill: string
    dim: string
    color: string
    text: string | undefined
}) {
    const mark = (
        <View
            className={`items-center justify-center rounded border ${fill} ${dim}`}
            style={{ width: 20, height: 20 }}
        >
            <BoxMark state={state} color={color} />
        </View>
    )
    if (text === undefined) return mark
    return (
        <>
            <View className="items-center justify-center" style={BOX_ONLY}>
                {mark}
            </View>
            <Text className={`pr-2 text-sm text-foreground ${dim}`}>{text}</Text>
        </>
    )
}

// A 44 × 44 check box, or with `text` the box and its label as one press target of at
// least 44 px height. It sits inside pressable rows, so it stops its own press from also
// pressing the row. react-native-web writes no aria-checked from accessibilityState, so
// the web attributes are set too.
export function SelectBox({
    state,
    isDisabled = false,
    label,
    testID,
    onPress,
    ref,
    tabIndex,
    text,
}: SelectBoxProps) {
    const color = useThemeColor('primary-foreground')
    const fill = state === 'empty' ? 'bg-background border-border' : 'bg-primary border-primary'
    const dim = isDisabled ? 'opacity-50' : ''
    const checked = ariaChecked(state)
    const hasText = text !== undefined
    const layout = hasText ? 'flex-row items-center self-start' : 'items-center justify-center'
    const style = hasText ? BOX_WITH_TEXT : BOX_ONLY
    const handlePress = (event: GestureResponderEvent) => {
        event.stopPropagation()
        onPress?.()
    }
    // react-native-web presses a focused Pressable on Space only for a button role, so a
    // focused box toggles itself here; the key stops at the box, so no list key acts on it.
    const handleKeyDown = (event: KeyDownEvent) => {
        if (event.nativeEvent.key !== ' ' || event.target !== event.currentTarget) return
        event.preventDefault()
        event.stopPropagation()
        if (!isDisabled) onPress?.()
    }
    return (
        <Pressable
            ref={ref}
            tabIndex={tabIndex}
            testID={testID}
            accessibilityRole="checkbox"
            accessibilityLabel={label}
            accessibilityState={{ checked, disabled: isDisabled }}
            aria-checked={checked}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            onPress={handlePress}
            onKeyDown={handleKeyDown}
            className={layout}
            style={style}
        >
            <BoxContent state={state} fill={fill} dim={dim} color={color} text={text} />
        </Pressable>
    )
}
