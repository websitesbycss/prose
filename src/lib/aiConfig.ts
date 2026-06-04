export type FileType = 'document' | 'sheet' | 'board'

export interface AiChip {
  label: string
  promptText: string
}

export interface FileTypeAiConfig {
  chips: AiChip[]
  contextLabel: string
  contextPlaceholder: string
  hasAnalysis: boolean
}

export const FILE_TYPE_AI_CONFIG: Record<FileType, FileTypeAiConfig> = {
  document: {
    chips: [
      { label: 'Strengthen thesis',     promptText: 'Strengthen thesis' },
      { label: 'Check paragraph focus', promptText: 'Check paragraph focus' },
      { label: 'Suggest transition',    promptText: 'Suggest transition' },
      { label: 'Improve clarity',       promptText: 'Improve clarity' },
      { label: 'Check argument',        promptText: 'Check argument' },
      { label: 'Determine reading level', promptText: 'Determine reading level' },
    ],
    contextLabel: 'Document context',
    contextPlaceholder: "What's this document about? Topic, audience, goals…",
    hasAnalysis: true,
  },
  sheet: {
    chips: [
      { label: 'Explain formula',  promptText: 'Explain the formula in the selected cell in plain English' },
      { label: 'Suggest formula',  promptText: 'Suggest a formula for the selected column based on the data structure' },
      { label: 'Find errors',      promptText: 'Scan this sheet for formula errors, broken references, and logical inconsistencies' },
      { label: 'Summarize data',   promptText: 'Describe what the data in this sheet shows in plain English' },
      { label: 'Generate data',    promptText: 'Generate appropriate example data for this sheet structure' },
    ],
    contextLabel: 'Sheet context',
    contextPlaceholder: 'What is this sheet tracking or calculating?',
    hasAnalysis: false,
  },
  board: {
    chips: [
      { label: 'Summarize board',     promptText: 'Summarize all files and notes on this board and their relationships' },
      { label: 'Suggest connections', promptText: 'Identify files on this board that should be connected with arrows based on their content' },
      { label: 'Find gaps',           promptText: 'Identify topics or ideas that appear to be missing from this board based on what is present' },
    ],
    contextLabel: 'Board context',
    contextPlaceholder: 'What is this board mapping or planning?',
    hasAnalysis: false,
  },
}
