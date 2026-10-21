import type {
  ReportAttendanceInput,
  ReportEnrollmentInput,
  ReportJustificationInput,
  ReportSessionInput,
  ReportSubjectInput,
} from '../attendanceReport'

export const cuts = [
  { id: 'c1', name: 'Corte 1', startDate: '2026-02-01', endDate: '2026-03-15', sequence: 1 },
  { id: 'c2', name: 'Corte 2', startDate: '2026-03-16', endDate: '2026-04-30', sequence: 2 },
]

export const subject: ReportSubjectInput = {
  id: 'sub-1',
  code: 'DER101',
  name: 'Introducción al Derecho',
  professorId: 'prof-1',
  professorName: 'Ángela Muñoz',
  careerNames: ['Derecho'],
  policy: { ruleType: 'PERCENTAGE', maxPercentage: 20, totalPlannedSessions: 10 },
  periodName: '2026-1',
  cuts,
}

export const sessions: ReportSessionInput[] = [
  ...[
    '2026-02-10',
    '2026-02-17',
    '2026-02-24',
    '2026-03-03',
    '2026-03-17',
    '2026-03-24',
    '2026-03-31',
    '2026-04-07',
  ].map((day, i): ReportSessionInput => ({
    id: `s${i}`,
    subjectId: 'sub-1',
    date: `${day}T17:00:00Z`,
    isActive: true,
    suspendedAt: null,
    modality: i % 2 === 0 ? 'PRESENCIAL' : 'VIRTUAL',
  })),
  {
    id: 'susp',
    subjectId: 'sub-1',
    date: '2026-04-14T17:00:00Z',
    isActive: false,
    suspendedAt: '2026-04-13T10:00:00Z',
    suspensionReason: 'Paro de transporte',
  },
  {
    id: 'makeup',
    subjectId: 'sub-1',
    date: '2026-04-21T17:00:00Z',
    isActive: true,
    suspendedAt: null,
    modality: 'VIRTUAL',
    isMakeup: true,
    makeupReason: 'Reposición del paro',
  },
]

// 45 estudiantes para forzar varias páginas (y encabezados repetidos).
export const enrollments: ReportEnrollmentInput[] = Array.from({ length: 45 }, (_, i) => ({
  subjectId: 'sub-1',
  studentId: `st-${i}`,
  studentCode: `2026${String(i).padStart(4, '0')}`,
  studentName: i === 0 ? 'Niño Peña Ñandú' : `Estudiante Número ${i}`,
}))

export const attendances: ReportAttendanceInput[] = enrollments.flatMap((e, i) =>
  sessions
    .filter((s) => s.id !== 'susp')
    // Cada estudiante falta a más clases a medida que avanza el índice.
    .filter((_, si) => si >= Math.floor(i / 6))
    .map((s, si): ReportAttendanceInput => ({
      sessionId: s.id,
      studentId: e.studentId,
      status: si === 1 ? 'LATE' : 'PRESENT',
      markedBy: i === 0 && si === 0 ? 'prof-1' : null,
      manualReason: i === 0 && si === 0 ? 'Falló el QR del aula ćžš 😀' : null,
    }))
)

export const justifications: ReportJustificationInput[] = [
  {
    sessionId: 's0',
    studentId: 'st-30',
    subjectId: 'sub-1',
    status: 'APPROVED',
    reason: 'Incapacidad médica por 3 días',
  },
]

export function pdfBytesToBuffer(bytes: Uint8Array) {
  return Buffer.from(bytes)
}

export async function extractPages(bytes: Uint8Array): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
    )
  }
  return pages
}
