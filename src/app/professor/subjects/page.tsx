import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SessionButton from './SessionButton'

export default async function ProfessorSubjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch subjects assigned to this professor
  const { data: subjects } = await supabase
    .from('subjects')
    .select('*')
    .eq('professor_id', user.id)

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Mis Materias</h1>
            <p className="text-gray-500 mt-1">Selecciona una clase para generar el código QR</p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition">
              Cerrar Sesión
            </button>
          </form>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {subjects?.map((sub) => (
            <div key={sub.id} className="bg-white p-6 border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition">
              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg mb-3 inline-block">
                {sub.code}
              </span>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">{sub.name}</h3>
              <SessionButton subjectId={sub.id} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
