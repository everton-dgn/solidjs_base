export type TextEdit = readonly [RegExp, string]
export type FileEdits = Record<string, readonly TextEdit[]>
