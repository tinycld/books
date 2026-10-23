import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import {
    Drawer,
    DrawerBackdrop,
    DrawerBody,
    DrawerCloseButton,
    DrawerContent,
    DrawerFooter,
    DrawerHeader,
} from '@tinycld/core/ui/drawer'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { X } from 'lucide-react-native'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { useAccountForm } from '../../hooks/useAccountForm'
import { type AccountRow, useAccountsQuery } from '../../hooks/useAccountsQuery'
import { type PanelTarget, useAccountsPanelStore } from '../../stores/accounts-panel-store'
import { AccountPanelFields } from './AccountPanelFields'

interface Placement {
    isWide: boolean
    isTablet: boolean
}

const INLINE_WIDTH = 'w-[380px]'

function placementProps({ isWide, isTablet }: Placement) {
    if (isWide && !isTablet) {
        return {
            presentation: 'inline',
            anchor: 'right',
            size: 'md',
        } as const
    }
    if (isTablet) return { presentation: 'overlay', anchor: 'right', size: 'md' } as const
    return { presentation: 'overlay', anchor: 'bottom', size: 'lg' } as const
}

function contentClass({ isWide, isTablet }: Placement) {
    return isWide && !isTablet ? INLINE_WIDTH : undefined
}

function titleFor(target: PanelTarget, isReadOnly: boolean) {
    if (target.mode === 'new') return target.parentId === '' ? 'New account' : 'New sub-account'
    return isReadOnly ? 'Account' : 'Edit account'
}

interface FooterProps {
    isReadOnly: boolean
    isEditing: boolean
    isSaving: boolean
    isSaveBlocked: boolean
    onCancel: () => void
    onSave: () => void
    onSaveAndNew: () => void
}

function ReadOnlyFooter({ isVisible, onClose }: { isVisible: boolean; onClose: () => void }) {
    if (!isVisible) return null
    return (
        <Button variant="outline" onPress={onClose}>
            <ButtonText>Close</ButtonText>
        </Button>
    )
}

function SaveAndNewButton({
    isVisible,
    isSaving,
    onPress,
}: {
    isVisible: boolean
    isSaving: boolean
    onPress: () => void
}) {
    if (!isVisible) return null
    return (
        <ServerActionButton variant="outline" isDisabled={isSaving} onPress={onPress}>
            <ButtonText>Save and new</ButtonText>
        </ServerActionButton>
    )
}

function WriterButtons({
    isVisible,
    isEditing,
    isSaving,
    isSaveBlocked,
    onCancel,
    onSave,
    onSaveAndNew,
}: Omit<FooterProps, 'isReadOnly'> & { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <>
            <Button variant="outline" onPress={onCancel}>
                <ButtonText>Cancel</ButtonText>
            </Button>
            <SaveAndNewButton isVisible={!isEditing} isSaving={isSaving} onPress={onSaveAndNew} />
            <ServerActionButton isDisabled={isSaving || isSaveBlocked} onPress={onSave}>
                <ButtonText>Save</ButtonText>
            </ServerActionButton>
        </>
    )
}

function PanelFooter(props: FooterProps) {
    const { isReadOnly, onCancel, ...writer } = props
    return (
        <DrawerFooter testID="account-panel-footer" className="border-t border-border">
            <ReadOnlyFooter isVisible={isReadOnly} onClose={onCancel} />
            <WriterButtons isVisible={!isReadOnly} onCancel={onCancel} {...writer} />
        </DrawerFooter>
    )
}

interface BodyProps extends Placement {
    target: PanelTarget
    accounts: AccountRow[]
    isReady: boolean
}

function MissingNotice({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View accessibilityRole="alert" className="mb-3">
            <Text className="text-sm text-danger">This account no longer exists</Text>
        </View>
    )
}

function AccountPanelBody({ target, accounts, isReady, ...placement }: BodyProps) {
    const close = useAccountsPanelStore(s => s.close)
    const closeColor = useThemeColor('foreground')
    const account = useAccountForm(target, accounts, isReady)
    const { form, isReadOnly, isEditing, isMissing, isSaving, save, saveAndNew } = account
    const { errors, isSubmitted } = form.formState

    return (
        <Drawer isOpen onClose={close} {...placementProps(placement)}>
            <DrawerBackdrop />
            <DrawerContent testID="account-panel" className={contentClass(placement)}>
                <DrawerHeader testID="account-panel-header" className="border-b border-border">
                    <Text className="text-lg font-semibold text-foreground">
                        {titleFor(target, isReadOnly)}
                    </Text>
                    <DrawerCloseButton>
                        <X size={18} color={closeColor} />
                    </DrawerCloseButton>
                </DrawerHeader>
                <DrawerBody style={{ flexShrink: 1 }}>
                    <FormErrorSummary
                        testID="account-form-errors"
                        errors={errors}
                        isEnabled={isSubmitted}
                    />
                    <MissingNotice isVisible={isMissing} />
                    <AccountPanelFields account={account} accounts={accounts} />
                </DrawerBody>
                <PanelFooter
                    isReadOnly={isReadOnly}
                    isEditing={isEditing}
                    isSaving={isSaving}
                    isSaveBlocked={isMissing}
                    onCancel={close}
                    onSave={save}
                    onSaveAndNew={saveAndNew}
                />
            </DrawerContent>
        </Drawer>
    )
}

function LoadError({ isWide, isTablet }: Placement) {
    const close = useAccountsPanelStore(s => s.close)
    const closeColor = useThemeColor('foreground')
    return (
        <Drawer isOpen onClose={close} {...placementProps({ isWide, isTablet })}>
            <DrawerBackdrop />
            <DrawerContent
                testID="account-panel-error"
                className={contentClass({ isWide, isTablet })}
            >
                <DrawerHeader className="border-b border-border">
                    <Text className="text-lg font-semibold text-foreground">Account</Text>
                    <DrawerCloseButton accessibilityLabel="Close">
                        <X size={18} color={closeColor} />
                    </DrawerCloseButton>
                </DrawerHeader>
                <DrawerBody>
                    <View accessibilityRole="alert">
                        <Text className="text-sm text-danger">Could not load this account</Text>
                    </View>
                </DrawerBody>
                <DrawerFooter className="border-t border-border">
                    <Button variant="outline" onPress={close}>
                        <ButtonText>Close</ButtonText>
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    )
}

// Until an edit's row first appears: nothing while the query loads, a load error
// if it failed, and the body (with its "no longer exists" notice) once it is
// ready without the row. After the row has appeared the body stays mounted, so
// typed input survives the row being deleted elsewhere.
function OpenAccountPanel({ target, ...placement }: Placement & { target: PanelTarget }) {
    const { data, isReady, isError } = useAccountsQuery()
    const accounts = data ?? []
    const [appeared, setAppeared] = useState(false)
    const hasRow = target.mode === 'edit' && accounts.some(a => a.id === target.id)
    if (hasRow && !appeared) setAppeared(true)
    const isWaiting = target.mode === 'edit' && !hasRow && !appeared
    if (isWaiting && isError) return <LoadError {...placement} />
    if (isWaiting && !isReady) return null
    return <AccountPanelBody target={target} accounts={accounts} isReady={isReady} {...placement} />
}

export function AccountPanel(placement: Placement) {
    const target = useAccountsPanelStore(s => s.target)
    if (!target) return null
    // seq changes on every open, so re-opening the same target remounts a fresh form.
    const key = target.mode === 'new' ? `new:${target.parentId}` : `edit:${target.id}`
    return <OpenAccountPanel key={`${key}:${target.seq}`} target={target} {...placement} />
}
