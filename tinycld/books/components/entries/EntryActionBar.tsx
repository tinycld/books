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
    // A saved draft's delete; it adds More with "Delete draft" (wide shows More too).
    onDeleteDraft?: () => void
    // More → Audit history, the last row; it adds More too (wide shows it). The journal
    // entry form passes it for a saved draft; the transfer form never does.
    onAuditHistory?: () => void
    // The journal entry form keeps `entry-*`; the transfer form's bar is `transfer-*`.
    testIDPrefix?: 'entry' | 'transfer'
}

type Prefix = NonNullable<EntryActionBarProps['testIDPrefix']>

const TAP = { minHeight: 44 }

function PostAndNewItem({
    isVisible,
    isPending,
    onPostAndNew,
    prefix,
}: Pick<EntryActionBarProps, 'isPending' | 'onPostAndNew'> & {
    isVisible: boolean
    prefix: Prefix
}) {
    // The menu item posts, so it is gated like the buttons that write.
    const postAndNew = useServerActionState({ isDisabled: isPending })
    if (!isVisible) return null
    return (
        <Menu.Item
            testID={`${prefix}-post-new`}
            label="Post & new"
            isDisabled={postAndNew.isDisabled}
            onSelect={onPostAndNew}
        />
    )
}

// The item only opens the delete dialog, whose confirm is gated like every write.
function DeleteDraftItem({
    onDeleteDraft,
    prefix,
}: {
    onDeleteDraft?: () => void
    prefix: Prefix
}) {
    if (!onDeleteDraft) return null
    return (
        <Menu.Item
            testID={`${prefix}-delete-draft`}
            label="Delete draft"
            isDestructive
            onSelect={onDeleteDraft}
        />
    )
}

// Opens a screen only, so it is not gated on writes.
function AuditHistoryItem({
    onAuditHistory,
    prefix,
}: {
    onAuditHistory?: () => void
    prefix: Prefix
}) {
    if (!onAuditHistory) return null
    return (
        <Menu.Item testID={`${prefix}-history`} label="Audit history" onSelect={onAuditHistory} />
    )
}

// On a phone More holds Post & new, then Delete draft, then Audit history; wide shows it
// only for a saved draft, holding Delete draft and Audit history (Post & new is a button
// there).
function MoreMenu({
    isVisible,
    isWide,
    isPending,
    onPostAndNew,
    onDeleteDraft,
    onAuditHistory,
    prefix,
}: Pick<
    EntryActionBarProps,
    'isWide' | 'isPending' | 'onPostAndNew' | 'onDeleteDraft' | 'onAuditHistory'
> & {
    isVisible: boolean
    prefix: Prefix
}) {
    if (!isVisible) return null
    return (
        <Menu
            title="More"
            placement="top-end"
            trigger={
                <Button
                    testID={`${prefix}-more`}
                    variant="outline"
                    style={TAP}
                    isDisabled={isPending}
                >
                    <ButtonText>More</ButtonText>
                </Button>
            }
        >
            <PostAndNewItem
                isVisible={!isWide}
                isPending={isPending}
                onPostAndNew={onPostAndNew}
                prefix={prefix}
            />
            <DeleteDraftItem onDeleteDraft={onDeleteDraft} prefix={prefix} />
            <AuditHistoryItem onAuditHistory={onAuditHistory} prefix={prefix} />
        </Menu>
    )
}

function PostAndNewButton({
    isVisible,
    isPending,
    onPress,
    prefix,
}: {
    isVisible: boolean
    isPending: boolean
    onPress(): void
    prefix: Prefix
}) {
    if (!isVisible) return null
    return (
        <ServerActionButton
            testID={`${prefix}-post-new`}
            variant="outline"
            style={TAP}
            isDisabled={isPending}
            onPress={onPress}
        >
            <ButtonText>Post & new</ButtonText>
        </ServerActionButton>
    )
}

export function EntryActionBar({
    isWide,
    isPending,
    onCancel,
    onSaveDraft,
    onPost,
    onPostAndNew,
    onDeleteDraft,
    onAuditHistory,
    testIDPrefix = 'entry',
}: EntryActionBarProps) {
    const layout = isWide ? 'justify-end' : 'justify-between'
    const isMoreVisible = !isWide || onDeleteDraft !== undefined || onAuditHistory !== undefined
    return (
        <View
            testID={`${testIDPrefix}-actions`}
            className={`flex-row items-center gap-2 border-t border-border bg-surface px-4 py-2 ${layout}`}
        >
            <Button
                testID={`${testIDPrefix}-cancel`}
                variant="outline"
                style={TAP}
                isDisabled={isPending}
                onPress={onCancel}
            >
                <ButtonText>Cancel</ButtonText>
            </Button>
            <ServerActionButton
                testID={`${testIDPrefix}-save-draft`}
                variant="outline"
                style={TAP}
                isDisabled={isPending}
                onPress={onSaveDraft}
            >
                <ButtonText>Save draft</ButtonText>
            </ServerActionButton>
            <PostAndNewButton
                isVisible={isWide}
                isPending={isPending}
                onPress={onPostAndNew}
                prefix={testIDPrefix}
            />
            <ServerActionButton
                testID={`${testIDPrefix}-post`}
                style={TAP}
                isDisabled={isPending}
                onPress={onPost}
            >
                <ButtonText>Post</ButtonText>
            </ServerActionButton>
            <MoreMenu
                isVisible={isMoreVisible}
                isWide={isWide}
                isPending={isPending}
                onPostAndNew={onPostAndNew}
                onDeleteDraft={onDeleteDraft}
                onAuditHistory={onAuditHistory}
                prefix={testIDPrefix}
            />
        </View>
    )
}
