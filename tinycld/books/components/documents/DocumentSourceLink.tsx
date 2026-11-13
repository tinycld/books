import { type KeyDownEvent, Pressable, Text } from 'react-native'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import type { SalesDocumentKind } from '../../lib/sales-document-kinds'

interface DocumentSourceLinkProps {
    label: string
    // The kind and id of the document this one names.
    kind: Pick<SalesDocumentKind, 'routeBase'>
    id: string
    testID: string
}

const OPEN_KEYS = new Set(['Enter', ' '])
const LINK_STYLE = { minHeight: 44 }

/**
 * A link to the document another one names ("From estimate 1001", "Converted to invoice
 * 1004"). It pops back to that document's screen when it is below this one in the stack,
 * else pushes it (useOpenDocument). A Tab stop with no shortcut (lesson 28). Enter or
 * Space opens it: react-native-web leaves a focused link's keys to the browser's native
 * link, but with no href it renders a plain element the browser never clicks.
 */
export function DocumentSourceLink({ label, kind, id, testID }: DocumentSourceLinkProps) {
    const open = useOpenDocument(kind, id)
    const onKeyDown = (event: KeyDownEvent) => {
        if (!OPEN_KEYS.has(event.nativeEvent.key)) return
        event.preventDefault()
        open()
    }
    return (
        <Pressable
            testID={testID}
            accessibilityRole="link"
            onPress={open}
            onKeyDown={onKeyDown}
            className="justify-center self-start"
            style={LINK_STYLE}
        >
            <Text className="text-sm text-primary underline">{label}</Text>
        </Pressable>
    )
}
