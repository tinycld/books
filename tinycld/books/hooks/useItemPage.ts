import { useLeaveGuard } from '@tinycld/core/components/forms-builder/use-leave-guard'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { usePublishDirty } from '../components/RecordChild'
import { selectRecordTab } from '../components/RecordTabs'
import { newAdjustmentPath } from '../lib/adjustment-route'
import { costingMethodOf } from '../lib/costing-method'
import { type ItemTab, itemTabOf } from '../lib/item-page-tabs'
import { mergeRecoveries } from '../lib/live-recovery'
import { PRODUCTS_PATH } from '../lib/product-route'
import { hasFieldErrors } from '../lib/root-errors'
import type { MoveChip } from '../lib/stock-move-chips'
import { useProductFormStore } from '../stores/product-form-store'
import { useDeletingRecord } from '../stores/record-form-store'
import type { BooksProducts } from '../types'
import { useBooksSettings } from './useBooksSettings'
import { useHasBins } from './useHasBins'
import { useProductActions } from './useProductActions'
import { useProductForm } from './useProductForm'
import { useProductNavigation } from './useProductNavigation'
import { useIsShowingRecord } from './useRecordNavigation'
import { useStockLayers } from './useStockLayers'
import { useStockMoves } from './useStockMoves'

// One function for the page's life, so the tab strip's keys stay registered as they are.
function selectItemTab(key: ItemTab) {
    selectRecordTab('stock', key)
}

// The page stays after its Details save, in place of the product form's leave.
function stayOnPage() {}

export type ReadStatus = 'loading' | 'error' | 'ready'

function statusOf(isError: boolean, isReady: boolean): ReadStatus {
    if (isError) return 'error'
    return isReady ? 'ready' : 'loading'
}

/**
 * What the figures and the Cost layers section read beside the item's row: the book's
 * costing method (`useBooksSettings`) and, on a FIFO book, the item's open cost layers.
 * `costStatus` is the fourth figure's: it waits for both, and a failed read (or a book
 * with no settings row) is an error with Retry, which recovers both reads at once.
 */
function useItemStock(productId: string) {
    const books = useBooksSettings()
    const costing = books.settings ? costingMethodOf(books.settings) : null
    const layers = useStockLayers(productId, costing === 'fifo')
    const settingsFailed = books.hasLoadError || (books.isReady && !books.settings)
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([books.recovery, layers.recovery]),
            onError: err => log.error('books.item.stock', err),
        })
    }
    return {
        costing,
        layers: layers.layers,
        costStatus: statusOf(settingsFailed || layers.isError, books.isReady && layers.isReady),
        layersStatus: statusOf(layers.isError, layers.isReady),
        retry,
    }
}

export type ItemStock = ReturnType<typeof useItemStock>

/**
 * An Inventory item's page state (inventory-adjust spec §3.6): the selected tab (the `tab`
 * search param), the movements' chip and their read (useStockMoves), and the Details form
 * (the product form). All live here, above the tabs, so a tab switch keeps the chip and
 * the form's edits. Save stays on the page; a refusal on a field
 * selects Details. The leave guard holds every way out while the form has edits, except
 * while a save runs or the item is being deleted. Adjust stock opens a new adjustment
 * with one line of the item; Move stock (a writer's, while the book has a bin) opens its
 * dialog; More makes it inactive or active, or deletes it.
 */
export function useItemPage(record: BooksProducts) {
    const params = useLocalSearchParams<{ tab?: string }>()
    const tab = itemTabOf(params.tab)
    const navigation = useProductNavigation()
    const actions = useProductActions()
    const isShowing = useIsShowingRecord(PRODUCTS_PATH)
    const orgHref = useOrgHref()
    const stock = useItemStock(record.id)
    // Local UI state above the tabbed area: the movements' chip.
    const [chip, setChip] = useState<MoveChip>('all')
    const moves = useStockMoves(record.id, chip)

    const details = useProductForm(
        { mode: 'edit', record },
        {
            afterEdit: stayOnPage,
            onRefused: fieldKeys => {
                if (fieldKeys.length > 0) selectItemTab('details')
            },
        }
    )
    const { readOnly, canWrite, isDirty, isSaving } = details

    // A field the form refuses before the write (a client rule) selects Details.
    const save = async () => {
        await details.save()
        if (hasFieldErrors(details.form.formState.errors)) selectItemTab('details')
    }

    // Cancel asks the same question as the leave guard; Discard puts the form back to the
    // stored values.
    const [isCancelling, setCancelling] = useState(false)
    const discard = () => {
        // The edit form follows the record with `keepDirtyValues`, which react-hook-form
        // also lays under this call; off here, the stored values replace the typed ones.
        details.form.reset(undefined, { keepDirtyValues: false })
        setCancelling(false)
    }
    const cancelQuestion = {
        isConfirming: isCancelling,
        cancel: () => setCancelling(false),
        discard,
    }
    const cancel = () => setCancelling(true)

    const isBeingDeleted = useDeletingRecord(useProductFormStore, record.id) !== undefined
    const guard = useLeaveGuard(isDirty && !isSaving && !isBeingDeleted)
    usePublishDirty(useProductFormStore, details.form, record.id, readOnly)

    // The More menu's Delete dialog. While it is open it shows this item's refusal, so the
    // page's banner does not show it a second time.
    const [isDeleteOpen, setDeleteOpen] = useState(false)
    const openDelete = () => {
        actions.clearActionError(record.id)
        setDeleteOpen(true)
    }
    const closeDelete = () => {
        actions.clearActionError(record.id)
        setDeleteOpen(false)
    }
    // The delete's answer may land after the user went on: it leaves to the list only
    // while they still see this item.
    const onDeleted = () => {
        if (!isShowing(record.id)) return false
        navigation.leave()
        return true
    }
    const toggleInactive = () => void actions.setInactive(record.id, !record.inactive)

    const adjustStock = () => {
        const route = newAdjustmentPath({ product: record.id })
        router.push(orgHref(route.path, route.params))
    }

    // Move stock is offered only while the book has a bin location (spec §3.6 "Header").
    const hasBins = useHasBins() === true
    const [isMoveOpen, setMoveOpen] = useState(false)
    // Stable, so the phone's Move stock key (ItemMoreMenu) registers once.
    const openMove = useCallback(() => setMoveOpen(true), [])
    const closeMove = useCallback(() => setMoveOpen(false), [])
    const moveStock = {
        isOffered: canWrite && hasBins,
        isOpen: isMoveOpen,
        open: openMove,
        close: closeMove,
    }

    const actionRefusal = actions.actionError?.message ?? null
    const bannerMessage = isDeleteOpen ? null : actionRefusal
    const deleteRefusal = actions.actionError?.id === record.id ? actionRefusal : null

    // On the Details tab the form's own summary shows its root refusal; elsewhere the save
    // bar shows it.
    const rootError =
        tab === 'details' ? null : (details.form.formState.errors.root?.message ?? null)

    return {
        tab,
        setTab: selectItemTab,
        stock,
        chip,
        setChip,
        moves,
        details,
        isDirty,
        isSaving,
        save,
        cancel,
        cancelQuestion,
        guard,
        rootError,
        canWrite,
        navigation,
        actions,
        adjustStock,
        moveStock,
        toggleInactive,
        deleteDialog: {
            isOpen: isDeleteOpen,
            open: openDelete,
            close: closeDelete,
            onDeleted,
            refusal: deleteRefusal,
        },
        bannerMessage,
    }
}

export type ItemPageState = ReturnType<typeof useItemPage>
