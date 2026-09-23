export type JustificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface StudentJustification {
  id: string
  status: JustificationStatus
  reason: string
  reviewNote: string | null
  attachmentPath: string | null
}

export interface MissedSessionItem {
  sessionId: string
  subjectId: string
  subjectName: string
  subjectCode: string
  date: string
  withinWindow: boolean
  justification: StudentJustification | null
}
