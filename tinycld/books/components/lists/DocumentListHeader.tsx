import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { ChevronDown } from 'lucide-react-native'
import { Text, View } from 'react-native'
import type { DocumentListScreenState } from '../../hooks/useDocumentListScreen'
import type { DocumentListTab } from '../../lib/document-list'
import { SALES_NEW_ITEMS, SALES_TABS } from '../../lib/sales-lists'
import { ListTabs } from '../ListTabs'

type HeaderScreen = Pick<DocumentListScreenState, 'controls' | 'newMenu' | 'openNew' | 'goToTab'>

type NewItem = (typeof SALES_NEW_ITEMS)[number]

const NEW_BUTTON_STYLE = { minHeight: 36 }

// The five kinds of the All sales New menu; built only while the menu is open, because
// core Sheet keeps its content in the page while it slides out.
function NewMenuItem({ item, screen }: { item: NewItem; screen: HeaderScreen }) {
    const select = () => screen.openNew(item.kind)
    const testID = `sales-new-${item.kind.replaceAll('_', '-')}`
    return <Menu.Item testID={testID} label={item.label} onSelect={select} />
}

function NewMenuItems({ isOpen, screen }: { isOpen: boolean; screen: HeaderScreen }) {
    if (!isOpen) return null
    const items = SALES_NEW_ITEMS.map(item => (
        <NewMenuItem key={item.kind} item={item} screen={screen} />
    ))
    return <>{items}</>
}

function NewMenu({ tab, screen }: { tab: DocumentListTab; screen: HeaderScreen }) {
    const color = useThemeColor('primary-foreground')
    const { isOpen, setOpen } = screen.newMenu
    // An element, not a component: the menu clones it with its press handler and ref.
    const trigger = (
        <Button testID="sales-new" size="sm" style={NEW_BUTTON_STYLE}>
            <ButtonText>{tab.newLabel}</ButtonText>
            <ChevronDown size={14} color={color} />
        </Button>
    )
    return (
        <Menu
            title={tab.newLabel}
            placement="bottom-end"
            sheetSide="bottom"
            isOpen={isOpen}
            onOpenChange={setOpen}
            trigger={trigger}
        >
            <NewMenuItems isOpen={isOpen} screen={screen} />
        </Menu>
    )
}

// A kind tab's New opens its `new` route; All sales' New is a menu of the five kinds.
function NewAction({ tab, screen }: { tab: DocumentListTab; screen: HeaderScreen }) {
    if (!screen.controls.showNew) return null
    if (tab.newHref === null) return <NewMenu tab={tab} screen={screen} />
    const press = () => screen.openNew()
    return (
        <Button testID="sales-new" size="sm" style={NEW_BUTTON_STYLE} onPress={press}>
            <ButtonText>{tab.newLabel}</ButtonText>
        </Button>
    )
}

// The Sales title with the tab's New action, then the tab strip.
export function DocumentListHeader({
    tab,
    screen,
}: {
    tab: DocumentListTab
    screen: HeaderScreen
}) {
    return (
        <>
            <View className="flex-row items-center justify-between gap-3 px-4 pb-3 pt-4">
                <Text testID="sales-title" className="text-2xl font-semibold text-foreground">
                    Sales
                </Text>
                <NewAction tab={tab} screen={screen} />
            </View>
            <ListTabs
                tabs={SALES_TABS}
                selected={tab.key}
                testIdPrefix="sales"
                onSelect={screen.goToTab}
            />
        </>
    )
}
