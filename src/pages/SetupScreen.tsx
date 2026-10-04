import { Database } from 'lucide-react'

/** Se muestra cuando faltan las variables de entorno de Supabase. */
export default function SetupScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-50 px-6 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Database className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-stone-900">Falta conectar Supabase</h1>
        <p className="mt-2 text-sm text-stone-600">
          La aplicación necesita dos variables de entorno para conectarse a tu proyecto de Supabase. Defínelas en
          Netlify (Site configuration, Environment variables) o en un archivo <code className="rounded bg-stone-100 px-1">.env</code>{' '}
          si trabajas en local, y vuelve a desplegar:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-stone-900 p-4 text-xs leading-relaxed text-stone-100">
{`VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon-publica`}
        </pre>
        <p className="mt-4 text-xs text-stone-500">
          Las encuentras en Supabase, Project Settings, API. La guía completa está en el README del proyecto.
        </p>
      </div>
    </div>
  )
}
