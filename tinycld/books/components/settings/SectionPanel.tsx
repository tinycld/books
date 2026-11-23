import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { useRef } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useBooksSettings } from '../../hooks/useBooksSettings'
import { keepsSectionBody, type SectionId, sectionPanelState } from '../../lib/settings-sections'
import { SectionBody } from './SectionBody'

function PanelLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <LoadingState />
}

function PanelError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View
            accessibilityRole="alert"
            className="items-center gap-3 p-6"
            testID="books-settings-panel-error"
        >
            <Text className="text-sm text-foreground">Settings could not be loaded.</Text>
            <Button
                size="sm"
                variant="outline"
                testID="books-settings-panel-retry"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function PanelNote({
    isVisible,
    testID,
    text,
}: {
    isVisible: boolean
    testID: string
    text: string
}) {
    if (!isVisible) return null
    return (
        <Text className="p-6 text-sm text-muted-foreground" testID={testID}>
            {text}
        </Text>
    )
}

function PanelBody({
    isVisible,
    section,
    isAdmin,
}: {
    isVisible: boolean
    section: SectionId
    isAdmin: boolean
}) {
    if (!isVisible) return null
    return <SectionBody section={section} isAdmin={isAdmin} />
}

/**
 * One Books settings section with its own load, error and access states and no shell
 * around it. The Books settings screen and the panels of core Settings both draw it, so a
 * section has one implementation behind its two entry points.
 */
export function SectionPanel({ section }: { section: SectionId }) {
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const state = sectionPanelState(section, {
        isAccessReady: access.isReady,
        isAccessError: access.isError,
        canRead: access.canRead,
        isAdmin: access.isAdmin,
        isSettingsReady: settings.isReady,
        isSettingsError: settings.hasLoadError,
        hasSettings: settings.settings !== undefined,
    })
    // The section whose body was drawn: its body stays under a later loading or error state.
    const drawn = useRef<SectionId | null>(null)
    if (state === 'body') drawn.current = section
    const showsBody = keepsSectionBody(state, drawn.current === section)
    // Only a failed read is rebuilt; the access read every Books screen shares stays as it is.
    const retry = () => {
        if (access.isError) access.retry()
        if (settings.hasLoadError) settings.retryLoad()
    }

    return (
        <>
            <PanelLoading isVisible={state === 'loading' && !showsBody} />
            <PanelError isVisible={state === 'error'} onRetry={retry} />
            <PanelNote
                isVisible={state === 'no-access'}
                testID="books-settings-panel-no-access"
                text="You do not have access to Books. A Books admin can give it to you."
            />
            <PanelNote
                isVisible={state === 'admin-only'}
                testID="books-settings-panel-admin-only"
                text="Only a Books admin can open this section."
            />
            <PanelBody isVisible={showsBody} section={section} isAdmin={access.isAdmin} />
        </>
    )
}

/**
 * A section as a panel of core Settings. Core's panel screen draws the header and gives
 * the panel a fixed-height area with no scroller, so the panel brings its own.
 */
export function SectionPanelScreen({ section }: { section: SectionId }) {
    return (
        <ScrollView
            testID="books-settings-panel"
            className="flex-1 bg-background"
            contentContainerClassName="gap-4 p-4"
        >
            <SectionPanel section={section} />
        </ScrollView>
    )
}
