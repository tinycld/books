import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { ScrollView, View } from 'react-native'
import { DashboardGrid } from '../components/dashboard/DashboardGrid'
import { DashboardHeader } from '../components/dashboard/DashboardHeader'
import { ListBanner } from '../components/ListBanner'
import { SetupCard } from '../components/SetupCard'
import { useBooksAccess } from '../hooks/useBooksAccess'
import { useDashboardPrefs } from '../hooks/useDashboardPrefs'
import { useShowSetupCard } from '../hooks/useShowSetupCard'
import { useFabClearanceStyle } from '../lib/fab-clearance'

const PREFS_ERROR = 'Your dashboard settings could not load.'

// The dashboard (spec docs/specs/dashboard-design.md): the page Books opens on. A failed
// preference read keeps the default arrangement under a banner with Retry, and the
// controls that save stay disabled until the read lands.
export default function DashboardScreen() {
    const { prefs, isReady, isError, retry, save } = useDashboardPrefs()
    const access = useBooksAccess()
    const showSetupCard = useShowSetupCard()
    const isPhone = useBreakpoint() === 'mobile'
    const fabClearanceStyle = useFabClearanceStyle()
    const { width: pageWidth, onLayout } = useContainerWidth()
    const isPrefsReady = isReady && !isError
    // Until the saved value is known, amounts draw masked: a user who saved Hide amounts on
    // must never see a real amount while the preference loads or after its read failed.
    const hideAmounts = prefs.hideAmounts || !isPrefsReady
    const prefsError = isError ? PREFS_ERROR : null
    const pageClass = isPhone ? 'gap-4 p-4' : 'gap-4 p-6'

    return (
        <ScrollView
            testID="dashboard-screen"
            className="flex-1 bg-background"
            contentContainerStyle={fabClearanceStyle}
            onLayout={onLayout}
        >
            <View className={pageClass}>
                <DashboardHeader prefs={prefs} isPrefsReady={isPrefsReady} onPrefsChange={save} />
                <SetupCard isVisible={showSetupCard} />
                <ListBanner
                    testIdPrefix="dashboard-prefs"
                    message={prefsError}
                    onRetry={retry}
                    isFlush
                />
                <DashboardGrid
                    pageWidth={pageWidth}
                    hideAmounts={hideAmounts}
                    canWrite={access.canWrite}
                    prefs={prefs}
                    isPrefsReady={isPrefsReady}
                    onPrefsChange={save}
                />
            </View>
        </ScrollView>
    )
}
