import { BankingScreenView } from '../../components/banking/BankingScreenView'
import { useBankingScreen } from '../../hooks/useBankingScreen'

export default function BankingScreen() {
    return <BankingScreenView model={useBankingScreen()} />
}
