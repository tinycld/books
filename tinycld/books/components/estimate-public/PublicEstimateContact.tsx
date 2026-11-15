import { log } from '@tinycld/core/lib/logger'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Linking, Text, View } from 'react-native'
import { contactLeadOf, contactOf, type PublicEstimateRow } from '../../lib/estimate-public'

const TAP = { minHeight: 44 }

function openContact(url: string) {
    Linking.openURL(url).catch(err =>
        log.warn('books.estimate-public', 'could not open the contact link', {
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

interface PublicEstimateContactProps {
    row: Pick<PublicEstimateRow, 'business_email' | 'business_phone'>
    business: string
}

// Under the card, when Books has an email or a phone: whom to ask. Neither set: nothing.
export function PublicEstimateContact({ row, business }: PublicEstimateContactProps) {
    const contact = contactOf(row)
    if (contact === null) return null
    const lead = contactLeadOf(business)
    const mailto = `mailto:${contact.email}`
    const tel = `tel:${contact.phone.replace(/\s+/g, '')}`
    return (
        <View testID="estimate-public-contact" className="items-center gap-1">
            <Text className="text-center text-sm text-muted-foreground">{lead}</Text>
            <View className="flex-row flex-wrap justify-center">
                <ContactLink
                    value={contact.email}
                    url={mailto}
                    testID="estimate-public-contact-email"
                />
                <ContactLink
                    value={contact.phone}
                    url={tel}
                    testID="estimate-public-contact-phone"
                />
            </View>
        </View>
    )
}
