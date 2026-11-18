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
        /** react-native-web forwards it as the DOM `inert` attribute: the subtree leaves the
         *  Tab order and the accessibility tree. Native drops it; pair it with `aria-hidden`,
         *  which hides the subtree from VoiceOver and TalkBack. */
        inert?: boolean
    }
}
