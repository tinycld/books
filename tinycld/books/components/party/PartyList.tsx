import type { ReactNode } from 'react'
import { View } from 'react-native'
import type { RecordListState } from '../../hooks/useRecordList'
import {
    PARTY_COLUMNS,
    PARTY_ROW_HEIGHT,
    PARTY_TABLE_MIN_WIDTH,
    type PartyListCopy,
    type PartyListRow,
    type PartyRecord,
    partyCardHeight,
} from '../../lib/party-list'
import { ListCards } from '../ListCards'
import { ListHeaderCell, ListHeaderRow, ListTable } from '../ListTable'
import { RecordListFrame } from '../RecordListFrame'
import { PartyCard } from './PartyCard'
import { PartyRow } from './PartyRow'

export type { PartyListCopy }

export type PartyListProps<T extends PartyRecord> = {
    listPrefix: string
    recordPrefix: string
    copy: PartyListCopy
    list: RecordListState<PartyListRow<T>>
    canWrite: boolean
    // The record the URL opens, or '' when none.
    openId: string
    indentPx: number
    onOpen(id: string): void
    onNew(): void
    onRetry(): void
    // The row menu for one record, or null for a reader.
    menuFor(record: T): ReactNode
    bannerMessage: string | null
    isLoadError: boolean
    onDismissBanner(): void
    dialog: ReactNode
}

const partyKey = (row: PartyListRow<PartyRecord>) => row.party.id

const partyHeightOf = (row: PartyListRow<PartyRecord>, fontScale: number) =>
    partyCardHeight(row.party, fontScale)

function PartyTableHeader({ testID }: { testID: string }) {
    return (
        <ListHeaderRow testID={testID}>
            <ListHeaderCell label="Name" style={PARTY_COLUMNS.name} />
            <ListHeaderCell label="Email" style={PARTY_COLUMNS.email} />
            <ListHeaderCell label="Phone" style={PARTY_COLUMNS.phone} />
            <View style={PARTY_COLUMNS.menu} />
        </ListHeaderRow>
    )
}

// A list of people or companies. The open record (`openId`, from the URL) is marked on
// the panel surface, where the list stays in view beside it.
export function PartyList<T extends PartyRecord>(props: PartyListProps<T>) {
    const { listPrefix, recordPrefix, copy, list, canWrite, openId, indentPx } = props
    const renderTable = (selectedId: string) => (
        <ListTable<PartyListRow<T>>
            testID={`${listPrefix}-table`}
            minWidth={PARTY_TABLE_MIN_WIDTH}
            rowHeight={PARTY_ROW_HEIGHT}
            header={<PartyTableHeader testID={`${listPrefix}-header`} />}
            rows={list.rows}
            keyOf={partyKey}
            renderRow={row => (
                <PartyRow
                    row={row}
                    testIdPrefix={recordPrefix}
                    indentPx={indentPx}
                    onOpen={props.onOpen}
                    isSelected={row.party.id === selectedId}
                    menu={props.menuFor(row.party)}
                />
            )}
        />
    )
    const renderCards = () => (
        <ListCards<PartyListRow<T>>
            testID={`${listPrefix}-cards`}
            rows={list.rows}
            heightOf={partyHeightOf}
            keyOf={partyKey}
            renderCard={(row, height) => (
                <PartyCard
                    row={row}
                    testIdPrefix={recordPrefix}
                    indentPx={indentPx}
                    onOpen={props.onOpen}
                    height={height}
                    menu={props.menuFor(row.party)}
                />
            )}
        />
    )

    return (
        <RecordListFrame
            listPrefix={listPrefix}
            recordPrefix={recordPrefix}
            copy={copy}
            list={list}
            canWrite={canWrite}
            openId={openId}
            onNew={props.onNew}
            onRetry={props.onRetry}
            bannerMessage={props.bannerMessage}
            isLoadError={props.isLoadError}
            onDismissBanner={props.onDismissBanner}
            renderTable={renderTable}
            renderCards={renderCards}
            dialog={props.dialog}
        />
    )
}
