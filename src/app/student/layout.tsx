import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LogOut } from 'lucide-react'
import StudentTabBar from '@/components/student/StudentTabBar'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, student_code')
    .eq('id', user.id)
    .single()

  const firstName = profile?.first_name || 'Estudiante'
  const initial = firstName.charAt(0).toUpperCase()

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="sticky top-0 inset-x-0 bg-surface/90 backdrop-blur-sm z-30">
        <div className="max-w-md mx-auto px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-sm shrink-0">
              {initial}
            </div>
            <div>
              <p className="text-sm font-black text-gray-900 leading-tight">{firstName}</p>
              {profile?.student_code && (
                <p className="text-[11px] text-gray-400 font-mono leading-tight">
                  {profile.student_code}
                </p>
              )}
            </div>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              title="Cerrar sesión"
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
            >
              <LogOut className="w-4.5 h-4.5" strokeWidth={2} />
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-5 pb-6">{children}</main>

      <StudentTabBar />
    </div>
  )
}
