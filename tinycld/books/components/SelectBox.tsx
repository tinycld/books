import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Check, Minus } from 'lucide-react-native'
import type { ComponentRef, Ref } from 'react'
import { type GestureResponderEvent, Pressable, View } from 'react-native'
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
}

// A 44 × 44 check box. It sits inside pressable rows, so it stops its own press from also
// pressing the row. react-native-web writes no aria-checked from accessibilityState, so
// the web attributes are set too.
export function SelectBox({
    state,
    isDisabled = false,
    label,
    testID,
    onPress,
    ref,
}: SelectBoxProps) {
    const color = useThemeColor('primary-foreground')
    const fill = state === 'empty' ? 'bg-background border-border' : 'bg-primary border-primary'
    const dim = isDisabled ? 'opacity-50' : ''
    const checked = ariaChecked(state)
    const handlePress = (event: GestureResponderEvent) => {
        event.stopPropagation()
        onPress?.()
    }
    return (
        <Pressable
            ref={ref}
            testID={testID}
            accessibilityRole="checkbox"
            accessibilityLabel={label}
            accessibilityState={{ checked, disabled: isDisabled }}
            aria-checked={checked}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            onPress={handlePress}
            className="items-center justify-center"
            style={{ width: 44, minHeight: 44 }}
        >
            <View
                className={`items-center justify-center rounded border ${fill} ${dim}`}
                style={{ width: 20, height: 20 }}
            >
                <BoxMark state={state} color={color} />
            </View>
        </Pressable>
    )
}
