import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ArrowDown, ArrowRight } from 'lucide-react-native'
import { View } from 'react-native'

// In the form the wide arrow lines up with the select triggers (under their labels) and
// the phone arrow sits centred between two full-width fields; the read view's arrow
// follows the account names.
export function FlowArrow({ isWide, isInForm }: { isWide: boolean; isInForm: boolean }) {
    const color = useThemeColor('muted-foreground')
    if (isWide) {
        return (
            <View testID="transfer-arrow" style={{ paddingTop: isInForm ? 36 : 0 }}>
                <ArrowRight size={18} color={color} />
            </View>
        )
    }
    return (
        <View
            testID="transfer-arrow"
            className={isInForm ? 'items-center' : ''}
            style={{ paddingBottom: 4 }}
        >
            <ArrowDown size={18} color={color} />
        </View>
    )
}
