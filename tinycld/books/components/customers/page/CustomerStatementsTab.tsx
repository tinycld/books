import { EmptyState } from '@tinycld/core/components/EmptyState'
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, View, type ViewStyle } from 'react-native'
import { useCustomerStatements } from '../../../hooks/useCustomerStatements'
import { useEmailStatus } from '../../../hooks/useEmailStatus'
import { useFitsTable } from '../../../hooks/useFitsTable'
import { usePdfDownload } from '../../../hooks/usePdfDownload'
import { useStatementDelete } from '../../../hooks/useStatementDelete'
import { formatMoney } from '../../../lib/money'
import { documentKey } from '../../../lib/record-key'
import { formatDay } from '../../../lib/register-range'
import {
    STATEMENT_TAB_CARD_HEIGHT,
    STATEMENT_TAB_COLUMNS,
    STATEMENT_TAB_MIN_WIDTH,
    STATEMENT_TAB_ROW_HEIGHT,
} from '../../../lib/statement-columns'
import { newStatementHref, statementHref } from '../../../lib/statement-route'
import {
    STATEMENT_ROW_ACTION_LABELS,
    STATEMENT_TYPE_LABELS,
    type StatementRowAction,
    statementActions,
    statementAttachmentName,
    statementPeriodText,
    statementSentLine,
    statementSentText,
} from '../../../lib/statement-texts'
import { ListBanner } from '../../ListBanner'
import { ListCards } from '../../ListCards'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../../ListTable'
import { RecordRowMenu } from '../../RecordRowMenu'
import { DeleteStatementDialog } from '../../statements/DeleteStatementDialog'
import { SendStatementDialog } from '../../statements/SendStatementDialog'

const TAP = { minHeight: 44 }
const ROW_STYLE = { height: STATEMENT_TAB_ROW_HEIGHT }
const LOAD_ERROR = 'Statements could not load.'
const EMPTY_TITLE = 'No statements yet'
const EMPTY_DETAIL = 'Create a statement to show this customer what it owes.'

// Send… and Delete start a write: both are idle while a delete runs or writes are
// unavailable.
const ROW_WRITES: ReadonlySet<string> = new Set<StatementRowAction>(['send', 'delete'])

// A row of the tab, as the tab's one query gives it.
type StatementRow = ReturnType<typeof useCustomerStatements>['rows'][number]

const keyOfStatement = (row: StatementRow) => row.id
const cardHeightOf = () => STATEMENT_TAB_CARD_HEIGHT
// The tab holds every statement of the customer: the window has no more rows to ask for.
const noMoreRows = () => {}

// The PDF's saved name when the response names none: the attachment's name without ".pdf".
function fallbackNameOf(row: StatementRow, customerName: string): string {
    return statementAttachmentName(row.number, customerName).replace(/\.pdf$/, '')
}

interface RowMenuModel {
    items: readonly StatementRowAction[]
    isWriting: boolean
    onSelect: (row: StatementRow, action: StatementRowAction) => void
}

function StatementRowMenu({ row, menu }: { row: StatementRow; menu: RowMenuModel }) {
    const testIds: Record<StatementRowAction, string> = {
        open: `statement-row-open-${row.id}`,
        send: `statement-row-send-${row.id}`,
        download: `statement-row-download-${row.id}`,
        delete: `statement-row-delete-${row.id}`,
    }
    const select = (action: StatementRowAction) => menu.onSelect(row, action)
    return (
        <RecordRowMenu
            title={`Statement ${row.number}`}
            triggerTestId={`statement-row-menu-${row.id}`}
            triggerLabel={`Actions for statement ${row.number}`}
            items={menu.items}
            labels={STATEMENT_ROW_ACTION_LABELS}
            testIds={testIds}
            onSelect={select}
            isWriting={menu.isWriting}
            writes={ROW_WRITES}
        />
    )
}

interface CellProps {
    style: ViewStyle
    text: string
    align?: 'right'
    isMuted?: boolean
}

function Cell({ style, text, align, isMuted = false }: CellProps) {
    const alignClass = align === 'right' ? ' text-right tabular-nums' : ''
    const tone = isMuted ? 'text-muted-foreground' : 'text-foreground'
    return (
        <View className="min-w-0 pr-3" style={style}>
            <Text numberOfLines={1} className={`text-sm ${tone}${alignClass}`}>
                {text}
            </Text>
        </View>
    )
}

interface RowProps {
    row: StatementRow
    menu: RowMenuModel
    onOpen: (row: StatementRow) => void
}

// The press target (the row's cells) and the menu cell are siblings, so a press on the menu
// never opens the statement.
function StatementTableRow({ row, menu, onOpen }: RowProps) {
    const open = () => onOpen(row)
    const isUnsent = row.sent_at === ''
    const date = formatDay(row.statement_date)
    const amount = formatMoney(row.balance, row.currency)
    const type = STATEMENT_TYPE_LABELS[row.type]
    const period = statementPeriodText(row)
    const sent = statementSentText(row)
    return (
        <View className="flex-row items-center border-b border-border" style={ROW_STYLE}>
            <Pressable
                testID={`statement-row-${row.id}`}
                accessibilityRole="link"
                onPress={open}
                className="min-w-0 flex-1 flex-row items-center pl-4 pr-2"
                style={ROW_STYLE}
            >
                <Cell style={STATEMENT_TAB_COLUMNS.date} text={date} />
                <Cell style={STATEMENT_TAB_COLUMNS.number} text={row.number} />
                <Cell style={STATEMENT_TAB_COLUMNS.type} text={type} />
                <Cell style={STATEMENT_TAB_COLUMNS.period} text={period} />
                <Cell style={STATEMENT_TAB_COLUMNS.amount} text={amount} align="right" />
                <Cell style={STATEMENT_TAB_COLUMNS.sent} text={sent} isMuted={isUnsent} />
            </Pressable>
            <View style={STATEMENT_TAB_COLUMNS.menu}>
                <StatementRowMenu row={row} menu={menu} />
            </View>
        </View>
    )
}

// A card: the number and the type with the amount at the right, then the date and the
// period, then the sent line.
function StatementCard({ row, menu, onOpen, height }: RowProps & { height: number }) {
    const open = () => onOpen(row)
    const title = `${row.number} · ${STATEMENT_TYPE_LABELS[row.type]}`
    const dates = `${formatDay(row.statement_date)} · ${statementPeriodText(row)}`
    const sent = statementSentLine(row)
    const amount = formatMoney(row.balance, row.currency)
    const heightStyle = { height }
    return (
        <View className="flex-row items-start border-b border-border" style={heightStyle}>
            <Pressable
                testID={`statement-row-${row.id}`}
                accessibilityRole="link"
                onPress={open}
                className="min-w-0 flex-1 justify-center gap-1 pl-4"
                style={heightStyle}
            >
                <View className="flex-row items-center justify-between gap-3">
                    <Text numberOfLines={1} className="shrink text-sm font-medium text-foreground">
                        {title}
                    </Text>
                    <Text className="text-sm font-medium text-foreground tabular-nums">
                        {amount}
                    </Text>
                </View>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {dates}
                </Text>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {sent}
                </Text>
            </Pressable>
            <View style={STATEMENT_TAB_COLUMNS.menu}>
                <StatementRowMenu row={row} menu={menu} />
            </View>
        </View>
    )
}

function TableHeader() {
    return (
        <ListHeaderRow testID="customer-statements-header">
            <ListHeaderCell label="Date" style={STATEMENT_TAB_COLUMNS.date} />
            <ListHeaderCell label="No." style={STATEMENT_TAB_COLUMNS.number} />
            <ListHeaderCell label="Type" style={STATEMENT_TAB_COLUMNS.type} />
            <ListHeaderCell label="Period" style={STATEMENT_TAB_COLUMNS.period} />
            <ListHeaderCell label="Amount due" style={STATEMENT_TAB_COLUMNS.amount} align="right" />
            <ListHeaderCell label="Sent" style={STATEMENT_TAB_COLUMNS.sent} />
            <View style={STATEMENT_TAB_COLUMNS.menu} />
        </ListHeaderRow>
    )
}

interface CreateButtonProps {
    isVisible: boolean
    onPress: () => void
    testID: string
}

function CreateStatementButton({ isVisible, onPress, testID }: CreateButtonProps) {
    if (!isVisible) return null
    return (
        <Button testID={testID} variant="outline" size="sm" style={TAP} onPress={onPress}>
            <ButtonText>Create statement</ButtonText>
        </Button>
    )
}

interface ListProps {
    rows: StatementRow[]
    menu: RowMenuModel
    onOpen: (row: StatementRow) => void
    fits: ReturnType<typeof useFitsTable>
}

function StatementsList({ rows, menu, onOpen, fits }: ListProps) {
    if (fits.showCards) {
        const renderCard = (row: StatementRow, height: number) => (
            <StatementCard row={row} menu={menu} onOpen={onOpen} height={height} />
        )
        return (
            <ListCards
                testID="customer-statements-cards"
                rows={rows}
                heightOf={cardHeightOf}
                keyOf={keyOfStatement}
                renderCard={renderCard}
                onNearEnd={noMoreRows}
            />
        )
    }
    const renderRow = (row: StatementRow) => (
        <StatementTableRow row={row} menu={menu} onOpen={onOpen} />
    )
    const header = <TableHeader />
    return (
        <ListTable
            testID="customer-statements-table"
            minWidth={STATEMENT_TAB_MIN_WIDTH}
            rowHeight={STATEMENT_TAB_ROW_HEIGHT}
            header={header}
            rows={rows}
            keyOf={keyOfStatement}
            renderRow={renderRow}
            onNearEnd={noMoreRows}
            onGutter={fits.onGutter}
        />
    )
}

interface BodyProps extends ListProps {
    isLoading: boolean
    isError: boolean
    canWrite: boolean
    onRetry: () => void
    onCreate: () => void
    gutterClass: string
}

// The load error with Retry, the skeleton of the Transactions tab, the empty state, or the
// rows.
function StatementsBody(props: BodyProps) {
    const { isLoading, isError, rows, canWrite, gutterClass } = props
    if (isError) {
        return (
            <View className={`pt-2 ${gutterClass}`}>
                <ListBanner
                    testIdPrefix="customer-statements"
                    message={LOAD_ERROR}
                    onRetry={props.onRetry}
                    isFlush
                />
            </View>
        )
    }
    if (isLoading) {
        return (
            <View testID="customer-statements-loading" className="flex-1">
                <LoadingState />
            </View>
        )
    }
    if (rows.length === 0) {
        return (
            <View testID="customer-statements-empty" className="items-center gap-3 p-8">
                <View className="items-center">
                    <EmptyState message={EMPTY_TITLE} />
                    <Text className="text-center text-sm text-muted-foreground">
                        {EMPTY_DETAIL}
                    </Text>
                </View>
                <CreateStatementButton
                    isVisible={canWrite}
                    onPress={props.onCreate}
                    testID="customer-statements-empty-new"
                />
            </View>
        )
    }
    return <StatementsList rows={rows} menu={props.menu} onOpen={props.onOpen} fits={props.fits} />
}

// The header's Create statement: only with rows (the empty state holds its own).
function TabHeader({
    isVisible,
    onCreate,
    gutterClass,
}: {
    isVisible: boolean
    onCreate: () => void
    gutterClass: string
}) {
    const isPhone = useBreakpoint() === 'mobile'
    if (!isVisible) return null
    const layout = isPhone ? '' : 'flex-row justify-end'
    return (
        <View className={`py-3 ${gutterClass} ${layout}`}>
            <CreateStatementButton isVisible onPress={onCreate} testID="customer-statements-new" />
        </View>
    )
}

interface CustomerStatementsTabProps {
    customerId: string
    // The customer's name and address: the Send dialog's attachment name and its To when the
    // statement holds no address.
    customerName: string
    customerEmail: string
    canWrite: boolean
    gutterClass: string
}

/**
 * The customer page's Statements tab (statements spec §3.7): the customer's statements,
 * newest statement date first, then newest created (`useCustomerStatements`), as a table at
 * or above its own minimum width and as cards below it. A press on a row opens the
 * statement, pushed over the page. The row menu holds Open, Send…, Download PDF and Delete
 * for a writer (Send… only while the server can send email), Open and Download PDF for a
 * reader (`statementActions`). A writer gets "Create statement" in the header, or in the
 * empty state. The tab owns its Send and Delete dialogs, so they open over the page.
 */
export function CustomerStatementsTab({
    customerId,
    customerName,
    customerEmail,
    canWrite,
    gutterClass,
}: CustomerStatementsTabProps) {
    const statements = useCustomerStatements(customerId)
    const email = useEmailStatus()
    const writes = useWritesAvailable()
    const download = usePdfDownload()
    const deletion = useStatementDelete()
    const fits = useFitsTable(STATEMENT_TAB_MIN_WIDTH)
    const orgHref = useOrgHref()
    // The row whose dialog is open: local to the tab, so it opens only on this screen.
    const [sendId, setSendId] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: string } | null>(null)
    const { rows } = statements
    const actions = statementActions({
        canWrite,
        canSend: email.canSend,
        emailStatusLoading: email.isLoading,
    })

    // A statement deleted elsewhere while its dialog is open closes that dialog.
    const sendRow = rows.find(row => row.id === sendId) ?? null
    const isDeleteRowListed = rows.some(row => row.id === deleteTarget?.id)
    const isDeleteOpen = deleteTarget !== null && (deletion.isDeleting || isDeleteRowListed)

    const open = (row: StatementRow) => router.push(orgHref(statementHref(documentKey(row))))
    const create = () => router.push(orgHref(newStatementHref(customerId)))
    const retry = () => {
        void recoverLiveQueries({
            ...statements.recovery,
            onError: err => log.error('books.customer.statements', err),
        })
    }
    const onSelect = (row: StatementRow, action: StatementRowAction) => {
        if (action === 'open') open(row)
        else if (action === 'send') setSendId(row.id)
        else if (action === 'delete') setDeleteTarget({ id: row.id, number: row.number })
        else
            download.mutate({
                kind: 'statement',
                id: row.id,
                fallbackName: fallbackNameOf(row, customerName),
            })
    }
    const menu: RowMenuModel = {
        items: actions.rowMenu,
        isWriting: deletion.isDeleting || !writes.available,
        onSelect,
    }
    const closeSend = () => setSendId(null)
    const closeDelete = () => {
        if (!deletion.isDeleting) setDeleteTarget(null)
    }
    const confirmDelete = async () => {
        if (deleteTarget === null) return
        await deletion.remove(deleteTarget.id)
        setDeleteTarget(null)
    }
    const onConfirmDelete = () => void confirmDelete()
    const hasRows = !statements.isLoading && !statements.isError && rows.length > 0
    const showsHeaderCreate = hasRows && canWrite
    const deleteNumber = deleteTarget?.number ?? ''
    return (
        <View testID="customer-statements" className="flex-1" onLayout={fits.onLayout}>
            <TabHeader isVisible={showsHeaderCreate} onCreate={create} gutterClass={gutterClass} />
            <StatementsBody
                rows={rows}
                menu={menu}
                onOpen={open}
                fits={fits}
                isLoading={statements.isLoading}
                isError={statements.isError}
                canWrite={canWrite}
                onRetry={retry}
                onCreate={create}
                gutterClass={gutterClass}
            />
            <SendStatementDialog
                statement={sendRow}
                customerName={customerName}
                customerEmail={customerEmail}
                isOpen={sendRow !== null}
                onClose={closeSend}
            />
            <DeleteStatementDialog
                number={deleteNumber}
                isOpen={isDeleteOpen}
                isDeleting={deletion.isDeleting}
                onClose={closeDelete}
                onConfirm={onConfirmDelete}
            />
        </View>
    )
}
