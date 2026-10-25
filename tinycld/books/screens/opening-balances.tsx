import { useLocalSearchParams } from 'expo-router'
import { OpeningBalancesScreenView } from '../components/opening-balances/OpeningBalancesScreenView'
import { useOpeningBalancesScreen } from '../hooks/useOpeningBalancesScreen'

export default function OpeningBalancesScreen() {
    const { edit } = useLocalSearchParams<{ edit?: string }>()
    const screen = useOpeningBalancesScreen(edit === '1')
    return <OpeningBalancesScreenView screen={screen} />
}
