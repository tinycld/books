import { errorToString } from '@tinycld/core/lib/errors'
import { Dialog } from '@tinycld/core/ui/dialog'
import { TextInput, useForm, zodResolver } from '@tinycld/core/ui/form'
import { useFormState } from 'react-hook-form'
import { type ReverseValues, reverseSchema } from '../../lib/entry-schema'
import { RefusalSummary } from './RefusalSummary'

interface ReverseDialogProps {
    isVisible: boolean
    entryNumber: string
    entryDate: string
    defaultDate: string
    isPending: boolean
    onConfirm(values: ReverseValues): Promise<void>
    onCancel(): void
}

interface ReverseFormProps extends Omit<ReverseDialogProps, 'isVisible' | 'isPending'> {}

function ignore() {}

// Mounted only while the dialog is open, so each opening starts from the defaults.
function ReverseForm({
    entryNumber,
    entryDate,
    defaultDate,
    onConfirm,
    onCancel,
}: ReverseFormProps) {
    const form = useForm<ReverseValues>({
        resolver: zodResolver(reverseSchema(entryDate)),
        defaultValues: { date: defaultDate, memo: `Reversal of ${entryNumber}` },
    })
    const { control, handleSubmit, setError, clearErrors } = form
    const { errors, isSubmitting } = useFormState({ control })
    const submit = handleSubmit(async values => {
        clearErrors('root.server')
        try {
            await onConfirm(values)
        } catch (error) {
            setError('root.server', { type: 'server', message: errorToString(error) })
        }
    })
    return (
        <>
            <Dialog.Body>
                <TextInput
                    name="date"
                    control={control}
                    label="Reversal date"
                    hint="Not before the entry date"
                    testID="reverse-date"
                />
                <TextInput name="memo" control={control} label="Memo" testID="reverse-memo" />
                <RefusalSummary message={errors.root?.server?.message} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onCancel} isDisabled={isSubmitting} />
                <Dialog.ActionButton
                    label="Reverse entry"
                    onPress={isSubmitting ? ignore : submit}
                    isDisabled={isSubmitting}
                    testID="reverse-confirm"
                />
            </Dialog.Footer>
        </>
    )
}

// Escape, the backdrop and Close are ignored while the reverse is in flight, as in VoidDialog.
export function ReverseDialog({ isVisible, isPending, onCancel, ...rest }: ReverseDialogProps) {
    return (
        <Dialog
            isOpen={isVisible}
            onClose={isPending ? ignore : onCancel}
            title={`Reverse ${rest.entryNumber}`}
            testID="reverse-dialog"
        >
            {isVisible ? <ReverseForm {...rest} onCancel={onCancel} /> : null}
        </Dialog>
    )
}
