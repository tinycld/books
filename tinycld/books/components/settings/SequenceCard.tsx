import { Button, ButtonText } from '@tinycld/core/ui/button'
import { TextInput } from '@tinycld/core/ui/form'
import { Text, View } from 'react-native'
import { useSequenceForm } from '../../hooks/useSequenceForm'
import { docTypeLabel, nextNumberPreview } from '../../lib/doc-types'
import type { BooksDocSequences } from '../../types'
import { FieldNote, ReadOnlyRow, SectionCard } from './SectionCard'

const HELPER =
    'A new prefix applies to entries posted from now on. Numbers already issued do not change. The next number can move forward only.'

function Preview({ docType, text }: { docType: string; text: string }) {
    return (
        <Text className="text-sm text-foreground" testID={`books-settings-seq-${docType}-preview`}>
            {text}
        </Text>
    )
}

function SequenceReader({
    sequence,
    isVisible,
}: {
    sequence: BooksDocSequences
    isVisible: boolean
}) {
    if (!isVisible) return null
    const { doc_type: docType } = sequence
    const preview = nextNumberPreview(docType, sequence.prefix ?? '', String(sequence.next_number))
    return (
        <SectionCard title={docTypeLabel(docType)}>
            <View testID={`books-settings-seq-${docType}`}>
                <ReadOnlyRow label="Prefix" value={sequence.prefix ?? ''} />
                <ReadOnlyRow label="Next number" value={String(sequence.next_number)} />
                <View className="gap-1 pt-3">
                    <Preview docType={docType} text={preview} />
                    <FieldNote text={HELPER} />
                </View>
            </View>
        </SectionCard>
    )
}

function SequenceForm({
    sequence,
    isVisible,
}: {
    sequence: BooksDocSequences
    isVisible: boolean
}) {
    // Only admins reach here, so the write form is never built for a reader.
    if (!isVisible) return null
    return <SequenceFormBody sequence={sequence} />
}

function SequenceFormBody({ sequence }: { sequence: BooksDocSequences }) {
    const { form, submit, isPending, isDirty, preview } = useSequenceForm(sequence)
    const { control } = form
    const docType = sequence.doc_type
    const id = `books-settings-seq-${docType}`
    return (
        <SectionCard title={docTypeLabel(docType)}>
            <View className="gap-4" testID={id}>
                <View className="flex-row flex-wrap gap-4">
                    <View className="min-w-[240px] flex-1">
                        <TextInput
                            control={control}
                            name="prefix"
                            label="Prefix"
                            testID={`${id}-prefix`}
                        />
                    </View>
                    <View className="min-w-[240px] flex-1">
                        <TextInput
                            control={control}
                            name="next_number"
                            label="Next number"
                            keyboardType="number-pad"
                            testID={`${id}-next`}
                        />
                    </View>
                </View>
                <Preview docType={docType} text={preview} />
                <FieldNote text={HELPER} />
                <View className="flex-row">
                    <Button
                        testID={`${id}-save`}
                        isDisabled={!isDirty || isPending}
                        onPress={submit}
                    >
                        <ButtonText>Save</ButtonText>
                    </Button>
                </View>
            </View>
        </SectionCard>
    )
}

export function SequenceCard({
    sequence,
    isAdmin,
}: {
    sequence: BooksDocSequences
    isAdmin: boolean
}) {
    return (
        <>
            <SequenceForm sequence={sequence} isVisible={isAdmin} />
            <SequenceReader sequence={sequence} isVisible={!isAdmin} />
        </>
    )
}
