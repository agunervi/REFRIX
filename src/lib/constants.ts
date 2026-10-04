import type { MemberRole, Priority, Role } from '../types/database'

// Zona horaria usada por el backend para calcular vencimientos ("hoy")
export const APP_TIME_ZONE = 'America/Santiago'

export const EXPIRY_WARNING_DAYS = 7

export const COMMON_UNITS = [
  'unidades',
  'paquetes',
  'cajas',
  'bolsas',
  'botellas',
  'latas',
  'frascos',
  'kg',
  'g',
  'litros',
  'ml',
  'rollos',
  'porciones',
] as const

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Solo lectura',
}

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  admin: 'Administra colaboradores, ajustes y todo el contenido. No puede eliminar el inventario ni transferirlo.',
  editor: 'Modifica stock, productos, categorías, ubicaciones y la lista de compras.',
  viewer: 'Solo puede ver el inventario, la lista de compras y las alertas.',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'Alta',
  normal: 'Normal',
  low: 'Baja',
}

export const DELAY_OPTIONS = [
  { value: 5, label: '5 minutos' },
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 180, label: '3 horas' },
  { value: 720, label: '12 horas' },
  { value: 1440, label: '24 horas' },
]

export const COLOR_PALETTE = [
  '#10b981',
  '#22c55e',
  '#84cc16',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#3b82f6',
  '#0ea5e9',
  '#06b6d4',
  '#64748b',
] as const

export const DEFAULT_PREFS = {
  notifications_enabled: true,
  low_stock: true,
  out_of_stock: true,
  expiry: true,
  email_enabled: true,
  in_app_enabled: true,
  delay_minutes: 30,
} as const

export const SELECTED_INVENTORY_KEY = 'inv:selected'
export const THEME_KEY = 'inv:theme'
export const BROWSER_NOTIFY_KEY = 'inv:browser-notify'
export const NEXT_PATH_KEY = 'inv:next'
