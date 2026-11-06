import { useLocalSearchParams } from 'expo-router'
import { BankImportView } from '../../../components/banking/import/BankImportView'
import { useBankImport } from '../../../hooks/useBankImport'

export default function BankImportScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <BankImportView model={useBankImport(id ?? '')} />
}
