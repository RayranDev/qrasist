'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select } from '@/components/ui/Select'

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
}: {
  careers: CareerOption[]
  subjects: SubjectOption[]
  initialCareerId: string
  selectedSubjectId: string
}) {
  const router = useRouter()
  const [careerId, setCareerId] = useState(initialCareerId)

  const subjectsOfCareer = useMemo(
    () => subjects.filter((s) => !careerId || s.careerIds.includes(careerId)),
    [subjects, careerId]
  )

  const handleSubjectChange = (subjectId: string) => {
    if (!subjectId) {
      router.push('/admin/attendance')
      return
    }
    const qs = new URLSearchParams({ subjectId })
    if (careerId) qs.set('careerId', careerId)
    router.push(`/admin/attendance?${qs.toString()}`)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Select
        label="Carrera"
        value={careerId}
        onChange={(e) => {
          setCareerId(e.target.value)
          if (selectedSubjectId) router.push('/admin/attendance')
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
        <option value="">Selecciona una materia</option>
        {subjectsOfCareer.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.code})
          </option>
        ))}
      </Select>
    </div>
  )
}
