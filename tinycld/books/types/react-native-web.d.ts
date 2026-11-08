// react-native-web accepts a `dataSet` prop on View/Pressable and renders each key as a
// `data-*` attribute, but the react-native types do not model it. The app shell carries the
// same augment (tinycld/react-native-web.d.ts), which is not part of this package's own
// typecheck. `PressableProps extends Omit<ViewProps, …>`, so augmenting ViewProps covers
// Pressable too.
import 'react-native'

declare module 'react-native' {
    interface ViewProps {
        /** react-native-web only: each entry renders as a `data-<kebab-key>` DOM attribute.
         *  No-op on native. */
        dataSet?: Record<string, string | number | undefined>
    }
}
