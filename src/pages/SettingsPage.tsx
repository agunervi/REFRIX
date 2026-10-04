import type { ReactNode } from 'react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import {
  Bell,
  Boxes,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Ruler,
  Settings2,
  Tags,
  UserRound,
  Users,
  Layers,
  type LucideIcon,
} from 'lucide-react'
import { useInventoryData } from '../contexts/InventoryDataContext'
import { cn } from '../utils/cn'
import { AccountSection } from './settings/AccountSection'
import { CategoriesSection, LocationsSection } from './settings/NamedSections'
import { CollaboratorsSection } from './settings/CollaboratorsSection'
import { InventoriesSection } from './settings/InventoriesSection'
import { NotificationsSection } from './settings/NotificationsSection'
import { PreferencesSection } from './settings/PreferencesSection'
import { SubcategoriesSection, UnitsSection } from './settings/SubcategoriesSection'

interface SectionDef {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  render: () => ReactNode
}

const SECTIONS: SectionDef[] = [
  { id: 'cuenta', label: 'Mi cuenta', hint: 'Nombre, contraseña y sesión', icon: UserRound, render: () => <AccountSection /> },
  { id: 'inventarios', label: 'Inventarios', hint: 'Editar, crear, transferir o eliminar', icon: Boxes, render: () => <InventoriesSection /> },
  { id: 'ubicaciones', label: 'Ubicaciones', hint: 'Dónde guardas las cosas', icon: MapPin, render: () => <LocationsSection /> },
  { id: 'categorias', label: 'Categorías', hint: 'Cómo agrupas los productos', icon: Tags, render: () => <CategoriesSection /> },
  { id: 'subcategorias', label: 'Subcategorías', hint: 'Divisiones dentro de una categoría', icon: Layers, render: () => <SubcategoriesSection /> },
  { id: 'unidades', label: 'Unidades', hint: 'Unidades de medida propias', icon: Ruler, render: () => <UnitsSection /> },
  { id: 'notificaciones', label: 'Notificaciones', hint: 'Avisos y correos de este inventario', icon: Bell, render: () => <NotificationsSection /> },
  { id: 'colaboradores', label: 'Colaboradores', hint: 'Invitar y administrar accesos', icon: Users, render: () => <CollaboratorsSection /> },
  { id: 'preferencias', label: 'Preferencias', hint: 'Tema, avisos del navegador, CSV', icon: Settings2, render: () => <PreferencesSection /> },
]

export default function SettingsPage() {
  const { section } = useParams()
  const data = useInventoryData()

  if (section && !SECTIONS.some((s) => s.id === section)) return <Navigate to="/configuracion" replace />
  const active = SECTIONS.find((s) => s.id === section)
  const shown = active ?? SECTIONS[0]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        {active && (
          <NavLink
            to="/configuracion"
            aria-label="Volver a Configuración"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100 dark:text-neutral-300 dark:hover:bg-neutral-800 lg:hidden"
          >
            <ChevronLeft className="h-6 w-6" />
          </NavLink>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-neutral-50">
          <span className={cn(active && 'hidden lg:inline')}>Configuración</span>
          {active && <span className="lg:hidden">{active.label}</span>}
        </h1>
      </div>

      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-8">
        <nav aria-label="Secciones de configuración" className={cn(active ? 'hidden lg:block' : 'block')}>
          <ul className="space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <NavLink
                  to={`/configuracion/${s.id}`}
                  className={() =>
                    cn(
                      'flex min-h-14 items-center gap-3 rounded-xl px-3.5 py-2 transition',
                      s.id === shown.id
                        ? 'lg:bg-emerald-50 lg:text-emerald-900 dark:lg:bg-emerald-500/15 dark:lg:text-emerald-100'
                        : 'hover:bg-stone-100 dark:hover:bg-neutral-900',
                      'bg-white shadow-sm lg:bg-transparent lg:shadow-none dark:bg-neutral-900 dark:lg:bg-transparent',
                    )
                  }
                >
                  <s.icon className="h-5 w-5 shrink-0 text-stone-500 dark:text-neutral-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium text-stone-900 dark:text-neutral-100">{s.label}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-neutral-400 lg:hidden">{s.hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-stone-400 lg:hidden" aria-hidden />
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="mt-4 hidden px-1 text-xs text-stone-500 dark:text-neutral-400 lg:block">
            Inventario actual: <strong>{data.inventory.name}</strong>
          </p>
        </nav>

        <div className={cn('min-w-0', !active && 'hidden lg:block')}>
          <div className="mb-4 hidden lg:block">
            <h2 className="text-xl font-semibold text-stone-900 dark:text-neutral-100">{shown.label}</h2>
            <p className="text-sm text-stone-500 dark:text-neutral-400">{shown.hint}</p>
          </div>
          {shown.render()}
        </div>
      </div>
    </div>
  )
}
