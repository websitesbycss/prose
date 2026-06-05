// Server-side Sheet content utilities.
// Mirrors src/types/sheet.ts — kept separate to avoid importing renderer-side modules.

interface SheetTab {
  cells: Record<string, unknown>
}

interface SheetContent {
  version: 1
  tabs: SheetTab[]
}

export function isSheetContent(content: unknown): content is SheetContent {
  if (!content || typeof content !== 'object') return false
  const c = content as Record<string, unknown>
  return c.version === 1 && Array.isArray(c.tabs)
}

export function countSheetCells(content: SheetContent): number {
  return content.tabs.reduce((sum, tab) => sum + Object.keys(tab.cells).length, 0)
}

export function createInitialSheetContent(): SheetContent {
  return {
    version: 1,
    tabs: [
      {
        cells: {},
      },
    ],
  } as unknown as SheetContent
}

/** Returns the unit count for a piece of file content:
 *  - Sheet: number of non-empty cells
 *  - Document: word count (callers supply an already-computed word count)
 *  - Board: element count (callers supply 0 until board editor is built)
 */
export function countContentUnits(content: unknown, fileType: string): number {
  if (fileType === 'sheet') {
    if (isSheetContent(content)) return countSheetCells(content)
    return 0
  }
  return 0  // callers handle document word count themselves via countWordsFromContent
}
