import { EmptyState } from '@tinycld/core/components/EmptyState'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { View } from 'react-native'

export function OpeningEmptyState({ isVisible }: { isVisible: boolean }) {
    const orgHref = useOrgHref()
    if (!isVisible) return null
    return (
        <View testID="opening-empty" className="flex-1">
            <EmptyState
                message="No accounts to enter balances for"
                action={{ label: 'Go to Chart of Accounts', href: orgHref('books/accounts') }}
            />
        </View>
    )
}
