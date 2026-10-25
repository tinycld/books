import { EntriesScreenView } from '../../components/entries/EntriesScreenView'
import { useEntriesScreen } from '../../hooks/useEntriesScreen'

export default function EntriesScreen() {
    return <EntriesScreenView model={useEntriesScreen()} />
}
