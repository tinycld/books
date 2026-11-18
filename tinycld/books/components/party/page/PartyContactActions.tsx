import { log } from '@tinycld/core/lib/logger'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { type LucideIcon, Mail, Phone } from 'lucide-react-native'
import { Linking, Pressable } from 'react-native'
import type { DocumentPartyKey } from '../../../lib/sales-document-kinds'

interface IconActionProps {
    isVisible: boolean
    label: string
    icon: LucideIcon
    url: string
    party: DocumentPartyKey
    testID: string
}

// A device with no handler for the link (a desktop browser and `tel:`) opens nothing.
// The Contacts tab's Email and Phone links open through it too.
export function openLink(party: DocumentPartyKey, url: string) {
    Linking.openURL(url).catch(error =>
        log.warn(`books.${party}-page`, 'could not open a contact link', { error })
    )
}

function IconAction({ isVisible, label, icon: Icon, url, party, testID }: IconActionProps) {
    const color = useThemeColor('muted-foreground')
    if (!isVisible) return null
    const onPress = () => openLink(party, url)
    return (
        <Pressable
            testID={testID}
            accessibilityRole="link"
            accessibilityLabel={label}
            onPress={onPress}
            className="h-11 w-11 items-center justify-center rounded-md"
        >
            <Icon size={18} color={color} />
        </Pressable>
    )
}

interface PartyContactActionsProps {
    // The party's name, for the links' accessible labels ("Email <name>").
    name: string
    email: string
    // The number Call dials; the party's page picks it (a customer's phone, else mobile).
    phone: string
    party: DocumentPartyKey
    testIdPrefix: string
}

// Email and Call beside the party's name, each only when the party has the value.
export function PartyContactActions({
    name,
    email,
    phone,
    party,
    testIdPrefix,
}: PartyContactActionsProps) {
    return (
        <>
            <IconAction
                isVisible={email !== ''}
                label={`Email ${name}`}
                icon={Mail}
                url={`mailto:${email}`}
                party={party}
                testID={`${testIdPrefix}-email-action`}
            />
            <IconAction
                isVisible={phone !== ''}
                label={`Call ${name}`}
                icon={Phone}
                url={`tel:${phone}`}
                party={party}
                testID={`${testIdPrefix}-call-action`}
            />
        </>
    )
}
