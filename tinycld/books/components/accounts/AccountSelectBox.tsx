import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Check } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

interface AccountSelectBoxProps {
    id: string
    name: string
    isSelected: (id: string) => boolean
    onSelect: (id: string) => void
}

export function AccountSelectBox({ id, name, isSelected, onSelect }: AccountSelectBoxProps) {
    const color = useThemeColor('primary-foreground')
    const isChecked = isSelected(id)
    const fill = isChecked ? 'bg-primary border-primary' : 'bg-background border-border'
    return (
        <Pressable
            testID={`account-select-${id}`}
            accessibilityRole="checkbox"
            accessibilityLabel={`Select ${name}`}
            accessibilityState={{ checked: isChecked }}
            // The box sits inside the pressable row; it must not also open the account.
            onPress={event => {
                event.stopPropagation()
                onSelect(id)
            }}
            className="items-center justify-center"
            style={{ width: 44, minHeight: 44 }}
        >
            <View
                className={`items-center justify-center rounded border ${fill}`}
                style={{ width: 20, height: 20 }}
            >
                <CheckMark isVisible={isChecked} color={color} />
            </View>
        </Pressable>
    )
}

function CheckMark({ isVisible, color }: { isVisible: boolean; color: string }) {
    if (!isVisible) return null
    return <Check size={14} color={color} />
}
