import { Switch } from '@tinycld/core/ui/switch'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { DashboardPrefs } from '../../lib/dashboard-prefs'

interface DashboardHeaderProps {
    prefs: DashboardPrefs
    // The switch is disabled until the preference has loaded (spec §3 "What is saved").
    isPrefsReady: boolean
    onPrefsChange: (next: DashboardPrefs) => void
    // Beside the switch: the Customize button.
    children?: ReactNode
}

// The heading "Dashboard" and the saved "Hide amounts" switch.
export function DashboardHeader({
    prefs,
    isPrefsReady,
    onPrefsChange,
    children,
}: DashboardHeaderProps) {
    const onHideAmountsChange = (hideAmounts: boolean) => onPrefsChange({ ...prefs, hideAmounts })
    return (
        <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-2xl font-semibold text-foreground">Dashboard</Text>
            <View className="flex-row items-center gap-2">
                <Text className="text-sm text-muted-foreground">Hide amounts</Text>
                <Switch
                    testID="dashboard-hide-amounts"
                    value={prefs.hideAmounts}
                    onValueChange={onHideAmountsChange}
                    isDisabled={!isPrefsReady}
                    accessibilityLabel="Hide amounts"
                />
            </View>
            {children}
        </View>
    )
}
