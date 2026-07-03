export type FileType = 'document' | 'sheet' | 'board' | 'slides'

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
      { label: 'Summarize data',   promptText: 'Describe what the data in this sheet shows in plain English' },
      { label: 'Create a chart',   promptText: 'Look at the data in this sheet, choose the best range and chart type for it, and create that chart' },
      { label: 'Add totals',       promptText: 'Add labeled total/summary formulas (SUM, AVERAGE as appropriate) in the empty cells directly below or beside the data' },
      { label: 'Generate data',    promptText: 'Generate realistic example data that fits this sheet, with a bold formatted header row' },
      { label: 'Explain formula',  promptText: 'Explain the formula in the selected cell in plain English' },
      { label: 'Find errors',      promptText: 'Scan this sheet for formula errors, broken references, and logical inconsistencies' },
    ],
    contextLabel: 'Sheet context',
    contextPlaceholder: 'What is this sheet tracking or calculating?',
    hasAnalysis: false,
  },
  board: {
    chips: [
      { label: 'Make a flowchart',    promptText: 'Create a flowchart on this board based on what the board is about (use the board context and existing notes)' },
      { label: 'Make a mind map',     promptText: 'Create a mind map on this board: a central topic node with 4-6 branches radiating outward' },
      { label: 'Summarize board',     promptText: 'Summarize all files and notes on this board and their relationships' },
      { label: 'Suggest connections', promptText: 'Identify items on this board that should be connected and draw those connections with labeled arrows' },
      { label: 'Find gaps',           promptText: 'Identify topics or ideas that appear to be missing from this board, and add them as sticky notes near the related content' },
    ],
    contextLabel: 'Board context',
    contextPlaceholder: 'What is this board mapping or planning?',
    hasAnalysis: false,
  },
  slides: {
    chips: [
      { label: 'Improve this slide',    promptText: "Improve the current slide's text: tighten the title into an assertive statement and shorten wordy bullets. Use updateText actions." },
      { label: 'Add a next slide',      promptText: 'Based on this presentation, add the slide that should logically come next' },
      { label: 'Write speaker notes',   promptText: 'Write 3-5 sentence speaker notes for the current slide and set them with a setNotes action' },
      { label: 'Add a diagram',         promptText: 'Add a simple, clean diagram to the current slide that illustrates its content, using shapes or an SVG element' },
      { label: 'Animate this slide',    promptText: "Add subtle, professional entrance animations to the current slide's elements (title first, then content), and a matching slide transition" },
      { label: 'Suggest a title',       promptText: 'Suggest 3 stronger titles for the current slide, then explain which you would pick and why. Do not use actions.' },
    ],
    contextLabel: 'Slides context',
    contextPlaceholder: "What's this presentation about? Topic, audience, goals…",
    hasAnalysis: false,
  },
}
