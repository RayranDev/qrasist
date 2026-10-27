'use client'

import { GraduationCap } from 'lucide-react'
import { enrollStudentInSubjects, listSubjectsEnrollableByStudent } from '@/lib/actions/enrollments'
import { countOf } from '@/lib/utils/plural'
import SubjectPickerDialog from './SubjectPickerDialog'

/**
 * Optional step after a user becomes a student: pick the subjects they will be
 * enrolled in. Only active subjects that share an active career with the student
 * and where they are not enrolled yet are offered; the server re-validates every
 * one on submit with the same guards as the regular enrollment.
 */
export default function EnrollSubjectsDialog({
  studentId,
  studentName,
  onClose,
  onAssignCareers,
}: {
  studentId: string
  studentName: string
  onClose: () => void
  /** Opens the student's careers editor (shown when they have no careers yet). */
  onAssignCareers?: () => void
}) {
  return (
    <SubjectPickerDialog
      titleId="enroll-subjects-title"
      title="¿En qué materias se matriculará?"
      subtitle={`${studentName} ya es Estudiante. Puedes matricularle materias ahora o hacerlo después desde Materias.`}
      icon={<GraduationCap className="w-4 h-4" aria-hidden="true" />}
      noCareersMessage="Este estudiante todavía no tiene carreras asignadas, así que no se le pueden matricular materias. Asígnale una carrera con el botón de carreras (birrete) de su fila en Usuarios y luego matricúlalo desde Materias."
      emptyMessage={(searching) =>
        `No hay materias disponibles que coincidan con las carreras de este estudiante${searching ? ' y con tu búsqueda' : ''}.`
      }
      submitIdleLabel="Matricular en materias"
      submitLabel={(n) => `Matricular en ${countOf(n, 'materia')}`}
      successMessage={(n) => `${countOf(n, 'matrícula creada', 'matrículas creadas')}.`}
      partialMessage={(n) =>
        `${countOf(n, 'matrícula creada', 'matrículas creadas')}; revisa las que fallaron.`
      }
      loadSubjects={(term) => listSubjectsEnrollableByStudent(studentId, term)}
      submitSubjects={async (ids) => {
        const res = await enrollStudentInSubjects(studentId, ids)
        return {
          success: res.success,
          error: res.error,
          done: res.enrolled,
          failures: res.failures,
        }
      }}
      onClose={onClose}
      onAssignCareers={onAssignCareers}
    />
  )
}
