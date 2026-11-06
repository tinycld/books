import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { TaxesPage } from '../components/taxes/TaxesPage'
import { useTaxesScreen } from '../hooks/useTaxesScreen'
import { useTaxesStore } from '../stores/taxes-store'

export default function TaxesScreen() {
    const screen = useTaxesScreen()
    // The page's state lives in a module store; a pushed route keeps this screen
    // mounted, so reset it when the screen loses focus.
    useFocusEffect(useCallback(() => () => useTaxesStore.getState().reset(), []))
    return <TaxesPage screen={screen} />
}
