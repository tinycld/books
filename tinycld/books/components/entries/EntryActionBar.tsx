import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { View } from 'react-native'

interface EntryActionBarProps {
    isWide: boolean
    isPending: boolean
    onCancel(): void
    onSaveDraft(): void
    onPost(): void
    onPostAndNew(): void
}

const TAP = { minHeight: 44 }

function MoreMenu({
    isPending,
    onPostAndNew,
}: Pick<EntryActionBarProps, 'isPending' | 'onPostAndNew'>) {
    // The menu item posts, so it is gated like the buttons that write.
    const postAndNew = useServerActionState({ isDisabled: isPending })
    return (
        <Menu
            title="More"
            placement="top-end"
            trigger={
                <Button testID="entry-more" variant="outline" style={TAP} isDisabled={isPending}>
                    <ButtonText>More</ButtonText>
                </Button>
            }
        >
            <Menu.Item
                testID="entry-post-new"
                label="Post & new"
                isDisabled={postAndNew.isDisabled}
                onSelect={onPostAndNew}
            />
        </Menu>
    )
}

function PostAndNewButton({
    isVisible,
    isPending,
    onPress,
}: {
    isVisible: boolean
    isPending: boolean
    onPress(): void
}) {
    if (!isVisible) return null
    return (
        <ServerActionButton
            testID="entry-post-new"
            variant="outline"
            style={TAP}
            isDisabled={isPending}
            onPress={onPress}
        >
            <ButtonText>Post & new</ButtonText>
        </ServerActionButton>
    )
}

function PhoneMore({
    isVisible,
    isPending,
    onPostAndNew,
}: Pick<EntryActionBarProps, 'isPending' | 'onPostAndNew'> & { isVisible: boolean }) {
    if (!isVisible) return null
    return <MoreMenu isPending={isPending} onPostAndNew={onPostAndNew} />
}

export function EntryActionBar({
    isWide,
    isPending,
    onCancel,
    onSaveDraft,
    onPost,
    onPostAndNew,
}: EntryActionBarProps) {
    const layout = isWide ? 'justify-end' : 'justify-between'
    return (
        <View
            testID="entry-actions"
            className={`flex-row items-center gap-2 border-t border-border bg-surface px-4 py-2 ${layout}`}
        >
            <Button
                testID="entry-cancel"
                variant="outline"
                style={TAP}
                isDisabled={isPending}
                onPress={onCancel}
            >
                <ButtonText>Cancel</ButtonText>
            </Button>
            <ServerActionButton
                testID="entry-save-draft"
                variant="outline"
                style={TAP}
                isDisabled={isPending}
                onPress={onSaveDraft}
            >
                <ButtonText>Save draft</ButtonText>
            </ServerActionButton>
            <PostAndNewButton isVisible={isWide} isPending={isPending} onPress={onPostAndNew} />
            <ServerActionButton
                testID="entry-post"
                style={TAP}
                isDisabled={isPending}
                onPress={onPost}
            >
                <ButtonText>Post</ButtonText>
            </ServerActionButton>
            <PhoneMore isVisible={!isWide} isPending={isPending} onPostAndNew={onPostAndNew} />
        </View>
    )
}
