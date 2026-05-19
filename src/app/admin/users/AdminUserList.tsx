'use client'

import { useState } from 'react'
import RoleSelect from './RoleSelect'
import { CreateUserForm, ActionButtons } from './UserComponents'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export default function AdminUserList({ initialUsers, currentUser }: { initialUsers: any[], currentUser: any }) {
  const [filter, setFilter] = useState<'ALL' | 'ADMIN' | 'PROFESSOR' | 'STUDENT'>('ALL')

  const filteredUsers = initialUsers.filter(user => filter === 'ALL' || user.role === filter)

  return (
    <>
      <CreateUserForm />

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setFilter('ALL')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${filter === 'ALL' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>Todos</button>
        <button onClick={() => setFilter('ADMIN')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${filter === 'ADMIN' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-purple-50'}`}>Administradores</button>
        <button onClick={() => setFilter('PROFESSOR')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${filter === 'PROFESSOR' ? 'bg-amber-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-amber-50'}`}>Docentes</button>
        <button onClick={() => setFilter('STUDENT')} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${filter === 'STUDENT' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-blue-50'}`}>Estudiantes</button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-left min-w-[700px]">
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
            {filteredUsers.length > 0 ? (
              filteredUsers.map((profile: any) => (
                <tr key={profile.id} className="hover:bg-gray-50/50 transition">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{profile.name}</div>
                    <div className="text-xs text-gray-500 font-medium">{profile.email}</div>
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
                    <RoleSelect userId={profile.id} currentRole={profile.role} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end items-center gap-4">
                      {currentUser.id !== profile.id && <ActionButtons userId={profile.id} currentName={profile.name} />}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">No hay usuarios con este rol.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
