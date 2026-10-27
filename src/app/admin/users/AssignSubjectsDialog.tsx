'use client'

import { Presentation } from 'lucide-react'
import {
  assignSubjectsToProfessor,
  listSubjectsAssignableToProfessor,
} from '@/lib/actions/adminSubjects'
import { countOf } from '@/lib/utils/plural'
import SubjectPickerDialog from './SubjectPickerDialog'

/**
 * Optional step after a user becomes a professor: pick the subjects they will teach.
 * Only subjects without a professor that match the professor's careers are offered;
 * the server re-validates every one on submit.
 */
export default function AssignSubjectsDialog({
  professorId,
  professorName,
  onClose,
  onAssignCareers,
}: {
  professorId: string
  professorName: string
  onClose: () => void
  /** Opens the professor's careers editor (shown when they have no careers yet). */
  onAssignCareers?: () => void
}) {
  return (
    <SubjectPickerDialog
      titleId="assign-subjects-title"
      title="¿Qué materias dictará?"
      subtitle={`${professorName} ya es Docente. Puedes asignarle materias ahora o hacerlo después desde Materias.`}
      icon={<Presentation className="w-4 h-4" aria-hidden="true" />}
      noCareersMessage="Este docente todavía no tiene carreras asignadas, así que no se le pueden asignar materias. Asígnale una carrera con el botón de carreras (birrete) de su fila en Usuarios y luego asigna sus materias desde Materias."
      emptyMessage={(searching) =>
        `No hay materias sin docente que coincidan con las carreras de este docente${searching ? ' y con tu búsqueda' : ''}.`
      }
      submitIdleLabel="Asignar materias"
      submitLabel={(n) => `Asignar ${countOf(n, 'materia')}`}
      successMessage={(n) => `${countOf(n, 'materia asignada', 'materias asignadas')}.`}
      partialMessage={(n) =>
        `${countOf(n, 'materia asignada', 'materias asignadas')}; revisa las que fallaron.`
      }
      loadSubjects={(term) => listSubjectsAssignableToProfessor(professorId, term)}
      submitSubjects={async (ids) => {
        const res = await assignSubjectsToProfessor(professorId, ids)
        return {
          success: res.success,
          error: res.error,
          done: res.assigned,
          failures: res.failures,
        }
      }}
      onClose={onClose}
      onAssignCareers={onAssignCareers}
    />
  )
}
