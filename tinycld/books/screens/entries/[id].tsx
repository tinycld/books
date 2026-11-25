import { useLocalSearchParams } from 'expo-router'
import { EntryScreenSwitch } from '../../components/entries/EntryScreenSwitch'
import { useEntryRouteId } from '../../hooks/useRouteRecordId'

export default function EntryRoute() {
    const { id: key } = useLocalSearchParams<{ id: string }>()
    const id = useEntryRouteId('journal', key)
    if (id === undefined) return null
    return <EntryScreenSwitch key={id} entryId={id} />
}
