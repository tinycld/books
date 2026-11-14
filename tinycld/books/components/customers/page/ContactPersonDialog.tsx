import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import {
    type Control,
    FormErrorSummary,
    TextInput,
    useController,
    useForm,
    zodResolver,
} from '@tinycld/core/ui/form'
import { Switch } from '@tinycld/core/ui/switch'
import { newRecordId } from 'pbtsdb/core'
import { useRef } from 'react'
import { type KeyDownEvent, Text, type TextInputInstance, View } from 'react-native'
import { type ContactPersonValues, contactPersonSchema } from '../../../lib/contact-person-schema'
import { rootErrorOnly } from '../../../lib/root-errors'
import type { BooksPartyContacts } from '../../../types'
import { ListBanner } from '../../ListBanner'

interface ContactPersonDialogProps {
    customerId: string
    // The row the tab rendered, or null for Add.
    contact: BooksPartyContacts | null
    isOpen: boolean
    onClose: () => void
}

const EMPTY_CONTACT: ContactPersonValues = {
    name: '',
    role: '',
    email: '',
    phone: '',
    is_primary: false,
}

function valuesOf(contact: BooksPartyContacts | null): ContactPersonValues {
    if (contact === null) return EMPTY_CONTACT
    return {
        name: contact.name,
        role: contact.role,
        email: contact.email,
        phone: contact.phone,
        is_primary: contact.is_primary,
    }
}

// The form, the save and the edited row's own read. The tab mounts a new dialog for each
// open, so the form starts from the row as the tab rendered it. The read tells when that
// row is deleted elsewhere while the dialog is open: the dialog then says so and Save is
// off. The row is already in the store (the tab's list holds it), so the read sends no
// request unless it has to.
function useContactPersonDialog({ customerId, contact, onClose }: ContactPersonDialogProps) {
    const [contactsCollection] = useStore('books_party_contacts')
    const contactId = contact?.id ?? ''
    const storedQuery = useLiveQuery({
        query: q =>
            contactId
                ? q
                      .from({ c: contactsCollection })
                      .where(({ c }) => eq(c.id, contactId))
                      .findOne()
                : undefined,
        queryKey: ['books.customer-page.contact', contactId],
    })
    const form = useForm<ContactPersonValues>({
        resolver: zodResolver(contactPersonSchema),
        defaultValues: valuesOf(contact),
    })

    const save = useMutation({
        mutationFn: function* (values: ContactPersonValues) {
            if (contact === null) {
                yield contactsCollection.insert({
                    id: newRecordId(),
                    customer: customerId,
                    vendor: '',
                    ...values,
                })
                return
            }
            yield contactsCollection.update(contact.id, draft => {
                Object.assign(draft, values)
            })
        },
        onSuccess: () => onClose(),
        onError: handleMutationErrorsWithForm({
            setError: form.setError,
            getValues: form.getValues,
        }),
    })

    const isEdit = contact !== null
    const loadFailed = isEdit && storedQuery.isError
    const isLoading = isEdit && !storedQuery.isReady && !loadFailed
    const isRemoved = isEdit && storedQuery.isReady && storedQuery.data === undefined
    const canSave = !loadFailed && !isLoading && !isRemoved && !save.isPending

    const submit = () => {
        if (!canSave) return
        void form.handleSubmit(values => save.mutate(values))()
    }
    // A close while the save runs would drop its refusal with the form.
    const close = () => {
        if (!save.isPending) onClose()
    }
    const retryLoad = () => {
        void recoverLiveQueries({
            queries: [storedQuery.collection],
            sources: [contactsCollection],
            onError: err => log.warn('books.customer-page', 'retry failed', { err }),
        })
    }

    return {
        form,
        title: isEdit ? 'Edit contact' : 'Add contact',
        submit,
        close,
        canSave,
        isSaving: save.isPending,
        isRemoved,
        loadFailed,
        retryLoad,
    }
}

// The Primary contact switch: core form Toggle's layout, plus Space to turn it on and off
// from the keyboard. react-native-web's Pressable presses on Space only for a button
// role, and core Switch has the switch role, so core Toggle does not answer Space. The
// field's test id is on the row that holds the label and the switch.
function PrimaryContactField({ control }: { control: Control<ContactPersonValues> }) {
    const { field } = useController({ control, name: 'is_primary' })
    const onKeyDown = (event: KeyDownEvent) => {
        if (event.nativeEvent.key !== ' ' || event.target !== event.currentTarget) return
        event.preventDefault()
        field.onChange(!field.value)
    }
    return (
        <View testID="contact-primary" className="mb-3 flex-row items-center justify-between gap-2">
            <Text className="min-w-0 shrink text-sm font-semibold text-foreground">
                Primary contact
            </Text>
            <Switch
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                onKeyDown={onKeyDown}
                accessibilityLabel="Primary contact"
                testID="contact-primary-switch"
            />
        </View>
    )
}

function RemovedNotice({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View
            testID="contact-dialog-removed"
            accessibilityRole="alert"
            className="rounded-lg border border-border bg-muted px-3 py-2"
        >
            <Text className="text-sm text-foreground">This contact was removed</Text>
        </View>
    )
}

function LoadError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <ListBanner
            testIdPrefix="contact-dialog-load"
            message="This contact could not load."
            onRetry={onRetry}
            isFlush
        />
    )
}

/**
 * Add contact / Edit contact (spec §3.6): Name, Role, Email, Phone and Primary through the
 * zod schema; the focus starts in Name; ⌘↵ saves. Making a contact primary here clears the
 * others' flag on the server. A refusal shows on its field, or in the summary.
 */
export function ContactPersonDialog(props: ContactPersonDialogProps) {
    const dialog = useContactPersonDialog(props)
    const nameRef = useRef<TextInputInstance>(null)
    const { control, formState } = dialog.form
    const submit = () => dialog.submit()
    const rootErrors = rootErrorOnly(formState.errors)
    const isSaveDisabled = !dialog.canSave
    return (
        <Dialog
            isOpen={props.isOpen}
            onClose={dialog.close}
            title={dialog.title}
            size="md"
            initialFocusRef={nameRef}
            testID="contact-dialog"
        >
            <Dialog.Body>
                <RemovedNotice isVisible={dialog.isRemoved} />
                <LoadError isVisible={dialog.loadFailed} onRetry={dialog.retryLoad} />
                <TextInput
                    control={control}
                    name="name"
                    label="Name"
                    testID="contact-name"
                    inputRef={nameRef}
                />
                <TextInput control={control} name="role" label="Role" testID="contact-role" />
                <TextInput
                    control={control}
                    name="email"
                    label="Email"
                    testID="contact-email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                />
                <TextInput
                    control={control}
                    name="phone"
                    label="Phone"
                    testID="contact-phone"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                />
                <PrimaryContactField control={control} />
                <FormErrorSummary
                    testID="contact-dialog-errors"
                    errors={rootErrors}
                    showFieldNames={false}
                    isEnabled={formState.isSubmitted}
                />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={dialog.close} isDisabled={dialog.isSaving} />
                <Dialog.ActionButton
                    label="Save"
                    onPress={submit}
                    isDisabled={isSaveDisabled}
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID="contact-save"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
