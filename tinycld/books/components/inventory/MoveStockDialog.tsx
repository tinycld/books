import { LoadingState } from '@tinycld/core/components/LoadingState'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import {
    FormErrorSummary,
    NumberInput,
    SelectInput,
    TextAreaInput,
    useController,
    useWatch,
} from '@tinycld/core/ui/form'
import { Text, View } from 'react-native'
import { type MoveStockModel, useMoveStock } from '../../hooks/useMoveStock'
import { rootErrorOnly } from '../../lib/root-errors'
import { BinPicker } from '../bins/BinPicker'
import { DialogLoadError } from '../taxes/DialogLoadError'

const LOAD_ERROR = 'Could not load the bin locations of this item.'
const NOTHING_TO_MOVE = 'No bin location holds this item, so there is nothing to move.'

function LoadingBody({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="move-stock-loading" className="py-6">
            <LoadingState />
        </View>
    )
}

function NothingBody({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="move-stock-nothing" className="py-4 text-sm text-muted-foreground">
            {NOTHING_TO_MOVE}
        </Text>
    )
}

function FieldError({ message, testID }: { message: string | undefined; testID: string }) {
    if (!message) return null
    return (
        <Text testID={testID} className="text-xs text-danger">
            {message}
        </Text>
    )
}

// To: the active bins and No bin, without the From bin (BinPicker's `excludes`); a null
// value is no choice yet (useMoveStock).
function ToField({ dialog }: { dialog: MoveStockModel }) {
    const { control } = dialog.form
    const from = useWatch({ control, name: 'from' })
    const { field, fieldState } = useController({ control, name: 'to' })
    return (
        <View className="mb-3 gap-1.5">
            <Text className="text-sm font-semibold text-foreground">To</Text>
            <BinPicker
                value={field.value}
                onChange={field.onChange}
                testID="move-stock-to"
                disabled={dialog.isSaving}
                label="To"
                excludes={from}
            />
            <FieldError message={fieldState.error?.message} testID="move-stock-to-error" />
        </View>
    )
}

function MoveFields({ isVisible, dialog }: { isVisible: boolean; dialog: MoveStockModel }) {
    if (!isVisible) return null
    const { control, formState } = dialog.form
    return (
        <View className="gap-1">
            <SelectInput
                control={control}
                name="from"
                label="From"
                options={dialog.fromOptions}
                disabled={dialog.isSaving}
                onValueChange={dialog.changeFrom}
                autoFocus
                testID="move-stock-from"
            />
            <ToField dialog={dialog} />
            <NumberInput
                control={control}
                name="quantity"
                label="Quantity"
                allowDecimal
                hideSteppers
                disabled={dialog.isSaving}
                testID="move-stock-quantity"
            />
            <TextAreaInput control={control} name="memo" label="Memo" testID="move-stock-memo" />
            <FormErrorSummary
                testID="move-stock-errors"
                errors={rootErrorOnly(formState.errors)}
                showFieldNames={false}
                isEnabled={dialog.summaryEnabled}
            />
        </View>
    )
}

// A failed load, or no bin to move from, leaves nothing to submit.
function SubmitButton({
    isVisible,
    isDisabled,
    onPress,
}: {
    isVisible: boolean
    isDisabled: boolean
    onPress: () => void
}) {
    if (!isVisible) return null
    return (
        <Dialog.ActionButton
            label="Move stock"
            onPress={onPress}
            isDisabled={isDisabled}
            shortcut={DIALOG_SUBMIT_SHORTCUT}
            testID="move-stock-save"
        />
    )
}

interface MoveStockDialogProps {
    isOpen: boolean
    item: { id: string; default_bin: string }
    onClose: () => void
}

function MoveStockBody({ item, onClose }: Omit<MoveStockDialogProps, 'isOpen'>) {
    const dialog = useMoveStock(item, onClose)
    // A close while the move runs would drop its refusal with the form.
    const close = () => {
        if (!dialog.isSaving) onClose()
    }
    const submit = () => dialog.submit()
    const isForm = dialog.state === 'form'
    const isLoading = dialog.state === 'loading'
    const isLoadError = dialog.state === 'load-error'
    const isNothing = dialog.state === 'nothing'
    return (
        <Dialog isOpen onClose={close} title="Move stock" size="sm" testID="move-stock-dialog">
            <Dialog.Body>
                <LoadingBody isVisible={isLoading} />
                <DialogLoadError
                    isVisible={isLoadError}
                    testIdPrefix="move-stock-load"
                    message={LOAD_ERROR}
                    onRetry={dialog.retryLoad}
                />
                <NothingBody isVisible={isNothing} />
                <MoveFields isVisible={isForm} dialog={dialog} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={close} isDisabled={dialog.isSaving} />
                <SubmitButton isVisible={isForm} isDisabled={!dialog.canSubmit} onPress={submit} />
            </Dialog.Footer>
        </Dialog>
    )
}

/**
 * Move stock (`move-stock-dialog`; inventory-adjust spec §3.8), a core Dialog (a Sheet on a
 * phone) with its own shortcut scope, so the page's keys are off while it is open: From
 * (focused when the form shows, SelectInput `autoFocus`), To, Quantity and Memo stacked,
 * and Move stock on the dialog's submit key. The form
 * mounts on each open, so it starts from the item's bins as they are then.
 */
export function MoveStockDialog({ isOpen, item, onClose }: MoveStockDialogProps) {
    if (!isOpen) return null
    return <MoveStockBody item={item} onClose={onClose} />
}
