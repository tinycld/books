import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { TextInput } from '@tinycld/core/ui/form'
import { Text, View } from 'react-native'
import type { AccessPerson } from '../../hooks/useAccessList'
import { useAccessSection } from '../../hooks/useAccessSection'
import type { OrgRole } from '../../lib/access-levels'
import { AccessRow } from './AccessRow'
import { SectionCard } from './SectionCard'

function AccessError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View
            accessibilityRole="alert"
            className="items-center gap-3 p-4"
            testID="books-settings-access-error"
        >
            <Text className="text-sm text-foreground">People could not be loaded.</Text>
            <Button
                size="sm"
                variant="outline"
                testID="books-settings-access-retry"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function AccessLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <LoadingState />
}

function AccessEmpty({ text, isVisible }: { text: string; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text className="py-4 text-sm text-muted-foreground" testID="books-settings-access-empty">
            {text}
        </Text>
    )
}

function AccessRows({
    isVisible,
    people,
    viewerOrgRole,
    viewerId,
}: {
    isVisible: boolean
    people: AccessPerson[]
    viewerOrgRole: OrgRole
    viewerId: string
}) {
    if (!isVisible) return null
    const rows = people.map(person => (
        <AccessRow
            key={person.id}
            person={person}
            viewerOrgRole={viewerOrgRole}
            viewerId={viewerId}
        />
    ))
    return <View>{rows}</View>
}

function AccessBody() {
    const section = useAccessSection()
    const isLoaded = section.isReady && !section.hasLoadError
    return (
        <SectionCard>
            <View className="gap-2" testID="books-settings-access">
                <TextInput
                    control={section.control}
                    name="search"
                    label="Search people"
                    testID="books-settings-access-search"
                />
                <AccessError isVisible={section.hasLoadError} onRetry={section.retryLoad} />
                <AccessLoading isVisible={!section.isReady && !section.hasLoadError} />
                <AccessRows
                    isVisible={isLoaded}
                    people={section.people}
                    viewerOrgRole={section.viewerOrgRole}
                    viewerId={section.viewerId}
                />
                <AccessEmpty text={section.emptyText} isVisible={isLoaded && section.isEmpty} />
            </View>
        </SectionCard>
    )
}

// The write controls exist only for a Books admin; no other level builds them.
export function AccessSection({ isAdmin }: { isAdmin: boolean }) {
    if (!isAdmin) return null
    return <AccessBody />
}
