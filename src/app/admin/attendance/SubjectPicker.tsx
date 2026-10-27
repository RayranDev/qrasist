'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select } from '@/components/ui/Select'
import { attendanceHref } from '@/lib/attendance/attendanceHref'

interface CareerOption {
  id: string
  name: string
}

interface SubjectOption {
  id: string
  name: string
  code: string
  careerIds: string[]
}

/**
 * Primer paso de /admin/attendance: elegir carrera y materia. Al elegir
 * la materia se navega con ?subjectId=...; la página (servidor) carga las
 * sesiones paginadas, así que acá solo viajan los dos catálogos livianos.
 */
export default function SubjectPicker({
  careers,
  subjects,
  initialCareerId,
  selectedSubjectId,
  view = 'list',
  month,
}: {
  careers: CareerOption[]
  subjects: SubjectOption[]
  initialCareerId: string
  selectedSubjectId: string
  /** En calendario los filtros son opcionales y se conserva el mes visible. */
  view?: 'list' | 'calendar'
  month?: string
}) {
  const router = useRouter()
  const [careerId, setCareerId] = useState(initialCareerId)

  const subjectsOfCareer = useMemo(
    () => subjects.filter((s) => !careerId || s.careerIds.includes(careerId)),
    [subjects, careerId]
  )

  const handleSubjectChange = (subjectId: string) => {
    if (!subjectId && view === 'list') {
      router.push('/admin/attendance')
      return
    }
    router.push(attendanceHref({ view, month, careerId, subjectId }))
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Select
        label="Carrera"
        value={careerId}
        onChange={(e) => {
          setCareerId(e.target.value)
          if (view === 'calendar') {
            router.push(attendanceHref({ view, month, careerId: e.target.value }))
          } else if (selectedSubjectId) {
            router.push('/admin/attendance')
          }
        }}
      >
        <option value="">Todas las carreras</option>
        {careers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <Select
        label="Materia"
        value={subjectsOfCareer.some((s) => s.id === selectedSubjectId) ? selectedSubjectId : ''}
        onChange={(e) => handleSubjectChange(e.target.value)}
      >
        <option value="">
          {view === 'calendar' ? 'Todas las materias' : 'Selecciona una materia'}
        </option>
        {subjectsOfCareer.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.code})
          </option>
        ))}
      </Select>
    </div>
  )
}
