import { log } from '@tinycld/core/lib/logger'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Linking, Text, View } from 'react-native'
import { contactLeadOf, contactOf, contactUrlsOf } from '../../lib/public-page'

const TAP = { minHeight: 44 }

function openContact(url: string) {
    Linking.openURL(url).catch(err =>
        log.warn('books.public-page', 'could not open the contact link', {
            scheme: url.split(':')[0],
            error: String(err),
        })
    )
}

function ContactLink({ value, url, testID }: { value: string; url: string; testID: string }) {
    if (value === '') return null
    const onPress = () => openContact(url)
    return (
        <Button testID={testID} variant="link" size="sm" style={TAP} onPress={onPress}>
            <ButtonText>{value}</ButtonText>
        </Button>
    )
}

interface PublicContactProps {
    business: { name: string; email: string; phone: string }
    // The page's test id stem: "estimate-public" gives estimate-public-contact and its links.
    testIdPrefix: string
}

// Under the card of a customer's page, when Books has an email or a phone: whom to ask.
// Neither set: nothing.
export function PublicContact({ business, testIdPrefix }: PublicContactProps) {
    const contact = contactOf({ business_email: business.email, business_phone: business.phone })
    if (contact === null) return null
    const lead = contactLeadOf(business.name)
    const { mailto, tel } = contactUrlsOf(contact)
    return (
        <View testID={`${testIdPrefix}-contact`} className="items-center gap-1">
            <Text className="text-center text-sm text-muted-foreground">{lead}</Text>
            <View className="flex-row flex-wrap justify-center">
                <ContactLink
                    value={contact.email}
                    url={mailto}
                    testID={`${testIdPrefix}-contact-email`}
                />
                <ContactLink
                    value={contact.phone}
                    url={tel}
                    testID={`${testIdPrefix}-contact-phone`}
                />
            </View>
        </View>
    )
}
