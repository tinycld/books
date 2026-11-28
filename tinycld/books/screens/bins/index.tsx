import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { BinsList } from '../../components/bins/BinsList'
import { useBinDialogStore } from '../../stores/bin-dialog-store'

/**
 * The bin list — `/a/books/bins` (inventory-adjust spec §3.7), the Bin locations tab of
 * Products and services. A bin opens in a dialog and has no route. The dialog lives in a
 * module store, and a pushed screen keeps this one mounted, so it closes when the screen
 * loses focus.
 */
export default function BinsScreen() {
    useFocusEffect(useCallback(() => () => useBinDialogStore.getState().close(), []))
    return <BinsList />
}
