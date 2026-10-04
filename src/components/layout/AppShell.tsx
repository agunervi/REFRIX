import { lazy, Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Bell, House, LogOut, Package, Settings, ShoppingCart, WifiOff, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { InventoryDataProvider, useInventoryData } from '../../contexts/InventoryDataContext'
import { useInventories } from '../../contexts/InventoryContext'
import { cn } from '../../utils/cn'
import { SyncIndicator } from '../sync/SyncIndicator'
import { FullScreenSpinner, Spinner } from '../ui/Misc'
import { Button } from '../ui/Button'
import { InventorySwitcher } from './InventorySwitcher'

const OnboardingPage = lazy(() => import('../../pages/OnboardingPage'))

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/inventario', label: 'Inventario', icon: Package },
  { to: '/compras', label: 'Compras', icon: ShoppingCart },
  { to: '/alertas', label: 'Alertas', icon: Bell },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
]

export function AppShell() {
  const { loading, error, inventories, selected, refresh } = useInventories()

  if (loading) return <FullScreenSpinner label="Cargando tus inventarios" />

  if (error && inventories.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <WifiOff className="h-10 w-10 text-stone-400" aria-hidden />
        <p className="max-w-sm text-stone-700 dark:text-neutral-300">{error}</p>
        <Button onClick={() => void refresh()}>Reintentar</Button>
      </div>
    )
  }

  // Primera vez (o sin ningún inventario): asistente de configuración
  if (!selected) {
    return (
      <Suspense fallback={<FullScreenSpinner />}>
        <OnboardingPage />
      </Suspense>
    )
  }

  return (
    // key: al cambiar de inventario se reinicia TODO el estado (nunca se mezclan datos)
    <InventoryDataProvider key={selected.id} inventory={selected}>
      <Layout />
    </InventoryDataProvider>
  )
}

function Layout() {
  const data = useInventoryData()
  const { signOut, profile, user } = useAuth()
  const openShopping = data.shopping.filter((i) => !i.is_bought).length

  const badge = (to: string): number => (to === '/alertas' ? data.unreadCount : to === '/compras' ? openShopping : 0)

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra lateral (escritorio y tablet horizontal) */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-stone-200 bg-white px-4 py-5 dark:border-neutral-800 dark:bg-neutral-950 lg:flex">
        <div className="mb-5 flex items-center gap-2.5 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Package className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-bold tracking-tight text-stone-900 dark:text-neutral-50">Inventario</span>
        </div>
        <InventorySwitcher className="w-full" />
        <div className="mt-2 px-1">
          <SyncIndicator
            inventoryId={data.inventory.id}
            lastChangeAt={data.inventory.last_inventory_change_at}
            state={data.sync}
            lastSyncAt={data.lastSyncAt}
            justReconnected={data.justReconnected}
            knownLastChange={data.lastChange}
          />
        </div>
        <nav className="mt-5 flex-1 space-y-1" aria-label="Principal">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-base font-medium transition',
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
                    : 'text-stone-600 hover:bg-stone-100 dark:text-neutral-400 dark:hover:bg-neutral-900',
                )
              }
            >
              <item.icon className="h-5 w-5" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {badge(item.to) > 0 && <CountBadge value={badge(item.to)} />}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-stone-200 p-3 dark:border-neutral-800">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-700 dark:bg-neutral-800 dark:text-neutral-200">
            {(profile?.display_name ?? user?.email ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-stone-900 dark:text-neutral-100">{profile?.display_name ?? 'Mi cuenta'}</p>
            <p className="truncate text-xs text-stone-500 dark:text-neutral-400">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Cerrar sesión"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera móvil */}
        <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-stone-50/90 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90 lg:hidden">
          <div className="flex items-center gap-2">
            <InventorySwitcher className="flex-1" />
            <NavLink
              to="/alertas"
              aria-label={`Alertas${data.unreadCount ? `, ${data.unreadCount} sin leer` : ''}`}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
            >
              <Bell className="h-5 w-5" aria-hidden />
              {data.unreadCount > 0 && (
                <span className="absolute -right-1 -top-1">
                  <CountBadge value={data.unreadCount} />
                </span>
              )}
            </NavLink>
          </div>
          <SyncIndicator
            inventoryId={data.inventory.id}
            lastChangeAt={data.inventory.last_inventory_change_at}
            state={data.sync}
            lastSyncAt={data.lastSyncAt}
            justReconnected={data.justReconnected}
            knownLastChange={data.lastChange}
            compact
            className="mt-1"
          />
        </header>

        {data.sync === 'offline' && (
          <div role="status" className="flex items-center gap-2 bg-red-50 px-4 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
            Sin conexión: tus cambios no se guardarán hasta que vuelva internet.
          </div>
        )}

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 lg:px-8 lg:pb-12 lg:pt-8">
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Navegación inferior (móvil y tablet vertical) */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95 lg:hidden"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition',
                    isActive ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-500 dark:text-neutral-400',
                  )
                }
              >
                <span className="relative">
                  <item.icon className="h-6 w-6" aria-hidden />
                  {badge(item.to) > 0 && (
                    <span className="absolute -right-2.5 -top-1.5">
                      <CountBadge value={badge(item.to)} />
                    </span>
                  )}
                </span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

function CountBadge({ value }: { value: number }) {
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white">
      {value > 99 ? '99+' : value}
    </span>
  )
}
