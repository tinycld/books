import { useLeaveGuard } from '@tinycld/core/components/forms-builder/use-leave-guard'
import type { FormDefinition } from '@tinycld/core/lib/forms/definition'
import { Button, ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { ConfirmDialog } from '@tinycld/core/ui/ConfirmDialog'
import { FormRenderer } from '@tinycld/core/ui/forms'
import { useEffect } from 'react'
import { View } from 'react-native'
import { useDetailSurface } from '../hooks/useDetailSurface'
import type { useRecordForm } from '../hooks/useRecordForm'
import type { useRecordSave } from '../hooks/useRecordSave'
import { type DetailSurface, formRowClassFor } from '../lib/detail-surface'
import { recordFooter } from '../lib/record-display'
import type { RecordFormStore } from '../stores/record-form-store'
import { RecordLoadingBody, RecordSurface } from './RecordSurface'

export type RecordChildState = ReturnType<typeof useRecordForm> &
    ReturnType<typeof useRecordSave> & { title: string }

type Mode = 'new' | 'edit'

interface RecordFormBodyProps {
    state: RecordChildState
    definition: FormDefinition
    surface: DetailSurface
    testIdPrefix: string
}

// The core renderer owns the scroll view; each row is the surface's content column.
function RecordFormBody({ state, definition, surface, testIdPrefix }: RecordFormBodyProps) {
    return (
        <View className="flex-1 pt-4">
            <FormRenderer
                layout="sections"
                host={state.host}
                ui={state.ui}
                definition={definition}
                form={state.form}
                context={state.context}
                recordId={state.recordId}
                readOnly={state.readOnly}
                schemaRef={state.schemaRef}
                summary="root"
                scroll={{ rowClassName: formRowClassFor(surface) }}
                testID={`${testIdPrefix}-form`}
            />
        </View>
    )
}

interface FooterButtonProps {
    isVisible: boolean
    onPress: () => void
}

function CancelButton({
    isVisible,
    onPress,
    isDisabled,
    testID,
}: FooterButtonProps & { isDisabled: boolean; testID: string }) {
    if (!isVisible) return null
    return (
        <Button testID={testID} variant="outline" isDisabled={isDisabled} onPress={onPress}>
            <ButtonText>Cancel</ButtonText>
        </Button>
    )
}

function CloseButton({ isVisible, onPress, testID }: FooterButtonProps & { testID: string }) {
    if (!isVisible) return null
    return (
        <Button testID={testID} variant="outline" onPress={onPress}>
            <ButtonText>Close</ButtonText>
        </Button>
    )
}

interface SaveButtonProps extends FooterButtonProps {
    testID: string
    label: string
    variant: 'default' | 'outline'
    isDisabled: boolean
}

function SaveButton({ isVisible, onPress, testID, label, variant, isDisabled }: SaveButtonProps) {
    if (!isVisible) return null
    return (
        <ServerActionButton
            testID={testID}
            variant={variant}
            isDisabled={isDisabled}
            onPress={onPress}
        >
            <ButtonText>{label}</ButtonText>
        </ServerActionButton>
    )
}

interface RecordFooterProps {
    state: RecordChildState
    mode: Mode
    testIdPrefix: string
    onLeave: () => void
}

function RecordFooter({ state, mode, testIdPrefix, onLeave }: RecordFooterProps) {
    const shown = recordFooter({ mode, canWrite: state.canWrite })
    return (
        <>
            <CloseButton
                isVisible={shown.close}
                onPress={onLeave}
                testID={`${testIdPrefix}-close-footer`}
            />
            <CancelButton
                isVisible={shown.cancel}
                onPress={onLeave}
                isDisabled={state.isSaving}
                testID={`${testIdPrefix}-cancel`}
            />
            <SaveButton
                isVisible={shown.saveAndNew}
                onPress={state.saveAndNew}
                testID={`${testIdPrefix}-save-new`}
                label="Save and new"
                variant="outline"
                isDisabled={state.isSaving}
            />
            <SaveButton
                isVisible={shown.save}
                onPress={state.save}
                testID={`${testIdPrefix}-save`}
                label="Save"
                variant="default"
                isDisabled={state.isSaving}
            />
        </>
    )
}

// Whether the form holds unsaved edits, read the way useRecordForm reads it.
function hasDirtyFields(dirtyFields: object | undefined, readOnly: boolean) {
    return !readOnly && dirtyFields !== undefined && Object.keys(dirtyFields).length > 0
}

/**
 * Tells the list whether the open record has unsaved edits, so its delete dialog can
 * warn that they will be lost. Edit mode only (a new record has no row to delete). The
 * form is an outside source here: the subscription sets no React state. On unmount it
 * clears the entry, and ends a delete of this record, whose screen goes away once the
 * delete lands.
 */
function usePublishDirty<R extends { id: string }>(
    store: RecordFormStore<R>,
    form: RecordChildState['form'],
    editedId: string | null,
    readOnly: boolean
) {
    useEffect(() => {
        if (editedId === null) return
        const state = store.getState()
        state.setDirtyRecord(editedId, hasDirtyFields(form.formState.dirtyFields, readOnly))
        const unsubscribe = form.subscribe({
            formState: { dirtyFields: true },
            callback: ({ dirtyFields }) =>
                state.setDirtyRecord(editedId, hasDirtyFields(dirtyFields, readOnly)),
        })
        return () => {
            unsubscribe()
            store.getState().setDirtyRecord(editedId, false)
        }
    }, [store, form, editedId, readOnly])
    // Apart from the subscription, so a change of access level mid-delete keeps the flag.
    useEffect(() => {
        if (editedId === null) return
        return () => {
            const current = store.getState()
            if (current.deleting?.id === editedId) current.endDeleting()
        }
    }, [store, editedId])
}

// Asks before an unsaved form is left; Discard lets the held navigation go on.
function DiscardDialog({
    guard,
    message,
}: {
    guard: ReturnType<typeof useLeaveGuard>
    message: string
}) {
    return (
        <ConfirmDialog
            isOpen={guard.isConfirming}
            onClose={guard.cancel}
            onConfirm={guard.discard}
            title="Discard changes?"
            message={message}
            confirmLabel="Discard"
            cancelLabel="Keep editing"
            isDestructive
            requiresServer={false}
        />
    )
}

interface RecordChildProps<R extends { id: string }> {
    state: RecordChildState
    mode: Mode
    // The open record's id in edit mode; null on a new record.
    editedId: string | null
    testIdPrefix: string
    backLabel: string
    // The Discard changes? question's message.
    discardMessage: string
    store: RecordFormStore<R>
    onLeave: () => void
}

/**
 * The open record, new or existing. The one component that guards the form; the
 * caller holds the form (`useRecordForm`, `useRecordSave`) above the surface chrome, so
 * nothing typed is lost when the window crosses the panel width and the chrome changes
 * around it.
 */
export function RecordChild<R extends { id: string }>({
    state,
    mode,
    editedId,
    testIdPrefix,
    backLabel,
    discardMessage,
    store,
    onLeave,
}: RecordChildProps<R>) {
    const surface = useDetailSurface()
    usePublishDirty(store, state.form, editedId, state.readOnly)
    const isBeingDeleted = store(s => editedId !== null && s.deleting?.id === editedId)
    // Off while a save runs, so the `leave` that follows a saved write is not held. Cancel,
    // the back button and Escape are disabled for that time; the other ways out (the
    // package rail, the tab bar, the search palette, another list row, the browser's or
    // hardware back) still leave; a refusal then shows as a toast, and a success does not
    // navigate. Off too while this record is being deleted from its row menu, where the
    // list's delete dialog already said the edits will be lost, so the `leave` that
    // follows the delete asks nothing.
    const guard = useLeaveGuard(state.isDirty && !state.isSaving && !isBeingDeleted)
    const definition = state.isReady ? state.definition : undefined
    const body = definition ? (
        <RecordFormBody
            state={state}
            definition={definition}
            surface={surface}
            testIdPrefix={testIdPrefix}
        />
    ) : (
        <RecordLoadingBody testIdPrefix={testIdPrefix} />
    )
    const footer = definition ? (
        <RecordFooter state={state} mode={mode} testIdPrefix={testIdPrefix} onLeave={onLeave} />
    ) : null
    return (
        <RecordSurface
            surface={surface}
            testIdPrefix={testIdPrefix}
            backLabel={backLabel}
            title={state.title}
            onLeave={onLeave}
            isLeaveDisabled={state.isSaving}
            surfaceRef={state.surfaceRef}
            footer={footer}
        >
            {body}
            <DiscardDialog guard={guard} message={discardMessage} />
        </RecordSurface>
    )
}
