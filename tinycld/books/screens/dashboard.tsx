import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { AllHidden } from '../components/dashboard/AllHidden'
import { CustomizeButton } from '../components/dashboard/CustomizeButton'
import { DashboardEditList } from '../components/dashboard/DashboardEditList'
import { DashboardGrid } from '../components/dashboard/DashboardGrid'
import { DashboardHeader } from '../components/dashboard/DashboardHeader'
import { ListBanner } from '../components/ListBanner'
import { SetupCard } from '../components/SetupCard'
import { useBooksAccess } from '../hooks/useBooksAccess'
import { useDashboardPrefs } from '../hooks/useDashboardPrefs'
import { useShowSetupCard } from '../hooks/useShowSetupCard'
import { shownWidgets } from '../lib/dashboard-prefs'
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
    // Edit mode is local to this screen and never saved, so a reload ends it (spec §3
    // "Customize"). The Books stack keeps a covered screen mounted, so losing focus ends it
    // too.
    const [isEditing, setIsEditing] = useState(false)
    const endEditOnBlur = useCallback(() => () => setIsEditing(false), [])
    useFocusEffect(endEditOnBlur)

    const isPrefsReady = isReady && !isError
    // Until the saved value is known, amounts draw masked: a user who saved Hide amounts on
    // must never see a real amount while the preference loads or after its read failed.
    const hideAmounts = prefs.hideAmounts || !isPrefsReady
    const prefsError = isError ? PREFS_ERROR : null
    const pageClass = isPhone ? 'gap-4 p-4' : 'gap-4 p-6'
    // A read that fails while editing returns the page to the grid under the banner: the
    // edit list's saves would do nothing until the read lands again.
    const showEditList = isEditing && isPrefsReady
    const isAllHidden = shownWidgets(prefs).length === 0
    const showAllHidden = !showEditList && isAllHidden
    const showGrid = !showEditList && !isAllHidden
    const startEditing = () => setIsEditing(true)
    const endEditing = () => setIsEditing(false)
    const toggleEditing = showEditList ? endEditing : startEditing

    return (
        <ScrollView
            testID="dashboard-screen"
            className="flex-1 bg-background"
            contentContainerStyle={fabClearanceStyle}
            onLayout={onLayout}
        >
            <View className={pageClass}>
                <DashboardHeader prefs={prefs} isPrefsReady={isPrefsReady} onPrefsChange={save}>
                    <CustomizeButton
                        isEditing={showEditList}
                        isDisabled={!isPrefsReady}
                        onPress={toggleEditing}
                    />
                </DashboardHeader>
                <SetupCard isVisible={showSetupCard} />
                <ListBanner
                    testIdPrefix="dashboard-prefs"
                    message={prefsError}
                    onRetry={retry}
                    isFlush
                />
                <DashboardEditList isVisible={showEditList} prefs={prefs} onPrefsChange={save} />
                <AllHidden
                    isVisible={showAllHidden}
                    onCustomize={startEditing}
                    isDisabled={!isPrefsReady}
                />
                <DashboardGrid
                    isVisible={showGrid}
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
