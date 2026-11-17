import { Button, ButtonIcon, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { type Href, router } from 'expo-router'
import { ChevronDown } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { View, type ViewInstance } from 'react-native'
import { WhileOpen } from '../RecordRowMenu'

export interface ShippedReportsMenuItem {
    key: string
    label: string
    // Null while the report loads, when its read fails and when the reader has none.
    href: Href | null
    testID: string
}

interface ShippedReportsMenuProps {
    items: readonly ShippedReportsMenuItem[]
    testID: string
}

/**
 * "Reports": a menu of the shipped reports a list links to (a sheet on a phone). An item
 * shows only while its report is found, and the button only while one is. Navigation
 * only, so it shows for every reader and needs no write access.
 */
export function ShippedReportsMenu({ items, testID }: ShippedReportsMenuProps) {
    const anchorRef = useRef<ViewInstance>(null)
    const [isOpen, setIsOpen] = useState(false)
    const found = items.filter(item => item.href !== null)
    if (found.length === 0) return null
    const open = () => setIsOpen(true)
    const menuItems = found.map(item => {
        const href = item.href
        const select = () => {
            if (href !== null) router.push(href)
        }
        return (
            <Menu.Item key={item.key} label={item.label} testID={item.testID} onSelect={select} />
        )
    })
    return (
        <View ref={anchorRef}>
            <Button
                testID={testID}
                variant="outline"
                size="sm"
                style={{ minHeight: 36 }}
                onPress={open}
            >
                <ButtonText>Reports</ButtonText>
                <ButtonIcon as={ChevronDown} />
            </Button>
            <Menu
                anchor={anchorRef}
                isOpen={isOpen}
                onOpenChange={setIsOpen}
                title="Reports"
                sheetSide="bottom"
                placement="bottom-end"
                presentation="auto"
            >
                <WhileOpen>{menuItems}</WhileOpen>
            </Menu>
        </View>
    )
}
