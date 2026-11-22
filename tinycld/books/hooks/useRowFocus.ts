import { rowFocusStyle } from '@tinycld/core/components/focusable-row'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'

// The focus stripe of a Reconcile row or card, and `data-focused` on the web for the e2e
// (react-native-web renders `dataSet`; a bare data- prop is dropped). The accounts' and the
// history's rows and cards use it.
export function useRowFocus(isFocused: boolean) {
    const borderColor = useThemeColor('border')
    const activeIndicator = useThemeColor('primary')
    return {
        style: rowFocusStyle({ isFocused, borderColor, activeIndicator }),
        dataSet: { focused: isFocused ? 'true' : undefined },
    }
}
