import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { fiscalStartMonth } from '../lib/register-range'

export function useFiscalYearStartMonth() {
    const [settingsCollection] = useStore('books_settings')
    const { data, isReady } = useLiveQuery(query => query.from({ settings: settingsCollection }))
    return { month: fiscalStartMonth(data?.[0]), isReady }
}
