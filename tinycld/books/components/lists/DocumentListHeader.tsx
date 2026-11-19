import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { ChevronDown } from 'lucide-react-native'
import { Text, View } from 'react-native'
import type { DocumentListScreenState } from '../../hooks/useDocumentListScreen'
import type { DocumentListTab } from '../../lib/document-list'
import { areaOf, type ListArea } from '../../lib/list-areas'
import { ListTabs } from '../ListTabs'

type HeaderScreen = Pick<DocumentListScreenState, 'controls' | 'newMenu' | 'openNew' | 'goToTab'>

type NewItem = ListArea['newItems'][number]

interface NewProps {
    tab: DocumentListTab
    area: ListArea
    screen: HeaderScreen
}

const NEW_BUTTON_STYLE = { minHeight: 36 }

// One kind of the All tab's New menu; built only while the menu is open, because core
// Sheet keeps its content in the page while it slides out.
function NewMenuItem({
    item,
    area,
    screen,
}: {
    item: NewItem
    area: ListArea
    screen: HeaderScreen
}) {
    const select = () => screen.openNew(item.kind)
    const testID = `${area.testIdPrefix}-new-${item.idSuffix}`
    return <Menu.Item testID={testID} label={item.label} onSelect={select} />
}

function NewMenuItems({
    isOpen,
    area,
    screen,
}: {
    isOpen: boolean
    area: ListArea
    screen: HeaderScreen
}) {
    if (!isOpen) return null
    const items = area.newItems.map(item => (
        <NewMenuItem key={item.kind} item={item} area={area} screen={screen} />
    ))
    return <>{items}</>
}

function NewMenu({ tab, area, screen }: NewProps) {
    const color = useThemeColor('primary-foreground')
    const { isOpen, setOpen } = screen.newMenu
    // An element, not a component: the menu clones it with its press handler and ref.
    const trigger = (
        <Button testID={`${area.testIdPrefix}-new`} size="sm" style={NEW_BUTTON_STYLE}>
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
            <NewMenuItems isOpen={isOpen} area={area} screen={screen} />
        </Menu>
    )
}

// A kind tab's New opens its `new` route; the All tab's New is a menu of the area's New
// items.
function NewAction({ tab, area, screen }: NewProps) {
    if (!screen.controls.showNew) return null
    if (tab.newHref === null) return <NewMenu tab={tab} area={area} screen={screen} />
    const press = () => screen.openNew()
    return (
        <Button
            testID={`${area.testIdPrefix}-new`}
            size="sm"
            style={NEW_BUTTON_STYLE}
            onPress={press}
        >
            <ButtonText>{tab.newLabel}</ButtonText>
        </Button>
    )
}

// The area's title with the tab's New action, then the area's tab strip.
export function DocumentListHeader({
    tab,
    screen,
}: {
    tab: DocumentListTab
    screen: HeaderScreen
}) {
    const area = areaOf(tab)
    return (
        <>
            <View className="flex-row items-center justify-between gap-3 px-4 pb-3 pt-4">
                <Text
                    testID={`${area.testIdPrefix}-title`}
                    className="text-2xl font-semibold text-foreground"
                >
                    {area.title}
                </Text>
                <NewAction tab={tab} area={area} screen={screen} />
            </View>
            <ListTabs
                tabs={area.tabs}
                selected={tab.key}
                testIdPrefix={area.testIdPrefix}
                onSelect={screen.goToTab}
            />
        </>
    )
}
