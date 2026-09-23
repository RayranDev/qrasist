'use client'

import { useState } from 'react'
import { addEnrollment, removeEnrollment } from '@/lib/actions/enrollments'
import { useToast } from '@/components/toast/ToastProvider'
import ConfirmModal from '@/components/ConfirmModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Users, UserCheck } from 'lucide-react'

interface Student {
  id: string
  name: string
  careerIds: string[]
}

interface Enrollment {
  student: { id: string; name: string }
}

export default function EnrollmentManager({
  subjectId,
  enrolledStudents,
  allStudents,
  subjectCareerIds,
}: {
  subjectId: string
  enrolledStudents: Enrollment[]
  allStudents: Student[]
  subjectCareerIds: string[]
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null)
  const showToast = useToast()

  const enrolledIds = new Set(enrolledStudents.map((e) => e.student.id))
  // Se distinguen los dos motivos por los que puede no haber
  // disponibles: ninguno comparte carrera con la materia (nadie
  // elegible) vs. todos los elegibles ya están inscritos -- antes el
  // mensaje siempre decía "ya están inscritos" incluso cuando la
  // causa real era la falta de carrera en común.
  const eligibleStudents = allStudents.filter((s) =>
    s.careerIds.some((id) => subjectCareerIds.includes(id))
  )
  const availableStudents = eligibleStudents.filter((s) => !enrolledIds.has(s.id))
  const hasEligibleStudents = eligibleStudents.length > 0

  const handleAdd = async (studentId: string, studentName: string) => {
    setLoadingId(studentId)
    const res = await addEnrollment(subjectId, studentId)
    if (res.success) {
      showToast(`${studentName} inscrito correctamente.`, 'success')
    } else {
      showToast(res.error || 'No se pudo inscribir al estudiante.', 'error')
    }
    setLoadingId(null)
  }

  const handleRemove = async () => {
    if (!pendingRemove) return
    const { id: studentId, name: studentName } = pendingRemove
    setLoadingId(studentId)
    const res = await removeEnrollment(subjectId, studentId)
    if (res.success) {
      showToast(`${studentName} fue removido de la materia.`, 'success')
    } else {
      showToast(res.error || 'No se pudo quitar al estudiante.', 'error')
    }
    setLoadingId(null)
    setPendingRemove(null)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {pendingRemove && (
        <ConfirmModal
          title="Quitar estudiante"
          message={`¿Quitar a ${pendingRemove.name} de esta materia?`}
          confirmLabel="Quitar"
          loadingLabel="Quitando..."
          loading={loadingId === pendingRemove.id}
          onConfirm={handleRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
      {/* Estudiantes Inscritos */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-navy-50 text-navy-700 flex items-center justify-center text-sm">
            {enrolledStudents.length}
          </span>
          Estudiantes Inscritos
        </h3>

        <div className="space-y-3">
          {enrolledStudents.length > 0 ? (
            enrolledStudents.map((enrollment) => (
              <div
                key={enrollment.student.id}
                className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-xl border border-gray-100 transition"
              >
                <div className="font-bold text-gray-900 text-sm">{enrollment.student.name}</div>
                <button
                  disabled={loadingId === enrollment.student.id}
                  onClick={() =>
                    setPendingRemove({ id: enrollment.student.id, name: enrollment.student.name })
                  }
                  className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                >
                  {loadingId === enrollment.student.id ? '...' : 'Quitar'}
                </button>
              </div>
            ))
          ) : (
            <div className="p-4 bg-gray-50 rounded-xl">
              <EmptyState
                icon={<UserCheck className="w-5 h-5" />}
                title="No hay estudiantes inscritos en esta materia"
                description="Agregalos desde la lista de estudiantes disponibles."
              />
            </div>
          )}
        </div>
      </div>

      {/* Estudiantes Disponibles */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Estudiantes Disponibles</h3>

        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
          {availableStudents.length > 0 ? (
            availableStudents.map((student) => (
              <div
                key={student.id}
                className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-xl border border-gray-100 transition"
              >
                <div className="font-medium text-gray-600 text-sm">{student.name}</div>
                <button
                  disabled={loadingId === student.id}
                  onClick={() => handleAdd(student.id, student.name)}
                  className="px-3 py-1.5 text-xs font-bold text-navy-700 bg-navy-50 hover:bg-navy-100 rounded-lg transition disabled:opacity-50"
                >
                  {loadingId === student.id ? '...' : '+ Añadir'}
                </button>
              </div>
            ))
          ) : (
            <div className="p-4 bg-gray-50 rounded-xl">
              <EmptyState
                icon={<Users className="w-5 h-5" />}
                title={
                  hasEligibleStudents
                    ? 'Todos los estudiantes de esta carrera ya están inscritos'
                    : 'Ningún estudiante activo pertenece a la carrera de esta materia'
                }
                description={
                  hasEligibleStudents
                    ? undefined
                    : 'Asigná estudiantes a la carrera correspondiente antes de inscribirlos aquí.'
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
