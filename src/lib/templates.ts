import type { JSONContent } from '@tiptap/core'

export interface MlaFields {
  studentName: string
  instructorName: string
  courseName: string
  essayTitle: string
}

export interface ApaFields {
  essayTitle: string
  studentName: string
  institution: string
  courseAndNumber: string
  instructorName: string
}

function para(text: string, role: string, align?: string): JSONContent {
  return {
    type: 'paragraph',
    attrs: { role, ...(align ? { textAlign: align } : {}) },
    content: text ? [{ type: 'text', text }] : [],
  }
}

function paraBold(text: string, role: string, align?: string): JSONContent {
  return {
    type: 'paragraph',
    attrs: { role, ...(align ? { textAlign: align } : {}) },
    content: text ? [{ type: 'text', text, marks: [{ type: 'bold' }] }] : [],
  }
}

function emptyPara(): JSONContent {
  return { type: 'paragraph' }
}

function todayMla(): string {
  const d = new Date()
  const day = d.getDate()
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  const year = d.getFullYear()
  return `${day} ${month} ${year}`
}

export function buildMlaContent(fields: MlaFields, body: JSONContent[]): JSONContent {
  return {
    type: 'doc',
    content: [
      para(fields.studentName, 'mla-header'),
      para(fields.instructorName, 'mla-header'),
      para(fields.courseName, 'mla-header'),
      para(todayMla(), 'mla-header'),
      para(fields.essayTitle, 'title', 'center'),
      emptyPara(),
      ...(body.length ? body : [emptyPara()]),
    ],
  }
}

export function buildApaContent(fields: ApaFields, body: JSONContent[]): JSONContent {
  return {
    type: 'doc',
    content: [
      paraBold(fields.essayTitle, 'apa-header', 'center'),
      para(fields.studentName, 'apa-header', 'center'),
      para(fields.institution, 'apa-header', 'center'),
      para(fields.courseAndNumber, 'apa-header', 'center'),
      para(fields.instructorName, 'apa-header', 'center'),
      para(todayMla(), 'apa-header', 'center'),
      emptyPara(),
      paraBold('Abstract', 'abstract-heading'),
      para(
        '[Write a 150–250 word summary of your paper here.]',
        'abstract-body'
      ),
      emptyPara(),
      ...(body.length ? body : [emptyPara()]),
    ],
  }
}

const HEADER_ROLES = new Set(['mla-header', 'apa-header', 'abstract-heading', 'abstract-body', 'title'])

export function extractBodyNodes(content: JSONContent): JSONContent[] {
  return (content.content ?? []).filter(
    (node) => !HEADER_ROLES.has(node.attrs?.role as string)
  )
}

export function extractMlaFields(content: JSONContent): Partial<MlaFields> {
  const nodes = content.content ?? []
  const headers = nodes.filter((n) => n.attrs?.role === 'mla-header')
  const title = nodes.find((n) => n.attrs?.role === 'title')
  return {
    studentName: (headers[0]?.content?.[0] as JSONContent | undefined)?.text ?? '',
    instructorName: (headers[1]?.content?.[0] as JSONContent | undefined)?.text ?? '',
    courseName: (headers[2]?.content?.[0] as JSONContent | undefined)?.text ?? '',
    essayTitle: (title?.content?.[0] as JSONContent | undefined)?.text ?? '',
  }
}

export function extractApaFields(content: JSONContent): Partial<ApaFields> {
  const nodes = content.content ?? []
  const headers = nodes.filter((n) => n.attrs?.role === 'apa-header')
  return {
    essayTitle: (headers[0]?.content?.[0] as JSONContent | undefined)?.text ?? '',
    studentName: (headers[1]?.content?.[0] as JSONContent | undefined)?.text ?? '',
    institution: (headers[2]?.content?.[0] as JSONContent | undefined)?.text ?? '',
    courseAndNumber: (headers[3]?.content?.[0] as JSONContent | undefined)?.text ?? '',
    instructorName: (headers[4]?.content?.[0] as JSONContent | undefined)?.text ?? '',
  }
}

export function mlaRunningLastName(content: JSONContent): string {
  const nodes = content.content ?? []
  const studentNode = nodes.find((n) => n.attrs?.role === 'mla-header')
  const name = (studentNode?.content?.[0] as JSONContent | undefined)?.text ?? ''
  if (!name.trim()) return ''
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1] ?? ''
}

export function apaShortTitle(content: JSONContent): string {
  const nodes = content.content ?? []
  const titleNode = nodes.find((n) => n.attrs?.role === 'apa-header')
  const title = (titleNode?.content?.[0] as JSONContent | undefined)?.text ?? ''
  return title ? title.toUpperCase().slice(0, 50) : 'RUNNING HEAD'
}
