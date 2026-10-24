import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ArrowLeft } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSettingsShell } from '../../hooks/useSettingsShell'
import type { SectionId } from '../../lib/settings-sections'
import { SectionBody } from './SectionBody'
import { SectionList, type SectionListItem } from './SectionList'

function ShellLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <LoadingState />
}

function ShellError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View accessibilityRole="alert" className="items-center gap-3 p-6">
            <Text className="text-sm text-foreground">Settings could not be loaded.</Text>
            <Button size="sm" variant="outline" testID="books-settings-retry" onPress={onRetry}>
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

interface DetailProps {
    isVisible: boolean
    isWide: boolean
    sections: SectionListItem[]
    openId: SectionId | undefined
    isAdmin: boolean
    onOpen: (id: SectionId) => void
    onBack: () => void
}

function BackBar({
    isVisible,
    label,
    onBack,
}: {
    isVisible: boolean
    label?: string
    onBack: () => void
}) {
    const foreground = useThemeColor('foreground')
    if (!isVisible) return null
    return (
        <Pressable
            testID="books-settings-back"
            accessibilityRole="button"
            accessibilityLabel="Back to settings"
            onPress={onBack}
            className="h-11 flex-row items-center gap-2 border-b border-border px-4"
        >
            <ArrowLeft size={20} color={foreground} />
            <Text className="text-base font-semibold text-foreground">{label}</Text>
        </Pressable>
    )
}

function SectionTitle({ isVisible, label }: { isVisible: boolean; label?: string }) {
    if (!isVisible) return null
    return <Text className="text-xl font-semibold text-foreground">{label}</Text>
}

// One tree for both breakpoints: only the chrome (rail or back bar) comes and goes, so the
// section body keeps its position and a dirty form keeps its edits when the window resizes.
function DetailFrame(props: DetailProps) {
    const { isVisible, isWide, sections, openId, isAdmin, onOpen, onBack } = props
    if (!isVisible || !openId) return null
    const label = sections.find(s => s.id === openId)?.label
    return (
        <View className={isWide ? 'flex-1 flex-row' : 'flex-1'}>
            <SectionList isVisible={isWide} variant="rail" sections={sections} onOpen={onOpen} />
            <View className="flex-1">
                <BackBar isVisible={!isWide} label={label} onBack={onBack} />
                <ScrollView
                    className="flex-1"
                    contentContainerClassName={isWide ? 'gap-4 p-5' : 'gap-4 p-4'}
                >
                    <SectionTitle isVisible={isWide} label={label} />
                    <SectionBody section={openId} isAdmin={isAdmin} />
                </ScrollView>
            </View>
        </View>
    )
}

export function SettingsShell({ section }: { section: SectionId | undefined }) {
    const { part, sections, openId, isAdmin, openSection, back, retry } = useSettingsShell(section)
    const isWide = useBreakpoint() !== 'mobile'

    return (
        <View className="flex-1 bg-background" testID="books-settings">
            <ShellLoading isVisible={part === 'loading'} />
            <ShellError isVisible={part === 'error'} onRetry={retry} />
            <DetailFrame
                isVisible={part === 'detail'}
                isWide={isWide}
                sections={sections}
                openId={openId}
                isAdmin={isAdmin}
                onOpen={openSection}
                onBack={back}
            />
            <SectionList
                isVisible={part === 'list'}
                variant="rows"
                sections={sections}
                onOpen={openSection}
            />
        </View>
    )
}
