import { Text, View } from 'react-native'

function StepBadge({ position, isReached }: { position: number; isReached: boolean }) {
    const tone = isReached ? 'bg-primary' : 'bg-secondary'
    const text = isReached ? 'text-primary-foreground' : 'text-secondary-foreground'
    return (
        <View className={`h-6 w-6 items-center justify-center rounded-full ${tone}`}>
            <Text className={`text-xs font-semibold ${text}`}>{position}</Text>
        </View>
    )
}

interface ImportStepsProps {
    steps: readonly string[]
    // 1-based. A step is reached when its position is at most `current`; a `current` past
    // the last step marks every step reached and none current.
    current: number
    isVisible?: boolean
    testID?: string
}

export function ImportSteps({ steps, current, isVisible = true, testID }: ImportStepsProps) {
    if (!isVisible) return null
    const items = steps.map((label, i) => {
        const position = i + 1
        const isCurrent = position === current
        const isReached = position <= current
        const ariaCurrent = isCurrent ? 'step' : undefined
        const labelClass = isCurrent
            ? 'text-sm font-semibold text-foreground'
            : 'text-sm text-muted-foreground'
        return (
            <View
                key={label}
                className="flex-row items-center gap-2"
                accessibilityLabel={`Step ${position}: ${label}`}
                aria-current={ariaCurrent}
            >
                <StepBadge position={position} isReached={isReached} />
                <Text className={labelClass}>{label}</Text>
            </View>
        )
    })
    return (
        <View testID={testID} className="flex-row flex-wrap items-center gap-4">
            {items}
        </View>
    )
}
