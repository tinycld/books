import { createElement, type ReactNode, useState } from 'react'
import { RecordRowMenu } from '../components/RecordRowMenu'
import type { ListRecord } from '../lib/party-list'
import type { RecordFormStore } from '../stores/record-form-store'
import type { useRecordActions } from './useRecordActions'
import { useIsShowingRecord } from './useRecordNavigation'

type MenuRecord = ListRecord

export type RecordRowMenusConfig<R extends MenuRecord, I extends string> = {
    actions: ReturnType<typeof useRecordActions<R>>
    store: RecordFormStore<R>
    // The record the URL opens, or '' when none.
    openId: string
    listPath: string
    navigation: { open(id: string): void; leave(): void }
    canWrite: boolean
    itemsFor(record: R, canWrite: boolean): readonly I[]
    // The menu's title; a party shows its display name, a product its name.
    titleOf(record: R): string
    // An item beyond Edit, Make inactive, Make active and Delete.
    onExtra?(record: R, item: I): void
    menu: {
        triggerPrefix: string
        triggerLabel: string
        labels: Record<I, string>
        testIds: Record<I, string>
    }
}

/**
 * The row menus and the delete dialog they open. The list's one actions instance is
 * passed in, so the list's banner and the dialog read the same refusals. The dialog
 * shows the record as it was when Delete was chosen: the delete removes the row from
 * the list at once, and a refusal must still show in the dialog.
 */
export function useRecordRowMenus<R extends MenuRecord, I extends string>(
    config: RecordRowMenusConfig<R, I>
) {
    const { actions, navigation, canWrite, menu } = config
    const isShowing = useIsShowingRecord(config.listPath)
    const [deleteTarget, setDeleteTarget] = useState<R | null>(null)
    const dirtyRecordId = config.store(s => s.dirtyRecordId)
    const targetId = deleteTarget?.id ?? ''
    const isTargetOpen = targetId !== '' && targetId === config.openId

    // Opening a record's dialog drops that record's refusal: the dialog shows the
    // record's current state. Closing drops it too: the user has seen it in the dialog,
    // and it would otherwise come back in the banner. A refusal about another record
    // stays in the banner.
    const openDeleteDialog = (record: R) => {
        actions.clearActionError(record.id)
        setDeleteTarget(record)
    }

    const select = (record: R, item: I) => {
        if (item === 'edit') navigation.open(record.id)
        else if (item === 'make-inactive') void actions.setInactive(record.id, true)
        else if (item === 'make-active') void actions.setInactive(record.id, false)
        else if (item === 'delete') openDeleteDialog(record)
        else config.onExtra?.(record, item)
    }

    const menuFor = (record: R): ReactNode => {
        const items = config.itemsFor(record, canWrite)
        if (items.length === 0) return null
        return createElement(RecordRowMenu<I>, {
            title: config.titleOf(record),
            triggerTestId: `${menu.triggerPrefix}-${record.id}`,
            triggerLabel: menu.triggerLabel,
            items,
            labels: menu.labels,
            testIds: menu.testIds,
            onSelect: item => select(record, item),
            isWriting: actions.isWorking,
        })
    }

    // The delete's answer may arrive after the user moved on (another record, the Lists
    // hub, another package): it leaves to the list only while they still see that
    // record, so it never pulls them back.
    const leaveDeleted = (id: string) => {
        if (!isShowing(id)) return false
        navigation.leave()
        return true
    }

    // Only this record's refusal; another record's stays in the list's banner.
    const refusal = actions.actionError?.id === targetId ? actions.actionError.message : null

    // The load error, with Retry, comes before an action's refusal. A refusal about the
    // record whose delete dialog is open shows in the dialog, not twice.
    const bannerMessage = (loadError: string | null) => {
        if (loadError !== null) return loadError
        const actionError = actions.actionError
        return actionError && actionError.id !== deleteTarget?.id ? actionError.message : null
    }

    return {
        menuFor,
        deleteDialog: {
            record: deleteTarget,
            isOpenAndDirty: isTargetOpen && dirtyRecordId === targetId,
            refusal,
            onClose: () => {
                actions.clearActionError(targetId)
                setDeleteTarget(null)
            },
            onDeleted: () => leaveDeleted(targetId),
        },
        bannerMessage,
        dismissRefusal: () => actions.clearActionError(),
    }
}
