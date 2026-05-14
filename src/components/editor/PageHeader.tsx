import type { JSONContent } from '@tiptap/core'
import { mlaRunningLastName, apaShortTitle } from '@/lib/templates'

interface PageHeaderProps {
  format: string
  content: JSONContent | null
  fontFamily?: string
}

export default function PageHeader({ format, content, fontFamily }: PageHeaderProps): JSX.Element | null {
  if (!content) return null

  const font = fontFamily ?? 'Times New Roman, serif'

  if (format === 'mla') {
    const lastName = mlaRunningLastName(content)
    return (
      <div className="mb-4 flex justify-end text-sm" style={{ fontFamily: font }}>
        {lastName ? `${lastName} 1` : '1'}
      </div>
    )
  }

  if (format === 'apa') {
    const short = apaShortTitle(content)
    return (
      <div className="mb-4 flex justify-between text-sm" style={{ fontFamily: font }}>
        <span className="uppercase">{short}</span>
        <span>1</span>
      </div>
    )
  }

  return null
}
