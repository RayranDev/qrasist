'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import RoleSelect from './RoleSelect'
import {
  CreateUserForm,
  ActionButtons,
  StudentHistoryModal,
  StudentCareersModal,
  ProfessorCareersModal,
} from './UserComponents'
import { ClipboardList, GraduationCap } from 'lucide-react'

type FilterRole = 'ALL' | 'ADMIN' | 'PROFESSOR' | 'STUDENT'
type FilterStatus = 'active' | 'inactive'

interface Profile {
  id: string
  name: string
  first_name: string
  last_name: string
  email: string | null
  role: 'ADMIN' | 'PROFESSOR' | 'STUDENT'
  student_code: string | null
  is_active: boolean | null
}

interface Career {
  id: string
  name: string
  code: string
}

interface StudentCareerLink {
  student_id: string
  career_id: string
}

interface ProfessorCareerLink {
  professor_id: string
  career_id: string
}

function buildHref(role: FilterRole, status: FilterStatus, page: number, career?: string) {
  const params = new URLSearchParams()
  if (role !== 'ALL') params.set('role', role)
  if (status !== 'active') params.set('status', status)
  if (page > 1) params.set('page', String(page))
  if (career) params.set('career', career)
  const qs = params.toString()
  return qs ? `?${qs}` : '?'
}

export default function AdminUserList({
  users,
  currentUser,
  roleFilter,
  statusFilter,
  inactiveCount,
  currentPage,
  totalPages,
  totalCount,
  careers,
  studentCareers,
  professorCareers,
  careerFilter,
  careerFilterName,
}: {
  users: Profile[]
  currentUser: User
  roleFilter: FilterRole
  statusFilter: FilterStatus
  inactiveCount: number
  currentPage: number
  totalPages: number
  totalCount: number
  careers: Career[]
  studentCareers: StudentCareerLink[]
  professorCareers: ProfessorCareerLink[]
  careerFilter?: string
  careerFilterName?: string
}) {
  const [historyUser, setHistoryUser] = useState<{ id: string; name: string } | null>(null)
  const [careersUser, setCareersUser] = useState<{ id: string; name: string } | null>(null)
  const [careersProf, setCareersProf] = useState<{ id: string; name: string } | null>(null)

  return (
    <>
      <CreateUserForm />

      {historyUser && (
        <StudentHistoryModal
          userId={historyUser.id}
          studentName={historyUser.name}
          onClose={() => setHistoryUser(null)}
        />
      )}

      {careersUser && (
        <StudentCareersModal
          studentId={careersUser.id}
          studentName={careersUser.name}
          careers={careers}
          initialCareerIds={studentCareers
            .filter((sc) => sc.student_id === careersUser.id)
            .map((sc) => sc.career_id)}
          onClose={() => setCareersUser(null)}
        />
      )}

      {careersProf && (
        <ProfessorCareersModal
          professorId={careersProf.id}
          professorName={careersProf.name}
          careers={careers}
          initialCareerIds={professorCareers
            .filter((pc) => pc.professor_id === careersProf.id)
            .map((pc) => pc.career_id)}
          onClose={() => setCareersProf(null)}
        />
      )}

      {/* Filtros de rol */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(['ALL', 'ADMIN', 'PROFESSOR', 'STUDENT'] as FilterRole[]).map((r) => {
          const labels: Record<FilterRole, string> = {
            ALL: 'Todos',
            ADMIN: 'Administradores',
            PROFESSOR: 'Docentes',
            STUDENT: 'Estudiantes',
          }
          const active: Record<FilterRole, string> = {
            ALL: 'bg-emerald-600 text-white shadow-md',
            ADMIN: 'bg-purple-600 text-white shadow-md',
            PROFESSOR: 'bg-amber-600 text-white shadow-md',
            STUDENT: 'bg-emerald-600 text-white shadow-md',
          }
          const hover: Record<FilterRole, string> = {
            ALL: 'hover:bg-gray-50',
            ADMIN: 'hover:bg-purple-50',
            PROFESSOR: 'hover:bg-amber-50',
            STUDENT: 'hover:bg-emerald-50',
          }
          return (
            <Link
              key={r}
              href={buildHref(r, statusFilter, 1, careerFilter)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition ${roleFilter === r ? active[r] : `bg-white text-gray-600 border border-gray-200 ${hover[r]}`}`}
            >
              {labels[r]}
            </Link>
          )
        })}
      </div>

      {careerFilter && careerFilterName && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-2">
            Carrera: {careerFilterName}
            <Link
              href={buildHref(roleFilter, statusFilter, 1)}
              className="text-indigo-400 hover:text-indigo-700"
              title="Quitar filtro de carrera"
            >
              ×
            </Link>
          </span>
        </div>
      )}

      {/* Toggle activos / inactivos */}
      <div className="flex gap-2 mb-6">
        <Link
          href={buildHref(roleFilter, 'active', 1, careerFilter)}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${statusFilter === 'active' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}
        >
          Activos
        </Link>
        <Link
          href={buildHref(roleFilter, 'inactive', 1, careerFilter)}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${statusFilter === 'inactive' ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-amber-50'}`}
        >
          Inactivos
          {inactiveCount > 0 && (
            <span
              className={`text-xs rounded-full px-1.5 py-0.5 font-black ${statusFilter === 'inactive' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}
            >
              {inactiveCount}
            </span>
          )}
        </Link>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-left min-w-160">
          <thead className="bg-gray-50/80 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                Usuario
              </th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                Código / ID
              </th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                Rol Actual
              </th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.length > 0 ? (
              users.map((profile) => (
                <tr
                  key={profile.id}
                  className={`transition ${profile.is_active === false ? 'bg-gray-50/80 opacity-60' : 'hover:bg-gray-50/50'}`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-bold text-gray-900 flex items-center gap-2">
                          {profile.name}
                          {profile.is_active === false && (
                            <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                              Inactivo
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 font-medium">{profile.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs font-bold text-gray-600">
                    {profile.student_code || '---'}
                  </td>
                  <td className="px-6 py-4">
                    {profile.is_active !== false ? (
                      <RoleSelect userId={profile.id} currentRole={profile.role} />
                    ) : (
                      <span className="text-xs font-semibold text-gray-400">{profile.role}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end items-center gap-2">
                      {profile.role === 'STUDENT' && profile.is_active !== false && (
                        <>
                          <button
                            onClick={() => setHistoryUser({ id: profile.id, name: profile.name })}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Ver historial de asistencias"
                          >
                            <ClipboardList className="w-5 h-5" strokeWidth={2} />
                          </button>
                          <button
                            onClick={() => setCareersUser({ id: profile.id, name: profile.name })}
                            className="p-1.5 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"
                            title="Carreras del estudiante"
                          >
                            <GraduationCap className="w-5 h-5" strokeWidth={2} />
                          </button>
                        </>
                      )}
                      {profile.role === 'PROFESSOR' && profile.is_active !== false && (
                        <button
                          onClick={() => setCareersProf({ id: profile.id, name: profile.name })}
                          className="p-1.5 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"
                          title="Carreras del profesor"
                        >
                          <GraduationCap className="w-5 h-5" strokeWidth={2} />
                        </button>
                      )}
                      {currentUser.id !== profile.id && (
                        <ActionButtons
                          userId={profile.id}
                          currentFirstName={profile.first_name}
                          currentLastName={profile.last_name}
                          currentCode={profile.student_code ?? undefined}
                          currentRole={profile.role}
                          isActive={profile.is_active !== false}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500 italic">
                  {statusFilter === 'inactive'
                    ? 'No hay usuarios inactivos.'
                    : 'No hay usuarios con este rol.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-xs text-gray-500 font-medium">
            Página {currentPage} de {totalPages} · {totalCount} usuario
            {totalCount !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <Link
              href={buildHref(roleFilter, statusFilter, currentPage - 1, careerFilter)}
              aria-disabled={currentPage <= 1}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                currentPage <= 1
                  ? 'pointer-events-none opacity-40 border-gray-200 text-gray-400'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              ← Anterior
            </Link>
            <Link
              href={buildHref(roleFilter, statusFilter, currentPage + 1, careerFilter)}
              aria-disabled={currentPage >= totalPages}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                currentPage >= totalPages
                  ? 'pointer-events-none opacity-40 border-gray-200 text-gray-400'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Siguiente →
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
