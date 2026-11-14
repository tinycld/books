import { log } from '@tinycld/core/lib/logger'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { type LucideIcon, Mail, Phone } from 'lucide-react-native'
import { Linking, Pressable } from 'react-native'
import type { BooksCustomers } from '../../../types'

interface IconActionProps {
    isVisible: boolean
    label: string
    icon: LucideIcon
    url: string
    testID: string
}

// A device with no handler for the link (a desktop browser and `tel:`) opens nothing.
function openLink(url: string) {
    Linking.openURL(url).catch(error =>
        log.warn('books.customer-page', 'could not open a contact link', { error })
    )
}

function IconAction({ isVisible, label, icon: Icon, url, testID }: IconActionProps) {
    const color = useThemeColor('muted-foreground')
    if (!isVisible) return null
    const onPress = () => openLink(url)
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

// Email and Call beside the customer's name, each only when the customer has the value.
// Call uses the phone, else the mobile.
export function CustomerContactActions({ record }: { record: BooksCustomers }) {
    const phone = record.phone || record.mobile
    const name = record.display_name
    return (
        <>
            <IconAction
                isVisible={record.email !== ''}
                label={`Email ${name}`}
                icon={Mail}
                url={`mailto:${record.email}`}
                testID="customer-email-action"
            />
            <IconAction
                isVisible={phone !== ''}
                label={`Call ${name}`}
                icon={Phone}
                url={`tel:${phone}`}
                testID="customer-call-action"
            />
        </>
    )
}
