import Link from 'next/link'
import { AlertTriangle, AlertOctagon } from 'lucide-react'
import type { StudentSubjectRisk } from '@/lib/attendance/studentSummaries'

/**
 * Banner compacto de alerta de inasistencias, pensado para reusarse en
 * /student/scanner y /student/subjects. Solo se le pasan materias que ya
 * están en WARNING o FAILED_ATTENDANCE (ver `filterAtRiskSubjects`).
 */
export default function RiskBanner({ risks }: { risks: StudentSubjectRisk[] }) {
  if (risks.length === 0) return null

  return (
    <div className="flex flex-col gap-2 mb-4">
      {risks.map((r) => {
        const failed = r.summary.status === 'FAILED_ATTENDANCE'
        return (
          <Link
            key={r.subjectId}
            href="/student/subjects"
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border text-xs font-semibold transition ${
              failed
                ? 'bg-red-50 border-red-200/80 text-red-700 hover:bg-red-100'
                : 'bg-amber-50 border-amber-200/80 text-amber-800 hover:bg-amber-100'
            }`}
          >
            {failed ? (
              <AlertOctagon className="w-4 h-4 shrink-0" strokeWidth={2} />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} />
            )}
            <span>
              {failed
                ? `Superaste el límite de faltas en ${r.subjectName}`
                : `Estás cerca del límite de faltas en ${r.subjectName}: te quedan ${r.summary.remainingAbsences}`}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
