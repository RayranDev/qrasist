'use client'

import { useState } from 'react'
import { addEnrollment, removeEnrollment } from '@/lib/actions/enrollments'
import { useToast } from '@/components/toast/ToastProvider'
import ConfirmModal from '@/components/ConfirmModal'

interface Student {
  id: string
  name: string
}

interface Enrollment {
  student: Student
}

export default function EnrollmentManager({
  subjectId,
  enrolledStudents,
  allStudents,
}: {
  subjectId: string
  enrolledStudents: Enrollment[]
  allStudents: Student[]
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null)
  const showToast = useToast()

  const enrolledIds = new Set(enrolledStudents.map((e) => e.student.id))
  const availableStudents = allStudents.filter((s) => !enrolledIds.has(s.id))

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
          <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm">
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
            <p className="text-gray-500 text-sm italic text-center p-4 bg-gray-50 rounded-xl">
              No hay estudiantes inscritos en esta materia.
            </p>
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
                  className="px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition disabled:opacity-50"
                >
                  {loadingId === student.id ? '...' : '+ Añadir'}
                </button>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm italic text-center p-4 bg-gray-50 rounded-xl">
              Todos los estudiantes ya están inscritos en esta materia.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
