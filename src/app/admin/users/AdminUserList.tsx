'use client'

import { useState } from 'react'
import RoleSelect from './RoleSelect'
import { CreateUserForm, ActionButtons } from './UserComponents'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

type FilterRole = 'ALL' | 'ADMIN' | 'PROFESSOR' | 'STUDENT'
type FilterStatus = 'active' | 'inactive'

export default function AdminUserList({ initialUsers, currentUser }: { initialUsers: any[], currentUser: any }) {
  const [roleFilter, setRoleFilter] = useState<FilterRole>('ALL')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('active')

  const filtered = initialUsers.filter(u => {
    const roleMatch = roleFilter === 'ALL' || u.role === roleFilter
    const statusMatch = statusFilter === 'active' ? u.is_active !== false : u.is_active === false
    return roleMatch && statusMatch
  })

  const inactiveCount = initialUsers.filter(u => u.is_active === false).length

  return (
    <>
      <CreateUserForm />

      {/* Filtros de rol */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(['ALL', 'ADMIN', 'PROFESSOR', 'STUDENT'] as FilterRole[]).map(r => {
          const labels: Record<FilterRole, string> = { ALL: 'Todos', ADMIN: 'Administradores', PROFESSOR: 'Docentes', STUDENT: 'Estudiantes' }
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
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition ${roleFilter === r ? active[r] : `bg-white text-gray-600 border border-gray-200 ${hover[r]}`}`}
            >
              {labels[r]}
            </button>
          )
        })}
      </div>

      {/* Toggle activos / inactivos */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setStatusFilter('active')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${statusFilter === 'active' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}
        >
          Activos
        </button>
        <button
          onClick={() => setStatusFilter('inactive')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${statusFilter === 'inactive' ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-amber-50'}`}
        >
          Inactivos
          {inactiveCount > 0 && (
            <span className={`text-xs rounded-full px-1.5 py-0.5 font-black ${statusFilter === 'inactive' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>
              {inactiveCount}
            </span>
          )}
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-left min-w-175">
          <thead className="bg-gray-50/80 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Código (ID)</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Último Ingreso</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Rol Actual</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length > 0 ? (
              filtered.map((profile: any) => (
                <tr key={profile.id} className={`transition ${profile.is_active === false ? 'bg-gray-50/80 opacity-60' : 'hover:bg-gray-50/50'}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-bold text-gray-900 flex items-center gap-2">
                          {profile.name}
                          {profile.is_active === false && (
                            <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Inactivo</span>
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
                    {profile.last_sign_in_at ? (
                      <span className="text-sm text-gray-600 font-medium">
                        Hace {formatDistanceToNow(new Date(profile.last_sign_in_at), { locale: es })}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400 italic">Nunca</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {profile.is_active !== false ? (
                      <RoleSelect userId={profile.id} currentRole={profile.role} />
                    ) : (
                      <span className="text-xs font-semibold text-gray-400">{profile.role}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end items-center gap-4">
                      {currentUser.id !== profile.id && (
                        <ActionButtons
                          userId={profile.id}
                          currentName={profile.name}
                          currentCode={profile.student_code}
                          isActive={profile.is_active !== false}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">
                  {statusFilter === 'inactive' ? 'No hay usuarios inactivos.' : 'No hay usuarios con este rol.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
