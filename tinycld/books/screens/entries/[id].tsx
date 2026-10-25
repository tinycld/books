import { useLocalSearchParams } from 'expo-router'
import { EntryScreenSwitch } from '../../components/entries/EntryScreenSwitch'

export default function EntryRoute() {
    const { id } = useLocalSearchParams<{ id: string }>()
    return <EntryScreenSwitch key={id} entryId={id} />
}
