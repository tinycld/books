import { ImportView } from '../../components/accounts/import/ImportView'
import { useAccountsImportScreen } from '../../hooks/useAccountsImportScreen'

export default function AccountsImportScreen() {
    return <ImportView {...useAccountsImportScreen()} />
}
