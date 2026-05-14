import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import type { MlaFields, ApaFields } from '@/lib/templates'

type FormatTarget = 'mla' | 'apa'

interface FormatModalProps {
  open: boolean
  format: FormatTarget | null
  initialMla?: Partial<MlaFields>
  initialApa?: Partial<ApaFields>
  onClose: () => void
  onApplyMla: (fields: MlaFields) => void
  onApplyApa: (fields: ApaFields) => void
}

const EMPTY_MLA: MlaFields = {
  studentName: '',
  instructorName: '',
  courseName: '',
  essayTitle: '',
}

const EMPTY_APA: ApaFields = {
  essayTitle: '',
  studentName: '',
  institution: '',
  courseAndNumber: '',
  instructorName: '',
}

export default function FormatModal({
  open,
  format,
  initialMla,
  initialApa,
  onClose,
  onApplyMla,
  onApplyApa,
}: FormatModalProps): JSX.Element {
  const [mla, setMla] = useState<MlaFields>(EMPTY_MLA)
  const [apa, setApa] = useState<ApaFields>(EMPTY_APA)

  useEffect(() => {
    if (!open) return
    if (format === 'mla') {
      setMla({ ...EMPTY_MLA, ...initialMla })
    } else if (format === 'apa') {
      setApa({ ...EMPTY_APA, ...initialApa })
    }
  }, [open, format, initialMla, initialApa])

  function handleApply(): void {
    if (format === 'mla') onApplyMla(mla)
    if (format === 'apa') onApplyApa(apa)
  }

  const title = format === 'mla' ? 'Apply MLA format' : 'Apply APA format'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {format === 'mla' && (
          <MlaForm fields={mla} onChange={setMla} onSubmit={handleApply} />
        )}
        {format === 'apa' && (
          <ApaForm fields={apa} onChange={setApa} onSubmit={handleApply} />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  onEnter?: () => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
    </div>
  )
}

function MlaForm({
  fields,
  onChange,
  onSubmit,
}: {
  fields: MlaFields
  onChange: (f: MlaFields) => void
  onSubmit: () => void
}): JSX.Element {
  const set =
    <K extends keyof MlaFields>(key: K) =>
    (value: string) =>
      onChange({ ...fields, [key]: value })

  return (
    <div className="flex flex-col gap-3 py-2">
      <p className="text-xs text-muted-foreground">
        These fields populate the MLA header. Leave blank to omit.
      </p>
      <Field label="Essay title" value={fields.essayTitle} onChange={set('essayTitle')} />
      <Separator />
      <Field label="Student name" value={fields.studentName} onChange={set('studentName')} />
      <Field
        label="Instructor name"
        value={fields.instructorName}
        onChange={set('instructorName')}
      />
      <Field label="Course name" value={fields.courseName} onChange={set('courseName')} />
      <p className="text-xs text-muted-foreground">
        Date auto-fills to today in DD Month YYYY format.
      </p>
      <p className="text-xs text-muted-foreground">
        Applying the template will <strong>replace</strong> your current header but preserve
        your body text.
      </p>
    </div>
  )
}

function ApaForm({
  fields,
  onChange,
  onSubmit: _onSubmit,
}: {
  fields: ApaFields
  onChange: (f: ApaFields) => void
  onSubmit: () => void
}): JSX.Element {
  const set =
    <K extends keyof ApaFields>(key: K) =>
    (value: string) =>
      onChange({ ...fields, [key]: value })

  return (
    <div className="flex flex-col gap-3 py-2">
      <p className="text-xs text-muted-foreground">
        These fields populate the APA title page. Leave blank to omit.
      </p>
      <Field label="Paper title" value={fields.essayTitle} onChange={set('essayTitle')} />
      <Separator />
      <Field label="Student name" value={fields.studentName} onChange={set('studentName')} />
      <Field label="Institution" value={fields.institution} onChange={set('institution')} />
      <Field
        label="Course name and number"
        value={fields.courseAndNumber}
        onChange={set('courseAndNumber')}
      />
      <Field
        label="Instructor name"
        value={fields.instructorName}
        onChange={set('instructorName')}
      />
      <p className="text-xs text-muted-foreground">
        Applying the template will replace your current header but preserve your body text.
      </p>
    </div>
  )
}
