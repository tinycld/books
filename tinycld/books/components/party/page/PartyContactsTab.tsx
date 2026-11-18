import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { ConfirmDialog } from '@tinycld/core/ui/ConfirmDialog'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { useState } from 'react'
import { Pressable, Text, View, type ViewStyle } from 'react-native'
import { useFitsTable } from '../../../hooks/useFitsTable'
import { usePartyContacts } from '../../../hooks/usePartyContacts'
import { reportUnexpected } from '../../../hooks/useRecordActions'
import type { PartyRef } from '../../../lib/party-page-tabs'
import { writeRefusalText } from '../../../lib/refusal'
import type { DocumentPartyKey } from '../../../lib/sales-document-kinds'
import { ListBanner } from '../../ListBanner'
import { ListCards } from '../../ListCards'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../../ListTable'
import { RecordRowMenu } from '../../RecordRowMenu'
import { StatusBadge } from '../../StatusBadge'
import { ContactPersonDialog } from './ContactPersonDialog'
import { openLink } from './PartyContactActions'

type Contact = ReturnType<typeof usePartyContacts>['contacts'][number]

// Header and rows share these, so the columns line up; the flex columns grow above their
// minimums, and the menu column is fixed so the others share the rest of the width.
const COLUMNS = {
    name: { flex: 1.3, minWidth: 142 },
    role: { flex: 1.3, minWidth: 142 },
    email: { flex: 1.6, minWidth: 175 },
    phone: { flex: 1, minWidth: 109 },
    menu: { width: 48 },
} satisfies Record<string, ViewStyle>

// A row's horizontal padding (`pl-4 pr-2`).
const ROW_PADDING = 24
const ROW_HEIGHT = 56
const CARD_HEIGHT = 96
// The table's own minimum (640 px): the columns at their minimums plus the row padding.
// It fits a record page's content beside the names column (668 px at a 1360 px window);
// below it (plus the scrollbar gutter) the list draws cards.
const TABLE_MIN_WIDTH =
    COLUMNS.name.minWidth +
    COLUMNS.role.minWidth +
    COLUMNS.email.minWidth +
    COLUMNS.phone.minWidth +
    COLUMNS.menu.width +
    ROW_PADDING
// Inside RecordSurface the modal scope is the top one; an open dialog pushes its own, so
// the key does not reach the page while the contact dialog is open.
const ADD_CONTACT_KEY = { keys: 'Alt+c', scope: 'modal', allowInInputs: true } as const

const PARTY_NOUN: Record<DocumentPartyKey, string> = { customer: 'customer', vendor: 'vendor' }

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
const MENU_WRITES: ReadonlySet<string> = new Set<MenuItem>(['primary', 'delete'])
const PRIMARY_ITEMS: readonly MenuItem[] = ['edit', 'delete']
const OTHER_ITEMS: readonly MenuItem[] = ['edit', 'primary', 'delete']

function menuTestIds(testIdPrefix: string): Record<MenuItem, string> {
    return {
        edit: `${testIdPrefix}-contact-edit`,
        primary: `${testIdPrefix}-contact-primary`,
        delete: `${testIdPrefix}-contact-delete`,
    }
}

// The Add / Edit dialog: a new `session` for each open mounts a new form; the dialog
// stays mounted after it closes, so a sheet can slide out.
type DialogState = { session: number; contact: Contact | null; isOpen: boolean }

/**
 * The tab's state: the list, the dialog and the delete question, and the row menu's
 * writes. One write runs at a time; a refused Make primary or Delete shows in the
 * action banner until it is dismissed or the next write starts.
 */
function useContactsTab(ref: PartyRef, testIdPrefix: string) {
    const [contactsCollection] = useStore('books_party_contacts')
    const list = usePartyContacts(ref)
    const writes = useWritesAvailable()
    const logContext = `books.${ref.party}-page.contacts`

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
        onError: error => reportUnexpected(logContext, error),
    })
    const remove = useMutation({
        mutationFn: function* (id: string) {
            yield contactsCollection.delete(id)
        },
        networkMode: 'always',
        onError: error => reportUnexpected(logContext, error),
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
        party: ref.party,
        testIdPrefix,
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

function PrimaryBadge({ contact, tab }: { contact: Contact; tab: ContactsTab }) {
    if (!contact.is_primary) return null
    return (
        <StatusBadge
            label="Primary"
            tone="info"
            testID={`${tab.testIdPrefix}-contact-primary-${contact.id}`}
        />
    )
}

interface LinkTextProps {
    text: string
    url: string
    label: string
    party: DocumentPartyKey
    testID: string
    textClassName: string
}

// Email and Phone open the device's mail or phone app; a value that is empty shows no link.
function LinkText({ text, url, label, party, testID, textClassName }: LinkTextProps) {
    if (text === '') return null
    const open = () => openLink(party, url)
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

interface ContactLinkProps {
    contact: Contact
    tab: ContactsTab
    textClassName: string
}

function EmailLink({ contact, tab, textClassName }: ContactLinkProps) {
    return (
        <LinkText
            text={contact.email}
            url={`mailto:${contact.email}`}
            label={`Email ${contact.name}`}
            party={tab.party}
            testID={`${tab.testIdPrefix}-contact-email-${contact.id}`}
            textClassName={textClassName}
        />
    )
}

function PhoneLink({ contact, tab, textClassName }: ContactLinkProps) {
    return (
        <LinkText
            text={contact.phone}
            url={`tel:${contact.phone}`}
            label={`Call ${contact.name}`}
            party={tab.party}
            testID={`${tab.testIdPrefix}-contact-phone-${contact.id}`}
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
    const testIds = menuTestIds(tab.testIdPrefix)
    return (
        <RecordRowMenu
            title={contact.name}
            triggerTestId={`${tab.testIdPrefix}-contact-menu-${contact.id}`}
            triggerLabel={`Actions for ${contact.name}`}
            items={items}
            labels={MENU_LABELS}
            testIds={testIds}
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
            testID={`${tab.testIdPrefix}-contact-${contact.id}`}
            className="flex-row items-center border-b border-border pl-4 pr-2"
            style={{ height: ROW_HEIGHT }}
        >
            <View className="min-w-0 flex-row items-center gap-2 pr-3" style={COLUMNS.name}>
                <Text numberOfLines={1} className="shrink text-sm text-foreground">
                    {contact.name}
                </Text>
                <PrimaryBadge contact={contact} tab={tab} />
            </View>
            <View className="min-w-0 pr-3" style={COLUMNS.role}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {contact.role}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={COLUMNS.email}>
                <EmailLink contact={contact} tab={tab} textClassName="text-sm" />
            </View>
            <View className="min-w-0 pr-3" style={COLUMNS.phone}>
                <PhoneLink contact={contact} tab={tab} textClassName="text-sm" />
            </View>
            <View style={COLUMNS.menu}>
                <ContactRowMenu contact={contact} tab={tab} canWrite={canWrite} />
            </View>
        </View>
    )
}

function TableHeader({ testIdPrefix }: { testIdPrefix: string }) {
    return (
        <ListHeaderRow testID={`${testIdPrefix}-contacts-header`}>
            <ListHeaderCell label="Name" style={COLUMNS.name} />
            <ListHeaderCell label="Role" style={COLUMNS.role} />
            <ListHeaderCell label="Email" style={COLUMNS.email} />
            <ListHeaderCell label="Phone" style={COLUMNS.phone} />
            <View style={COLUMNS.menu} />
        </ListHeaderRow>
    )
}

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
            testID={`${tab.testIdPrefix}-contact-${contact.id}`}
            className="flex-row items-start border-b border-border py-3 pl-4 pr-2"
            style={{ height }}
        >
            <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                    <Text numberOfLines={1} className="shrink text-sm font-medium text-foreground">
                        {contact.name}
                    </Text>
                    <PrimaryBadge contact={contact} tab={tab} />
                </View>
                <RoleLine role={contact.role} />
                <EmailLink contact={contact} tab={tab} textClassName="text-xs" />
                <PhoneLink contact={contact} tab={tab} textClassName="text-xs" />
            </View>
            <ContactRowMenu contact={contact} tab={tab} canWrite={canWrite} />
        </View>
    )
}

type Fits = ReturnType<typeof useFitsTable>

interface ContactsListProps {
    tab: ContactsTab
    canWrite: boolean
    fits: Fits
}

function ContactsList({ tab, canWrite, fits }: ContactsListProps) {
    const { contacts } = tab.list
    if (fits.showCards) {
        const renderCard = (contact: Contact, height: number) => (
            <ContactCard contact={contact} tab={tab} canWrite={canWrite} height={height} />
        )
        return (
            <ListCards
                testID={`${tab.testIdPrefix}-contacts-cards`}
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
    const header = <TableHeader testIdPrefix={tab.testIdPrefix} />
    return (
        <ListTable
            testID={`${tab.testIdPrefix}-contacts-table`}
            minWidth={TABLE_MIN_WIDTH}
            rowHeight={ROW_HEIGHT}
            header={header}
            rows={contacts}
            keyOf={keyOfContact}
            renderRow={renderRow}
            onNearEnd={noMoreRows}
            onGutter={fits.onGutter}
        />
    )
}

// ── Buttons, states ──

interface AddButtonProps {
    isVisible: boolean
    isEmpty: boolean
    onPress: () => void
    testIdPrefix: string
}

// One button in the empty state and above the rows, so it stays mounted when the first
// contact arrives: the dialog returns the focus to the element that opened it. Only its
// look and test id change; ⌥C presses it in both states.
function AddContactButton({ isVisible, isEmpty, onPress, testIdPrefix }: AddButtonProps) {
    if (!isVisible) return null
    const testID = isEmpty ? `${testIdPrefix}-contacts-empty-add` : `${testIdPrefix}-contacts-add`
    const variant = isEmpty ? 'default' : 'outline'
    return (
        <ShortcutButton
            testID={testID}
            label="Add contact"
            shortcut={ADD_CONTACT_KEY}
            variant={variant}
            size="sm"
            className="min-h-11"
            onPress={onPress}
        />
    )
}

function EmptyText({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="text-base font-medium text-foreground">No contacts yet</Text>
}

function VisibleContactsList({ isVisible, ...props }: ContactsListProps & { isVisible: boolean }) {
    if (!isVisible) return null
    return <ContactsList {...props} />
}

interface BodyProps {
    tab: ContactsTab
    canWrite: boolean
    fits: Fits
    gutterClass: string
}

function ContactsBody({ tab, canWrite, fits, gutterClass }: BodyProps) {
    const { contacts, isLoading, isError, retry } = tab.list
    const { testIdPrefix } = tab
    if (isError) {
        return (
            <View className={`pt-2 ${gutterClass}`}>
                <ListBanner
                    testIdPrefix={`${testIdPrefix}-contacts`}
                    message="Contacts could not load."
                    onRetry={retry}
                    isFlush
                />
            </View>
        )
    }
    if (isLoading) {
        return (
            <View testID={`${testIdPrefix}-contacts-loading`} className="flex-1">
                <LoadingState />
            </View>
        )
    }
    // The empty state and the header row share one wrapper, so the Add contact button
    // inside it is the same element in both.
    const isEmpty = contacts.length === 0
    const wrapperTestId = isEmpty ? `${testIdPrefix}-contacts-empty` : undefined
    const wrapperClass = isEmpty
        ? 'items-center gap-4 p-8'
        : `flex-row justify-end py-3 ${gutterClass}`
    return (
        <>
            <View testID={wrapperTestId} className={wrapperClass}>
                <EmptyText isVisible={isEmpty} />
                <AddContactButton
                    isVisible={canWrite}
                    isEmpty={isEmpty}
                    onPress={tab.openAdd}
                    testIdPrefix={testIdPrefix}
                />
            </View>
            <VisibleContactsList isVisible={!isEmpty} tab={tab} canWrite={canWrite} fits={fits} />
        </>
    )
}

function ActionBanner({ tab, gutterClass }: { tab: ContactsTab; gutterClass: string }) {
    if (tab.actionError === null) return null
    return (
        <View className={`pt-2 ${gutterClass}`}>
            <ListBanner
                testIdPrefix={`${tab.testIdPrefix}-contacts-action`}
                message={tab.actionError}
                onDismiss={tab.clearActionError}
                isFlush
            />
        </View>
    )
}

interface PartyContactsTabProps extends PartyRef {
    canWrite: boolean
    gutterClass: string
    testIdPrefix: string
}

/**
 * The people at this customer or vendor, primary first, then by name: a table when the
 * tab's own width holds it, cards on a phone or below the table's minimum width. A writer
 * adds, edits, makes primary and deletes them; a reader sees the list with no Add contact
 * and no row menu. Making one primary clears the others on the server, in the same
 * transaction.
 */
export function PartyContactsTab({
    party,
    id,
    canWrite,
    gutterClass,
    testIdPrefix,
}: PartyContactsTabProps) {
    const tab = useContactsTab({ party, id }, testIdPrefix)
    const fits = useFitsTable(TABLE_MIN_WIDTH)
    const { dialog, deleting } = tab
    const deleteMessage = `Delete ${deleting?.name ?? ''} from this ${PARTY_NOUN[party]}'s contacts?`
    const isDeleteOpen = deleting !== null
    return (
        <View testID={`${testIdPrefix}-contacts`} className="flex-1" onLayout={fits.onLayout}>
            <ActionBanner tab={tab} gutterClass={gutterClass} />
            <ContactsBody tab={tab} canWrite={canWrite} fits={fits} gutterClass={gutterClass} />
            <ContactPersonDialog
                key={dialog.session}
                party={party}
                partyId={id}
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
