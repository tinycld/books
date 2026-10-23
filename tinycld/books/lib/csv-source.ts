// A chosen CSV file: the browser's File on web, a picker result on native.
export type CsvSource = File | { uri: string; name: string; size?: number }
