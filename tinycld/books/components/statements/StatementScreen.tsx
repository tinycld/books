import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import {
    type ScopeOwner,
    ScopeProvider,
    type Shortcut,
    useRegisterShortcut,
    useShortcutScope,
} from '@tinycld/core/lib/shortcuts'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { type ButtonShortcut, ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useEmailStatus } from '../../hooks/useEmailStatus'
import { usePdfDownload } from '../../hooks/usePdfDownload'
import { usePopToRecordBelow } from '../../hooks/useStackScreens'
import { useStatementDelete } from '../../hooks/useStatementDelete'
import { useStatementPdf } from '../../hooks/useStatementPdf'
import { useStatementRecord } from '../../hooks/useStatementRecord'
import { CUSTOMERS_PATH, customerPath } from '../../lib/customer-route'
import { mergeRecoveries } from '../../lib/live-recovery'
import { formatMoney } from '../../lib/money'
import { CUSTOMERS_KIND_ROUTE, customerStatementsRoute } from '../../lib/statement-route'
import {
    STATEMENT_NOT_FOUND,
    STATEMENT_TYPE_LABELS,
    statementActions,
    statementAmountChangedText,
    statementAttachmentName,
    statementPeriodText,
    statementSentLine,
    statementTitle,
} from '../../lib/statement-texts'
import {
    type StatementSnapshot,
    useDeletingStatement,
    useStatementDeleteStore,
} from '../../stores/statement-delete-store'
import { PdfPage } from '../documents/PdfPage'
import { RecordNotFound } from '../RecordNotFound'
import { DeleteStatementDialog } from './DeleteStatementDialog'
import { SendStatementDialog } from './SendStatementDialog'

const TAP = { minHeight: 44 }
const GROUP = 'Statement'
const LOAD_ERROR = 'This statement could not load.'

// The screen's keys (spec §3.8): single letters, so they never fire from a text field.
// Module constants, so each button's registration stays put across renders.
const SEND_KEY: ButtonShortcut = { keys: 's', scope: 'compose', group: GROUP }
const DOWNLOAD_KEY: ButtonShortcut = { keys: 'd', scope: 'compose', group: GROUP }

type StatementView = StatementSnapshot

// The customer's Statements tab, or the Customers list when the customer is not known.
function useStatementsTabHref() {
    const orgHref = useOrgHref()
    return useCallback(
        (customerId: string | null) => {
            if (customerId === null) return orgHref(CUSTOMERS_PATH)
            const route = customerStatementsRoute(customerId)
            return orgHref(route.path, route.params)
        },
        [orgHref]
    )
}

// Back (Esc): to the screen below, or to the customer's Statements tab when there is none
// (the screen was opened by its address).
// Stable for one customer, so the Escape key registers once.
function useLeave(customerId: string | null) {
    const tabHref = useStatementsTabHref()
    return useCallback(() => {
        if (router.canGoBack()) {
            router.back()
            return
        }
        router.replace(tabHref(customerId))
    }, [customerId, tabHref])
}

// After a delete (spec §3.8): pop to the customer's page when it is right below (the
// statement was opened from its Statements tab), so the stack never holds that page twice;
// replace the screen with the customer's Statements tab otherwise.
function useLeaveAfterDelete() {
    const tabHref = useStatementsTabHref()
    const popToCustomer = usePopToRecordBelow(CUSTOMERS_KIND_ROUTE)
    return (customerId: string) => {
        if (popToCustomer(customerId)) return
        router.replace(tabHref(customerId))
    }
}

// Escape leaves the screen; an open dialog or menu takes Escape first (core layer stack).
function useEscapeLeaves(leave: () => void, scopeOwner: ScopeOwner) {
    const shortcut = useMemo<Shortcut>(
        () => ({
            id: 'books.statement.back',
            keys: 'Escape',
            scope: 'compose',
            group: GROUP,
            description: 'Back',
            run: () => leave(),
        }),
        [leave]
    )
    useRegisterShortcut(shortcut, scopeOwner)
}

function BackLink({ onPress }: { onPress: () => void }) {
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            testID="statement-back"
            accessibilityRole="link"
            onPress={onPress}
            className="flex-row items-center gap-1 self-start"
            style={TAP}
        >
            <ArrowLeft size={16} color={color} />
            <Text className="text-sm text-muted-foreground">Back</Text>
        </Pressable>
    )
}

function CustomerLink({ view }: { view: StatementView }) {
    const orgHref = useOrgHref()
    if (view.customer === null) return null
    const { id, display_name } = view.customer
    const route = customerPath(id)
    const open = () => router.push(orgHref(route.path, route.params))
    return (
        <Pressable
            testID="statement-customer"
            accessibilityRole="link"
            onPress={open}
            className="self-start"
        >
            <Text className="text-sm text-primary underline">{display_name}</Text>
        </Pressable>
    )
}

function EmailNote({ note }: { note: string | null }) {
    if (note === null) return null
    return (
        <Text testID="statements-email-note" className="text-xs text-muted-foreground">
            {note}
        </Text>
    )
}

interface ActionsProps {
    view: StatementView
    canWrite: boolean
    scopeOwner: ScopeOwner
    isDeleting: boolean
    onSend: () => void
    onDelete: () => void
}

// Send… (S), Download PDF (D) and More (Delete) for a writer; Download PDF for a reader.
// Send… is disabled, with the note under the actions, while the server cannot send email.
function StatementActions({
    view,
    canWrite,
    scopeOwner,
    isDeleting,
    onSend,
    onDelete,
}: ActionsProps) {
    const email = useEmailStatus()
    const download = usePdfDownload()
    const writes = useWritesAvailable()
    const actions = statementActions({
        canWrite,
        canSend: email.canSend,
        emailStatusLoading: email.isLoading,
    })
    const { statement, customer } = view
    const fallbackName = statementAttachmentName(
        statement.number,
        customer?.display_name ?? ''
    ).replace(/\.pdf$/, '')
    const onDownload = () => download.mutate({ kind: 'statement', id: statement.id, fallbackName })
    const downloadButton = (
        <ShortcutButton
            label="Download PDF"
            shortcut={DOWNLOAD_KEY}
            onPress={onDownload}
            isDisabled={download.isPending}
            variant="outline"
            testID="statement-download"
            scopeOwner={scopeOwner}
        />
    )
    if (!actions.screen.includes('send')) {
        return <View className="flex-row flex-wrap gap-2">{downloadButton}</View>
    }
    const isSendDisabled = actions.isSendDisabled || isDeleting
    // Delete is a write: idle while writes are unavailable, as the list's row menus do.
    const isDeleteDisabled = isDeleting || !writes.available
    const moreTrigger = (
        <Button testID="statement-more" variant="outline" style={TAP} isDisabled={isDeleting}>
            <ButtonText>More</ButtonText>
        </Button>
    )
    return (
        <View className="gap-1">
            <View className="flex-row flex-wrap items-center gap-2">
                <ShortcutButton
                    label="Send…"
                    shortcut={SEND_KEY}
                    onPress={onSend}
                    serverAction
                    isDisabled={isSendDisabled}
                    testID="statement-send"
                    scopeOwner={scopeOwner}
                />
                {downloadButton}
                <Menu title="More" placement="bottom-end" trigger={moreTrigger}>
                    <Menu.Item
                        testID="statement-delete"
                        label="Delete"
                        isDestructive
                        isDisabled={isDeleteDisabled}
                        onSelect={onDelete}
                    />
                </Menu>
            </View>
            <EmailNote note={actions.note} />
        </View>
    )
}

// The muted line when the PDF's amount due (the ledger as it is now) differs from the
// stored one: a back-dated post changed it since the statement was made.
function AmountChangedLine({
    view,
    amountDueNow,
}: {
    view: StatementView
    amountDueNow: number | null
}) {
    const { balance, currency } = view.statement
    if (amountDueNow === null || amountDueNow === balance) return null
    const text = statementAmountChangedText(formatMoney(balance, currency))
    return (
        <Text testID="statement-amount-changed" className="text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

function StatementPdf({ view }: { view: StatementView }) {
    const pdf = useStatementPdf(view.statement.id, view.statement.updated)
    return (
        <>
            <AmountChangedLine view={view} amountDueNow={pdf.amountDueNow} />
            <PdfPage uri={pdf.uri} error={pdf.error} onRetry={pdf.retry} testId="statement-pdf" />
        </>
    )
}

interface ShownProps {
    view: StatementView
    canWrite: boolean
    scopeOwner: ScopeOwner
    onLeave: () => void
}

// The statement: Back, the header (the customer's link, the title, the type and period, the
// sent line) beside the actions, the amount line, and the PDF page; with the Send and
// Delete dialogs.
function StatementShown({ view, canWrite, scopeOwner, onLeave }: ShownProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const leaveAfterDelete = useLeaveAfterDelete()
    const deletion = useStatementDelete()
    const [isSendOpen, setIsSendOpen] = useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const { statement, customer } = view
    const layout = isPhone ? 'gap-3' : 'flex-row items-start justify-between gap-4'
    const kind = `${STATEMENT_TYPE_LABELS[statement.type]} · ${statementPeriodText(statement)}`
    const customerName = customer?.display_name ?? ''
    const customerEmail = customer?.email ?? ''
    const title = statementTitle(statement.number)
    const sentLine = statementSentLine(statement)

    const openSend = () => setIsSendOpen(true)
    const closeSend = () => setIsSendOpen(false)
    const openDelete = () => setIsDeleteOpen(true)
    const closeDelete = () => {
        if (!deletion.isDeleting) setIsDeleteOpen(false)
    }
    // The snapshot goes in before the delete: its optimistic removal re-renders this screen
    // at once, and that render must already draw the snapshot. A delete that goes through
    // leaves to the customer's Statements tab (useLeaveAfterDelete); on the pop path, browser
    // Forward to the deleted statement then shows "not found". A refusal keeps the screen
    // (the toast says why).
    const confirmDelete = async () => {
        const store = useStatementDeleteStore.getState()
        store.startDeleting(view)
        const isDeleted = await deletion.remove(statement.id)
        setIsDeleteOpen(false)
        if (isDeleted) leaveAfterDelete(statement.customer)
        store.endDeleting()
    }
    const onConfirmDelete = () => void confirmDelete()
    return (
        <View testID="statement-screen" className="min-w-0 flex-1 bg-background">
            <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-2 pb-6">
                <BackLink onPress={onLeave} />
                <View className={layout}>
                    <View className="min-w-0 shrink gap-1">
                        <CustomerLink view={view} />
                        <Text
                            testID="statement-title"
                            className="text-xl font-semibold text-foreground"
                        >
                            {title}
                        </Text>
                        <Text className="text-sm text-foreground">{kind}</Text>
                        <Text testID="statement-sent" className="text-sm text-muted-foreground">
                            {sentLine}
                        </Text>
                    </View>
                    <StatementActions
                        view={view}
                        canWrite={canWrite}
                        scopeOwner={scopeOwner}
                        isDeleting={deletion.isDeleting}
                        onSend={openSend}
                        onDelete={openDelete}
                    />
                </View>
                <StatementPdf view={view} />
            </ScrollView>
            <SendStatementDialog
                statement={statement}
                customerName={customerName}
                customerEmail={customerEmail}
                isOpen={isSendOpen}
                onClose={closeSend}
            />
            <DeleteStatementDialog
                number={statement.number}
                isOpen={isDeleteOpen}
                isDeleting={deletion.isDeleting}
                onClose={closeDelete}
                onConfirm={onConfirmDelete}
            />
        </View>
    )
}

function LoadError({ onRetry }: { onRetry: () => void }) {
    return (
        <View
            testID="statement-load-error"
            accessibilityRole="alert"
            className="flex-1 items-center justify-center gap-4 p-8"
        >
            <Text className="text-center text-base text-foreground">{LOAD_ERROR}</Text>
            <Button testID="statement-retry" variant="outline" style={TAP} onPress={onRetry}>
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function StatementBody({ id, scopeOwner }: { id: string; scopeOwner: ScopeOwner }) {
    const record = useStatementRecord(id)
    const deleting = useDeletingStatement(id)
    const access = useBooksAccess()
    const live: StatementView | null =
        record.statement === null
            ? null
            : { id: record.statement.id, statement: record.statement, customer: record.customer }
    const view = live ?? deleting ?? null
    const leave = useLeave(view?.statement.customer ?? null)
    useEscapeLeaves(leave, scopeOwner)
    const accessRecovery = access.isError ? { queries: [access.collection], sources: [] } : null
    const recoveries =
        accessRecovery === null ? [record.recovery] : [record.recovery, accessRecovery]
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries(recoveries),
            onError: err => log.error('books.statement', err),
        })
    }
    if (view !== null && !record.isError && !access.isError) {
        return (
            <StatementShown
                view={view}
                canWrite={access.canWrite}
                scopeOwner={scopeOwner}
                onLeave={leave}
            />
        )
    }
    if (record.isError || access.isError) return <LoadError onRetry={retry} />
    if (record.notFound) {
        return (
            <RecordNotFound
                testIdPrefix="statement"
                message={STATEMENT_NOT_FOUND}
                backLabel="Back"
                onLeave={leave}
            />
        )
    }
    return (
        <View testID="statement-loading" className="flex-1">
            <LoadingState />
        </View>
    )
}

/**
 * One statement at `books/statements/<id>` (statements spec §3.8): the customer's link,
 * "Statement <number>", the type and period, the sent line and the server's PDF page, with
 * Send… (S), Download PDF (D) and More → Delete for a writer and Download PDF for a reader.
 * Back (Esc) returns to the screen below. A statement that does not exist or that the user
 * cannot read shows RecordNotFound; a load error shows Retry over the merged recoveries.
 */
export function StatementScreen({ id }: { id: string }) {
    const scopeOwner = useShortcutScope('compose')
    return (
        <ScopeProvider owner={scopeOwner}>
            <View pointerEvents="auto" className="flex-1 bg-background">
                <StatementBody id={id} scopeOwner={scopeOwner} />
            </View>
        </ScopeProvider>
    )
}

// The statement route whose number-key read failed (useDocumentRouteId): the screen's load
// error with Retry, before the screen has a statement id.
export function StatementRouteLoadError({ onRetry }: { onRetry: () => void }) {
    return (
        <View pointerEvents="auto" className="flex-1 bg-background">
            <LoadError onRetry={onRetry} />
        </View>
    )
}
