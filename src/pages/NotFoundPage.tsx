import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-bold text-stone-300 dark:text-neutral-700">404</p>
      <h1 className="text-xl font-semibold text-stone-900 dark:text-neutral-100">No encontramos esa página</h1>
      <Link to="/">
        <Button>Volver al inicio</Button>
      </Link>
    </div>
  )
}
