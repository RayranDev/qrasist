'use client'

import { useState } from 'react'
import { login, signup } from './actions'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { validateStudentCode } from '@/lib/validations/studentCode'

interface Career {
  id: string
  name: string
  code: string
}

export default function AuthForm({
  error,
  info,
  careers,
}: {
  error?: string
  info?: string
  careers: Career[]
}) {
  const [isLogin, setIsLogin] = useState(true)
  const [studentCodeInput, setStudentCodeInput] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>(undefined)

  const handleStudentCodeChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 12)
    setStudentCodeInput(clean)

    if (clean.length > 0 && clean.length < 12) {
      setCodeError(`Faltan ${12 - clean.length} dígitos`)
    } else if (clean.length === 12) {
      const check = validateStudentCode(clean)
      setCodeError(check.isValid ? undefined : check.error)
    } else {
      setCodeError(undefined)
    }
  }

  return (
    <>
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200/80 text-red-700 rounded-xl text-xs font-semibold shadow-xs animate-in fade-in duration-200">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200/80 text-emerald-800 rounded-xl text-xs font-semibold shadow-xs animate-in fade-in duration-200">
          {info}
        </div>
      )}

      <form action={isLogin ? login : signup} className="space-y-4">
        {!isLogin && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                required
                name="first_name"
                type="text"
                label="Nombres"
                placeholder="Ej. Juan"
              />
              <Input
                required
                name="last_name"
                type="text"
                label="Apellidos"
                placeholder="Ej. Pérez"
              />
            </div>

            <div>
              <Input
                required
                name="student_code"
                type="text"
                inputMode="numeric"
                label="Código Estudiantil"
                value={studentCodeInput}
                onChange={(e) => handleStudentCodeChange(e.target.value)}
                placeholder="12 dígitos numéricos"
                error={codeError}
                helperText={
                  !codeError && studentCodeInput.length === 12
                    ? '✓ Código y dígito de control verificados'
                    : undefined
                }
              />
            </div>

            <div>
              <Select
                required
                name="career_id"
                label="Carrera"
                defaultValue=""
                helperText="Verás únicamente las materias correspondientes a tu pénsum."
              >
                <option value="" disabled>
                  Selecciona tu carrera
                </option>
                {careers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        <div className="animate-in fade-in duration-200">
          <Input
            required
            name="email"
            type="email"
            label="Correo Institucional"
            placeholder="usuario@urepublicana.edu.co"
            helperText="Debe pertenecer al dominio @urepublicana.edu.co"
          />
        </div>

        <div className="animate-in fade-in duration-200">
          <Input
            required
            name="password"
            type="password"
            label="Contraseña"
            minLength={6}
            placeholder="••••••••"
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full mt-2"
          disabled={!isLogin && !!codeError}
        >
          {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta Estudiantil'}
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-gray-100 text-center">
        <p className="text-gray-500 text-xs mb-2">
          {isLogin ? '¿Eres estudiante y no tienes cuenta?' : '¿Ya tienes una cuenta registrada?'}
        </p>
        <button
          type="button"
          onClick={() => {
            setIsLogin(!isLogin)
            setCodeError(undefined)
          }}
          className="text-xs text-emerald-600 font-bold hover:text-emerald-700 hover:underline transition"
        >
          {isLogin ? 'Regístrate aquí' : 'Inicia Sesión aquí'}
        </button>
      </div>
    </>
  )
}
