import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Redirect } from 'expo-router'

export default function BooksIndex() {
    const orgHref = useOrgHref()
    return <Redirect href={orgHref('books/lists')} />
}
