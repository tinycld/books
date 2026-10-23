import { AccountsScreenView } from '../../components/accounts/AccountsScreenView'
import { useAccountsScreen } from '../../hooks/useAccountsScreen'

export default function AccountsScreen() {
    return <AccountsScreenView {...useAccountsScreen()} />
}
