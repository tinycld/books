import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { Ellipsis } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { type GestureResponderEvent, Pressable, View } from 'react-native'

const TOUCH_TARGET = { minHeight: 44 }

interface OpeningActionBarProps {
    isWide: boolean
    hasDraft: boolean
    isSaving: boolean
    isPosting: boolean
    isBlocked: boolean
    hasAmounts: boolean
    onCancel: () => void
    onSave: () => void
    onPost: () => void
    onDiscard: () => void
}

function swallow(event: GestureResponderEvent) {
    event.stopPropagation()
}

// The menu's content is portaled, but React still bubbles its presses up the
// tree; a Pressable swallows the presses that reach it.
function PressBoundary({ children }: { children: ReactNode }) {
    return (
        <Pressable accessible={false} focusable={false} onPress={swallow}>
            {children}
        </Pressable>
    )
}

function DiscardButton({ isVisible, onPress }: { isVisible: boolean; onPress: () => void }) {
    if (!isVisible) return null
    return (
        <Button testID="opening-discard" variant="outline" style={TOUCH_TARGET} onPress={onPress}>
            <ButtonText className="text-destructive">Discard draft</ButtonText>
        </Button>
    )
}

function MoreMenu({ isVisible, onDiscard }: { isVisible: boolean; onDiscard: () => void }) {
    const color = useThemeColor('foreground')
    if (!isVisible) return null
    return (
        <PressBoundary>
            <Menu
                title="More"
                placement="top-end"
                trigger={
                    <Pressable
                        testID="opening-more"
                        accessibilityRole="button"
                        accessibilityLabel="More"
                        className="items-center justify-center rounded-md border border-border"
                        style={{ width: 44, height: 44 }}
                    >
                        <Ellipsis size={18} color={color} />
                    </Pressable>
                }
            >
                <Menu.Item label="Discard draft" isDestructive onSelect={onDiscard} />
            </Menu>
        </PressBoundary>
    )
}

export function OpeningActionBar(props: OpeningActionBarProps) {
    const { isWide, hasDraft, isSaving, isPosting, isBlocked, hasAmounts } = props
    const isBusy = isSaving || isPosting
    return (
        <View
            testID="opening-actions"
            className="flex-row items-center justify-end gap-2 border-t border-border bg-background px-4 py-3"
        >
            <Button
                testID="opening-cancel"
                variant="outline"
                style={TOUCH_TARGET}
                onPress={props.onCancel}
            >
                <ButtonText>Cancel</ButtonText>
            </Button>
            <DiscardButton isVisible={isWide && hasDraft} onPress={props.onDiscard} />
            <MoreMenu isVisible={!isWide && hasDraft} onDiscard={props.onDiscard} />
            <Button
                testID="opening-save"
                variant="outline"
                isDisabled={isBlocked || isBusy}
                style={TOUCH_TARGET}
                onPress={props.onSave}
            >
                <ButtonText>{isSaving ? 'Saving...' : 'Save draft'}</ButtonText>
            </Button>
            <Button
                testID="opening-post"
                isDisabled={!hasAmounts || isBlocked || isBusy}
                style={TOUCH_TARGET}
                onPress={props.onPost}
            >
                <ButtonText>{isPosting ? 'Posting...' : 'Post'}</ButtonText>
            </Button>
        </View>
    )
}
