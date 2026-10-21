import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ScrollView, Text, View } from 'react-native'

// Index route for Books, served at /a/books.
// Replace this placeholder with your list view (cards, table, whatever you
// need) and wire it to your pbtsdb collections using `useLiveQuery`
// (or `useMyLiveQuery` when the query filters the current user's own rows).
//
// For navigation, use `useOrgHref()` from `@tinycld/core/lib/org-routes` —
// never literal paths like `router.push('/books/new')`, which miss the
// /a app-route prefix and resolve to +not-found. `/a` is a constant segment,
// not an org slug: single-org deployments give each org its own host, so
// nothing interpolates into it. See https://tinycld.org/docs/tasks/routing
//
//   const orgHref = useOrgHref()
//   router.push(orgHref('books/new'))
//   router.push(orgHref('books/[id]', { id: itemId }))

export default function BooksIndex() {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')

    return (
        <ScrollView className="flex-1 bg-background">
            <View className="p-6 gap-3">
                <Text style={{ color: fg, fontSize: 22, fontWeight: '600' }}>Books</Text>
                <Text style={{ color: muted, fontSize: 14 }}>
                    Placeholder landing screen for books.
                </Text>
            </View>
        </ScrollView>
    )
}
