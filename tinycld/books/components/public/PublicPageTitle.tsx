import Head from 'expo-router/head'
import { Platform } from 'react-native'

// The browser tab title of a customer's page, exactly as given ("Invoice 1004 · <business>").
// Core DocumentTitle always puts the app's brand first ("TinyCld: …"), and the customer's
// invoice page shows the business, not the app (email-share spec §3.5, §7 spark 2). A
// native app has no tab title.
export function PublicPageTitle({ title }: { title: string }) {
    if (Platform.OS !== 'web') return null
    return (
        <Head>
            <title>{title}</title>
        </Head>
    )
}
