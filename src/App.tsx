import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import { FullScreenSpinner } from './components/ui/Misc'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { InventoryProvider, useInventories } from './contexts/InventoryContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { NEXT_PATH_KEY } from './lib/constants'
import { isSupabaseConfigured } from './lib/supabase'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import SetupScreen from './pages/SetupScreen'

const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const ShoppingPage = lazy(() => import('./pages/ShoppingPage'))
const AlertsPage = lazy(() => import('./pages/AlertsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const InvitePage = lazy(() => import('./pages/InvitePage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

/** Al cambiar de pantalla se vuelve arriba (el navegador no lo hace en una SPA). */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function RequireAuth() {
  const { session, loading, recoveryMode } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenSpinner />
  if (recoveryMode) return <Navigate to="/restablecer" replace />
  if (!session) {
    const next = location.pathname + location.search
    if (next !== '/') {
      try {
        sessionStorage.setItem(NEXT_PATH_KEY, next)
      } catch {
        /* almacenamiento no disponible */
      }
    }
    return <Navigate to="/ingresar" replace />
  }
  return (
    <InventoryProvider>
      <Outlet />
    </InventoryProvider>
  )
}

/** /i/:inventoryId/:section  ->  selecciona el inventario y abre la sección (enlaces de los correos). */
function InventoryRedirect() {
  const { inventoryId, section } = useParams()
  const { inventories, select, loading } = useInventories()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const search = params.get('p') ? `?p=${encodeURIComponent(params.get('p') ?? '')}` : ''

  useEffect(() => {
    if (loading) return
    if (inventoryId && inventories.some((i) => i.id === inventoryId)) select(inventoryId)
    const target = section === 'alertas' || section === 'compras' || section === 'inventario' ? `/${section}` : '/inventario'
    navigate(`${target}${target === '/inventario' ? search : ''}`, { replace: true })
  }, [loading, inventoryId, section, inventories, select, navigate, search])

  return <FullScreenSpinner />
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupScreen />

  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <BrowserRouter>
              <ScrollToTop />
              <Suspense fallback={<FullScreenSpinner />}>
                <Routes>
                  <Route path="/ingresar" element={<LoginPage />} />
                  <Route path="/restablecer" element={<ResetPasswordPage />} />
                  <Route element={<RequireAuth />}>
                    <Route path="/invitacion/:token" element={<InvitePage />} />
                    <Route element={<AppShell />}>
                      <Route index element={<DashboardPage />} />
                      <Route path="inventario" element={<InventoryPage />} />
                      <Route path="compras" element={<ShoppingPage />} />
                      <Route path="alertas" element={<AlertsPage />} />
                      <Route path="configuracion" element={<SettingsPage />} />
                      <Route path="configuracion/:section" element={<SettingsPage />} />
                      <Route path="i/:inventoryId" element={<InventoryRedirect />} />
                      <Route path="i/:inventoryId/:section" element={<InventoryRedirect />} />
                    </Route>
                  </Route>
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
