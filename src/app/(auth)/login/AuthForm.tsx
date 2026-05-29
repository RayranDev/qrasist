'use client'

import { useState } from 'react'
import { login, signup } from './actions'

export default function AuthForm({ error }: { error?: string }) {
  const [isLogin, setIsLogin] = useState(true)

  const inputClass = "w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-gray-900 bg-gray-50 placeholder-gray-400 font-medium"

  return (
    <>
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-bold shadow-sm">
          {error}
        </div>
      )}

      <form action={isLogin ? login : signup} className="space-y-5">
        {!isLogin && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider ml-1">Nombre Completo</label>
              <input required name="name" type="text" className={inputClass} placeholder="Ej. Juan Pérez" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider ml-1">Código Estudiantil</label>
              <input
                required
                name="student_code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{12}"
                minLength={12}
                maxLength={12}
                className={inputClass}
                placeholder="12 dígitos numéricos"
                title="El código debe tener exactamente 12 dígitos numéricos"
                onInput={e => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 12) }}
              />
            </div>
          </div>
        )}

        <div className="animate-in fade-in duration-300">
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider ml-1">Correo Electrónico</label>
          <input required name="email" type="email" className={inputClass} placeholder="usuario@urepublicana.edu.co" />
        </div>

        <div className="animate-in fade-in duration-300">
          <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider ml-1">Contraseña</label>
          <input required name="password" type="password" minLength={6} className={inputClass} placeholder="••••••••" />
        </div>

        <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md active:scale-[0.98] mt-2">
          {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta Estudiantil'}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-gray-100 text-center">
        <p className="text-gray-500 text-sm mb-2">{isLogin ? '¿Eres estudiante y no tienes cuenta?' : '¿Ya tienes una cuenta?'}</p>
        <button 
          type="button" 
          onClick={() => setIsLogin(!isLogin)} 
          className="text-sm text-emerald-600 font-bold hover:text-emerald-700 hover:underline transition"
        >
          {isLogin ? 'Regístrate aquí' : 'Inicia Sesión aquí'}
        </button>
      </div>
    </>
  )
}
