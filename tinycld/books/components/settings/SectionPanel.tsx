import { LoadingState } from '@tinycld/core/components/LoadingState'
import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ScrollView, Text, View } from 'react-native'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useBooksSettings } from '../../hooks/useBooksSettings'
import { useLastDefined } from '../../hooks/useLastDefined'
import { type LiveRecovery, mergeRecoveries } from '../../lib/live-recovery'
import { keepsSectionBody, type SectionId, sectionPanelState } from '../../lib/settings-sections'
import type { BooksSettings } from '../../types'
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
    settings,
    isAdmin,
}: {
    isVisible: boolean
    section: SectionId
    settings: BooksSettings | undefined
    isAdmin: boolean
}) {
    if (!isVisible || !settings) return null
    return <SectionBody section={section} settings={settings} isAdmin={isAdmin} />
}

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * One Books settings section with its own load, error and access states and no shell
 * around it. The Books settings screen and the panels of core Settings both draw it, so a
 * section has one implementation behind its two entry points. `alsoRecover` holds the
 * failed reads of a frame around the panel, so its Retry rebuilds them in the same call.
 */
export function SectionPanel({
    section,
    alsoRecover = NO_RECOVERY,
}: {
    section: SectionId
    alsoRecover?: LiveRecovery
}) {
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
    // The section whose body was drawn: its body stays under a later loading or error state,
    // with the last settings row, because a reload empties the read until it lands.
    const drawnSection = useLastDefined(state === 'body' ? section : undefined)
    const row = useLastDefined(settings.settings)
    const showsBody = keepsSectionBody(state, drawnSection === section)
    // Only a failed read (or a read with no row) is rebuilt; the access read every Books
    // screen shares stays as it is.
    const retry = () => {
        if (access.isError) access.retry()
        void recoverLiveQueries({
            ...mergeRecoveries([settings.recovery, alsoRecover]),
            onError: error => log.error('books.settings', error),
        })
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
            <PanelBody
                isVisible={showsBody}
                section={section}
                settings={row}
                isAdmin={access.isAdmin}
            />
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
