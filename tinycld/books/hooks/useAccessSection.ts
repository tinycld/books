import { useForm, useWatch } from 'react-hook-form'
import { filterPeople } from '../lib/access-levels'
import { useAccessList } from './useAccessList'

export function useAccessSection() {
    const { people, isReady, hasLoadError, retryLoad, viewerOrgRole, viewerId } = useAccessList()
    const { control } = useForm({ defaultValues: { search: '' } })
    const search = useWatch({ control, name: 'search' }).trim()
    const shown = filterPeople(people ?? [], search)
    return {
        people: shown,
        control,
        isEmpty: isReady && shown.length === 0,
        emptyText: search ? `No one matches ${search}.` : 'No people to show.',
        isReady,
        hasLoadError,
        retryLoad,
        viewerOrgRole,
        viewerId,
    }
}
