import { Text, View } from 'react-native'

const STEPS = ['Upload', 'Map columns', 'Import'] as const

function StepBadge({ position, isReached }: { position: number; isReached: boolean }) {
    const tone = isReached ? 'bg-primary' : 'bg-secondary'
    const text = isReached ? 'text-primary-foreground' : 'text-secondary-foreground'
    return (
        <View className={`h-6 w-6 items-center justify-center rounded-full ${tone}`}>
            <Text className={`text-xs font-semibold ${text}`}>{position}</Text>
        </View>
    )
}

export function ImportSteps({ step }: { step: 1 | 2 | 3 | 4 }) {
    const items = STEPS.map((label, i) => {
        const position = i + 1
        // The summary is step 4: every step is complete and none is current.
        const isCurrent = position === step
        const weight = isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'
        return (
            <View
                key={label}
                className="flex-row items-center gap-2"
                accessibilityLabel={`Step ${position}: ${label}`}
                aria-current={isCurrent ? 'step' : undefined}
            >
                <StepBadge position={position} isReached={position <= step} />
                <Text className={`text-sm ${weight}`}>{label}</Text>
            </View>
        )
    })
    return <View className="flex-row flex-wrap items-center gap-4">{items}</View>
}
