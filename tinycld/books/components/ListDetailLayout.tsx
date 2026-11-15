import { FrozenSlideStack } from '@tinycld/core/components/workspace/FrozenStack'
import { Stack, ThemeProvider, useTheme } from 'expo-router'
import { type ReactNode, useMemo } from 'react'
import { Platform, View } from 'react-native'
import { useDetailSurface } from '../hooks/useDetailSurface'
import {
    type DetailWidth,
    detailScreenOptions,
    INDEX_SCREEN_OPTIONS,
    listColumnStyle,
    stackContainerStyle,
    stackPointerEvents,
} from '../lib/detail-surface'

interface ListDetailLayoutProps {
    list: ReactNode
    isDetailOpen: boolean
    detailScreens: readonly string[]
    detailWidth: DetailWidth
}

// The navigator paints every card screen with the theme's background, which a
// transparent contentStyle does not reach on web; that layer would hide the list
// under the empty index screen. The record screens draw their own opaque surface.
function useTransparentStackTheme() {
    const theme = useTheme()
    return useMemo(
        () => ({ ...theme, colors: { ...theme.colors, background: 'transparent' } }),
        [theme]
    )
}

// A list with its records in a child stack: beside the list in a panel on a very wide
// window, over it as a page otherwise. The element tree is the same on both surfaces
// and only style values change, so the stack and the open record never remount when
// the window crosses the threshold, or when the route changes the detail width.
export function ListDetailLayout({
    list,
    isDetailOpen,
    detailScreens,
    detailWidth,
}: ListDetailLayoutProps) {
    const surface = useDetailSurface()
    const stackTheme = useTransparentStackTheme()
    const options = detailScreenOptions(surface)
    const screens = detailScreens.map(name => (
        <Stack.Screen key={name} name={name} options={options} />
    ))
    const listStyle = listColumnStyle(surface, detailWidth, isDetailOpen)
    const stackStyle = stackContainerStyle(surface, isDetailOpen, detailWidth)
    return (
        <View className="flex-1 flex-row" style={{ position: 'relative' }}>
            <View style={listStyle}>{list}</View>
            <View
                className="border-border"
                style={stackStyle}
                pointerEvents={stackPointerEvents(Platform.OS === 'web', isDetailOpen)}
            >
                <ThemeProvider value={stackTheme}>
                    <FrozenSlideStack>
                        <Stack.Screen name="index" options={INDEX_SCREEN_OPTIONS} />
                        {screens}
                    </FrozenSlideStack>
                </ThemeProvider>
            </View>
        </View>
    )
}
