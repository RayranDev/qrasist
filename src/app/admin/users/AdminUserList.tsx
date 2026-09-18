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
import UserSearchBar from './UserSearchBar'
import FilterPanel, { FilterField } from '@/components/FilterPanel'

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

function buildHref(
  role: FilterRole,
  status: FilterStatus,
  page: number,
  career?: string,
  q?: string
) {
  const params = new URLSearchParams()
  if (role !== 'ALL') params.set('role', role)
  if (status !== 'active') params.set('status', status)
  if (page > 1) params.set('page', String(page))
  if (career) params.set('career', career)
  if (q) params.set('q', q)
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
  searchQuery,
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
  searchQuery: string
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

      <FilterPanel>
        <UserSearchBar
          careers={careers}
          initialQuery={searchQuery}
          careerFilter={careerFilter}
          roleFilter={roleFilter}
          statusFilter={statusFilter}
        />

        <FilterField label="Rol">
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'ADMIN', 'PROFESSOR', 'STUDENT'] as FilterRole[]).map((r) => {
              const labels: Record<FilterRole, string> = {
                ALL: 'Todos',
                ADMIN: 'Administradores',
                PROFESSOR: 'Docentes',
                STUDENT: 'Estudiantes',
              }
              const isActive = roleFilter === r
              return (
                <Link
                  key={r}
                  href={buildHref(r, statusFilter, 1, careerFilter, searchQuery)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-neutral-900 text-white shadow-2xs'
                      : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900'
                  }`}
                >
                  {labels[r]}
                </Link>
              )
            })}
          </div>
        </FilterField>

        <FilterField label="Estado">
          <div className="flex gap-2">
            <Link
              href={buildHref(roleFilter, 'active', 1, careerFilter, searchQuery)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'active'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              Activos
            </Link>
            <Link
              href={buildHref(roleFilter, 'inactive', 1, careerFilter, searchQuery)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                statusFilter === 'inactive'
                  ? 'bg-neutral-900 text-white shadow-2xs'
                  : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              Inactivos
              {inactiveCount > 0 && (
                <span
                  className={`text-[10px] rounded-md px-1.5 py-0.2 font-mono font-bold ${
                    statusFilter === 'inactive'
                      ? 'bg-white/20 text-white'
                      : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {inactiveCount}
                </span>
              )}
            </Link>
          </div>
        </FilterField>
      </FilterPanel>

      {careerFilter && careerFilterName && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-2">
            Carrera: {careerFilterName}
            <Link
              href={buildHref(roleFilter, statusFilter, 1, undefined, searchQuery)}
              className="text-indigo-400 hover:text-indigo-700"
              title="Quitar filtro de carrera"
            >
              ×
            </Link>
          </span>
        </div>
      )}

      {/* Vista Móvil: Tarjetas Táctiles (sin scroll horizontal) */}
      <div className="block md:hidden space-y-3">
        {users.length > 0 ? (
          users.map((profile) => (
            <div
              key={profile.id}
              className={`p-4 rounded-2xl border transition-all ${
                profile.is_active === false
                  ? 'bg-gray-50/80 border-gray-200 opacity-70'
                  : 'bg-white border-gray-200/80 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div>
                  <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    {profile.name}
                    {profile.is_active === false && (
                      <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-medium truncate max-w-[220px]">
                    {profile.email}
                  </div>
                </div>

                {profile.student_code && (
                  <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                    {profile.student_code}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-100 gap-2 flex-wrap">
                <div className="shrink-0">
                  {profile.is_active !== false ? (
                    <RoleSelect userId={profile.id} currentRole={profile.role} />
                  ) : (
                    <span className="text-xs font-semibold text-gray-400 px-2 py-1 bg-gray-100 rounded-lg">
                      {profile.role}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {profile.role === 'STUDENT' && profile.is_active !== false && (
                    <>
                      <button
                        onClick={() => setHistoryUser({ id: profile.id, name: profile.name })}
                        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"
                        title="Ver historial de asistencias"
                        aria-label="Ver historial"
                      >
                        <ClipboardList className="w-5 h-5" strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => setCareersUser({ id: profile.id, name: profile.name })}
                        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition"
                        title="Carreras del estudiante"
                        aria-label="Carreras"
                      >
                        <GraduationCap className="w-5 h-5" strokeWidth={2} />
                      </button>
                    </>
                  )}
                  {profile.role === 'PROFESSOR' && profile.is_active !== false && (
                    <button
                      onClick={() => setCareersProf({ id: profile.id, name: profile.name })}
                      className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition"
                      title="Carreras del profesor"
                      aria-label="Carreras"
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
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center bg-white rounded-2xl border border-gray-200 text-gray-500 text-sm">
            {statusFilter === 'inactive'
              ? 'No hay usuarios inactivos.'
              : 'No hay usuarios con este rol.'}
          </div>
        )}
      </div>

      {/* Vista Desktop: Tabla compacta */}
      <div className="hidden md:block bg-white rounded-2xl shadow-xs border border-gray-200/80 overflow-x-auto">
        <table className="w-full text-left">
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
                        <div className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                          {profile.name}
                          {profile.is_active === false && (
                            <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
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
              href={buildHref(roleFilter, statusFilter, currentPage - 1, careerFilter, searchQuery)}
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
              href={buildHref(roleFilter, statusFilter, currentPage + 1, careerFilter, searchQuery)}
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
