import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ConfirmDialog } from '@tinycld/core/ui/ConfirmDialog'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { useState } from 'react'
import { Pressable, Text, View, type ViewStyle } from 'react-native'
import { usePartyContacts } from '../../../hooks/usePartyContacts'
import { reportUnexpected } from '../../../hooks/useRecordActions'
import { writeRefusalText } from '../../../lib/refusal'
import { ListBanner } from '../../ListBanner'
import { ListCards } from '../../ListCards'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../../ListTable'
import { RecordRowMenu } from '../../RecordRowMenu'
import { StatusBadge } from '../../StatusBadge'
import { ContactPersonDialog } from './ContactPersonDialog'
import { openLink } from './CustomerContactActions'

type Contact = ReturnType<typeof usePartyContacts>['contacts'][number]

// Header and rows share these, so the columns line up; the menu column is fixed so the
// other columns share the rest of the width.
const COLUMNS = {
    name: { flex: 1.3 },
    role: { flex: 1.3 },
    email: { flex: 1.6 },
    phone: { flex: 1 },
    menu: { width: 48 },
} satisfies Record<string, ViewStyle>

const ROW_HEIGHT = 56
const CARD_HEIGHT = 96
const TABLE_MIN_WIDTH = 720
const LOG_CONTEXT = 'books.customer-page.contacts'
// Inside RecordSurface the modal scope is the top one; an open dialog pushes its own, so
// the key does not reach the page while the contact dialog is open.
const ADD_CONTACT_KEY = { keys: 'Alt+c', scope: 'modal', allowInInputs: true } as const

const keyOfContact = (contact: Contact) => contact.id
const cardHeightOf = () => CARD_HEIGHT
// Every contact is in one read, so there is no next page to ask for.
const noMoreRows = () => {}

type MenuItem = 'edit' | 'primary' | 'delete'

const MENU_LABELS: Record<MenuItem, string> = {
    edit: 'Edit',
    primary: 'Make primary',
    delete: 'Delete',
}
const MENU_TEST_IDS: Record<MenuItem, string> = {
    edit: 'customer-contact-edit',
    primary: 'customer-contact-primary',
    delete: 'customer-contact-delete',
}
const MENU_WRITES: ReadonlySet<string> = new Set<MenuItem>(['primary', 'delete'])
const PRIMARY_ITEMS: readonly MenuItem[] = ['edit', 'delete']
const OTHER_ITEMS: readonly MenuItem[] = ['edit', 'primary', 'delete']

// The Add / Edit dialog: a new `session` for each open mounts a new form; the dialog
// stays mounted after it closes, so a sheet can slide out.
type DialogState = { session: number; contact: Contact | null; isOpen: boolean }

/**
 * The tab's state: the list, the dialog and the delete question, and the row menu's
 * writes. One write runs at a time; a refused Make primary or Delete shows in the
 * action banner until it is dismissed or the next write starts.
 */
function useContactsTab(customerId: string) {
    const [contactsCollection] = useStore('books_party_contacts')
    const list = usePartyContacts(customerId)
    const writes = useWritesAvailable()

    const [dialog, setDialog] = useState<DialogState>({
        session: 0,
        contact: null,
        isOpen: false,
    })
    const openDialog = (contact: Contact | null) =>
        setDialog({ session: dialog.session + 1, contact, isOpen: true })
    const closeDialog = () => setDialog({ ...dialog, isOpen: false })

    const makePrimary = useMutation({
        mutationFn: function* (id: string) {
            yield contactsCollection.update(id, draft => {
                draft.is_primary = true
            })
        },
        // Fails at once offline instead of pausing, so a lost connection shows its reason
        // in the banner rather than leaving the menu's writes disabled.
        networkMode: 'always',
        onError: error => reportUnexpected(LOG_CONTEXT, error),
    })
    const remove = useMutation({
        mutationFn: function* (id: string) {
            yield contactsCollection.delete(id)
        },
        networkMode: 'always',
        onError: error => reportUnexpected(LOG_CONTEXT, error),
    })
    const failed = makePrimary.error ?? remove.error
    const actionError = failed ? writeRefusalText(failed) : null
    const clearActionError = () => {
        makePrimary.reset()
        remove.reset()
    }
    const isWriting = makePrimary.isPending || remove.isPending || !writes.available

    // The contact the delete question is about. A row deleted elsewhere while the
    // question is open closes it: there is nothing left to delete.
    const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)
    const deleting = list.contacts.find(contact => contact.id === deleteTarget?.id) ?? null
    const confirmDelete = () => {
        if (deleting === null) return
        setDeleteTarget(null)
        clearActionError()
        remove.mutate(deleting.id)
    }

    const onMenu = (contact: Contact, item: MenuItem) => {
        if (item === 'edit') {
            openDialog(contact)
            return
        }
        if (item === 'delete') {
            setDeleteTarget(contact)
            return
        }
        clearActionError()
        makePrimary.mutate(contact.id)
    }

    return {
        list,
        dialog,
        openAdd: () => openDialog(null),
        closeDialog,
        onMenu,
        isWriting,
        actionError,
        clearActionError,
        deleting,
        closeDelete: () => setDeleteTarget(null),
        confirmDelete,
    }
}

type ContactsTab = ReturnType<typeof useContactsTab>

// ── Cells ──

function PrimaryBadge({ contact }: { contact: Contact }) {
    if (!contact.is_primary) return null
    return (
        <StatusBadge
            label="Primary"
            tone="info"
            testID={`customer-contact-primary-${contact.id}`}
        />
    )
}

interface LinkTextProps {
    text: string
    url: string
    label: string
    testID: string
    textClassName: string
}

// Email and Phone open the device's mail or phone app; a value that is empty shows no link.
function LinkText({ text, url, label, testID, textClassName }: LinkTextProps) {
    if (text === '') return null
    const open = () => openLink(url)
    return (
        <Pressable
            testID={testID}
            accessibilityRole="link"
            accessibilityLabel={label}
            onPress={open}
            className="min-w-0 max-w-full shrink self-start"
        >
            <Text numberOfLines={1} className={`text-primary ${textClassName}`}>
                {text}
            </Text>
        </Pressable>
    )
}

function EmailLink({ contact, textClassName }: { contact: Contact; textClassName: string }) {
    return (
        <LinkText
            text={contact.email}
            url={`mailto:${contact.email}`}
            label={`Email ${contact.name}`}
            testID={`customer-contact-email-${contact.id}`}
            textClassName={textClassName}
        />
    )
}

function PhoneLink({ contact, textClassName }: { contact: Contact; textClassName: string }) {
    return (
        <LinkText
            text={contact.phone}
            url={`tel:${contact.phone}`}
            label={`Call ${contact.name}`}
            testID={`customer-contact-phone-${contact.id}`}
            textClassName={textClassName}
        />
    )
}

interface RowMenuProps {
    contact: Contact
    tab: ContactsTab
    canWrite: boolean
}

// A reader gets no menu. Make primary is not offered on the primary contact.
function ContactRowMenu({ contact, tab, canWrite }: RowMenuProps) {
    if (!canWrite) return null
    const items = contact.is_primary ? PRIMARY_ITEMS : OTHER_ITEMS
    const select = (item: MenuItem) => tab.onMenu(contact, item)
    return (
        <RecordRowMenu
            title={contact.name}
            triggerTestId={`customer-contact-menu-${contact.id}`}
            triggerLabel={`Actions for ${contact.name}`}
            items={items}
            labels={MENU_LABELS}
            testIds={MENU_TEST_IDS}
            onSelect={select}
            isWriting={tab.isWriting}
            writes={MENU_WRITES}
        />
    )
}

// ── Table and cards ──

function ContactTableRow({ contact, tab, canWrite }: RowMenuProps) {
    return (
        <View
            testID={`customer-contact-${contact.id}`}
            className="flex-row items-center border-b border-border pl-4 pr-2"
            style={{ height: ROW_HEIGHT }}
        >
            <View className="min-w-0 flex-row items-center gap-2 pr-3" style={COLUMNS.name}>
                <Text numberOfLines={1} className="shrink text-sm text-foreground">
                    {contact.name}
                </Text>
                <PrimaryBadge contact={contact} />
            </View>
            <View className="min-w-0 pr-3" style={COLUMNS.role}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {contact.role}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={COLUMNS.email}>
                <EmailLink contact={contact} textClassName="text-sm" />
            </View>
            <View className="min-w-0 pr-3" style={COLUMNS.phone}>
                <PhoneLink contact={contact} textClassName="text-sm" />
            </View>
            <View style={COLUMNS.menu}>
                <ContactRowMenu contact={contact} tab={tab} canWrite={canWrite} />
            </View>
        </View>
    )
}

const TABLE_HEADER = (
    <ListHeaderRow testID="customer-contacts-header">
        <ListHeaderCell label="Name" style={COLUMNS.name} />
        <ListHeaderCell label="Role" style={COLUMNS.role} />
        <ListHeaderCell label="Email" style={COLUMNS.email} />
        <ListHeaderCell label="Phone" style={COLUMNS.phone} />
        <View style={COLUMNS.menu} />
    </ListHeaderRow>
)

function RoleLine({ role }: { role: string }) {
    if (role === '') return null
    return (
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {role}
        </Text>
    )
}

function ContactCard({ contact, tab, canWrite, height }: RowMenuProps & { height: number }) {
    return (
        <View
            testID={`customer-contact-${contact.id}`}
            className="flex-row items-start border-b border-border py-3 pl-4 pr-2"
            style={{ height }}
        >
            <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                    <Text numberOfLines={1} className="shrink text-sm font-medium text-foreground">
                        {contact.name}
                    </Text>
                    <PrimaryBadge contact={contact} />
                </View>
                <RoleLine role={contact.role} />
                <EmailLink contact={contact} textClassName="text-xs" />
                <PhoneLink contact={contact} textClassName="text-xs" />
            </View>
            <ContactRowMenu contact={contact} tab={tab} canWrite={canWrite} />
        </View>
    )
}

interface ContactsListProps {
    tab: ContactsTab
    canWrite: boolean
    isPhone: boolean
}

function ContactsList({ tab, canWrite, isPhone }: ContactsListProps) {
    const { contacts } = tab.list
    if (isPhone) {
        const renderCard = (contact: Contact, height: number) => (
            <ContactCard contact={contact} tab={tab} canWrite={canWrite} height={height} />
        )
        return (
            <ListCards
                testID="customer-contacts-cards"
                rows={contacts}
                heightOf={cardHeightOf}
                keyOf={keyOfContact}
                renderCard={renderCard}
                onNearEnd={noMoreRows}
            />
        )
    }
    const renderRow = (contact: Contact) => (
        <ContactTableRow contact={contact} tab={tab} canWrite={canWrite} />
    )
    return (
        <ListTable
            testID="customer-contacts-table"
            minWidth={TABLE_MIN_WIDTH}
            rowHeight={ROW_HEIGHT}
            header={TABLE_HEADER}
            rows={contacts}
            keyOf={keyOfContact}
            renderRow={renderRow}
            onNearEnd={noMoreRows}
        />
    )
}

// ── Buttons, states ──

interface AddButtonProps {
    isVisible: boolean
    onPress: () => void
}

// The empty state's button has no key: ⌥C belongs to the header button, which shows
// only while the list has rows, so the key is registered only while that action shows.
function EmptyAddContactButton({ isVisible, onPress }: AddButtonProps) {
    if (!isVisible) return null
    return (
        <Button
            testID="customer-contacts-empty-add"
            size="sm"
            onPress={onPress}
            style={{ minHeight: 44 }}
        >
            <ButtonText>Add contact</ButtonText>
        </Button>
    )
}

function HeaderAddContactButton({ isVisible, onPress }: AddButtonProps) {
    if (!isVisible) return null
    return (
        <ShortcutButton
            testID="customer-contacts-add"
            label="Add contact"
            shortcut={ADD_CONTACT_KEY}
            variant="outline"
            size="sm"
            className="min-h-11"
            onPress={onPress}
        />
    )
}

interface BodyProps {
    tab: ContactsTab
    canWrite: boolean
    isPhone: boolean
    gutterClass: string
}

function ContactsBody({ tab, canWrite, isPhone, gutterClass }: BodyProps) {
    const { contacts, isLoading, isError, retry } = tab.list
    if (isError) {
        return (
            <View className={`pt-2 ${gutterClass}`}>
                <ListBanner
                    testIdPrefix="customer-contacts"
                    message="Contacts could not load."
                    onRetry={retry}
                    isFlush
                />
            </View>
        )
    }
    if (isLoading) {
        return (
            <View testID="customer-contacts-loading" className="flex-1">
                <LoadingState />
            </View>
        )
    }
    if (contacts.length === 0) {
        return (
            <View testID="customer-contacts-empty" className="items-center gap-4 p-8">
                <Text className="text-base font-medium text-foreground">No contacts yet</Text>
                <EmptyAddContactButton isVisible={canWrite} onPress={tab.openAdd} />
            </View>
        )
    }
    return (
        <>
            <View className={`flex-row justify-end py-3 ${gutterClass}`}>
                <HeaderAddContactButton isVisible={canWrite} onPress={tab.openAdd} />
            </View>
            <ContactsList tab={tab} canWrite={canWrite} isPhone={isPhone} />
        </>
    )
}

function ActionBanner({ tab, gutterClass }: { tab: ContactsTab; gutterClass: string }) {
    if (tab.actionError === null) return null
    return (
        <View className={`pt-2 ${gutterClass}`}>
            <ListBanner
                testIdPrefix="customer-contacts-action"
                message={tab.actionError}
                onDismiss={tab.clearActionError}
                isFlush
            />
        </View>
    )
}

interface CustomerContactsTabProps {
    customerId: string
    canWrite: boolean
    gutterClass: string
}

/**
 * The people at this customer (spec §3.6), primary first, then by name: a table on a wide
 * window, cards on a phone. A writer adds, edits, makes primary and deletes them; a reader
 * sees the list with no Add contact and no row menu. Making one primary clears the others
 * on the server, in the same transaction.
 */
export function CustomerContactsTab({
    customerId,
    canWrite,
    gutterClass,
}: CustomerContactsTabProps) {
    const tab = useContactsTab(customerId)
    const isPhone = useBreakpoint() === 'mobile'
    const { dialog, deleting } = tab
    const deleteMessage = `Delete ${deleting?.name ?? ''} from this customer's contacts?`
    const isDeleteOpen = deleting !== null
    return (
        <View testID="customer-contacts" className="flex-1">
            <ActionBanner tab={tab} gutterClass={gutterClass} />
            <ContactsBody
                tab={tab}
                canWrite={canWrite}
                isPhone={isPhone}
                gutterClass={gutterClass}
            />
            <ContactPersonDialog
                key={dialog.session}
                customerId={customerId}
                contact={dialog.contact}
                isOpen={dialog.isOpen}
                onClose={tab.closeDialog}
            />
            <ConfirmDialog
                isOpen={isDeleteOpen}
                onClose={tab.closeDelete}
                onConfirm={tab.confirmDelete}
                title="Delete contact"
                message={deleteMessage}
                confirmLabel="Delete"
                isDestructive
            />
        </View>
    )
}
