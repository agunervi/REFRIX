// Tipos de las filas que devuelve Supabase (coinciden con supabase/migrations).

export type Role = 'owner' | 'admin' | 'editor' | 'viewer'
export type MemberRole = 'admin' | 'editor' | 'viewer'
export type StockStatus = 'ok' | 'low' | 'out'
export type ExpiryStatus = 'none' | 'ok' | 'soon' | 'expired'

export interface UserProfile {
  id: string
  email: string
  display_name: string
}

export interface InventoryOverview {
  id: string
  owner_id: string
  name: string
  description: string | null
  icon: string
  color: string
  structure_version: number
  created_at: string
  updated_at: string
  last_inventory_change_at: string
  owner_name: string | null
  my_role: Role
  product_count: number
  low_count: number
  out_count: number
  expiring_count: number
  expired_count: number
}

export interface Location {
  id: string
  inventory_id: string
  name: string
  icon: string
  color: string
  sort_order: number
  is_example: boolean
}

export interface Category {
  id: string
  inventory_id: string
  name: string
  icon: string
  color: string
  sort_order: number
  is_example: boolean
}

export interface Subcategory {
  id: string
  inventory_id: string
  category_id: string
  name: string
  sort_order: number
  is_example: boolean
}

export interface CustomUnit {
  id: string
  inventory_id: string
  name: string
}

export interface Product {
  id: string
  inventory_id: string
  name: string
  location_id: string | null
  category_id: string | null
  subcategory_id: string | null
  quantity: number
  unit: string
  min_stock: number
  brand: string | null
  expiry_date: string | null
  notes: string | null
  image_path: string | null
  is_example: boolean
  stock_status: StockStatus
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type ProductInput = Pick<
  Product,
  | 'name'
  | 'location_id'
  | 'category_id'
  | 'subcategory_id'
  | 'quantity'
  | 'unit'
  | 'min_stock'
  | 'brand'
  | 'expiry_date'
  | 'notes'
  | 'image_path'
>

export type MovementAction =
  | 'create'
  | 'increase'
  | 'decrease'
  | 'set'
  | 'update'
  | 'delete'
  | 'purchase'
  | 'clear'

export interface Movement {
  id: string
  inventory_id: string
  product_id: string | null
  product_name: string
  unit: string | null
  action: MovementAction
  quantity_before: number | null
  quantity_after: number | null
  diff: number
  user_id: string | null
  user_name: string
  created_at: string
}

export type Priority = 'low' | 'normal' | 'high'

export interface ShoppingItem {
  id: string
  inventory_id: string
  product_id: string | null
  name: string
  quantity_needed: number | null
  unit: string | null
  note: string | null
  auto: boolean
  reason: 'manual' | 'low' | 'out'
  priority: Priority
  is_bought: boolean
  bought_at: string | null
  created_at: string
}

export interface Member {
  id: string
  inventory_id: string
  user_id: string
  role: MemberRole
  created_at: string
  user: UserProfile | null
}

export interface InvitationRow {
  id: string
  inventory_id: string
  invited_email: string | null
  role: MemberRole
  expires_at: string
  created_at: string
}

export interface MyInvitation {
  id: string
  inventory_id: string
  inventory_name: string
  inventory_icon: string
  inventory_color: string
  owner_name: string
  role: MemberRole
  expires_at: string
  created_at: string
}

export type InvitationStatus =
  | 'pending'
  | 'accepted_by_me'
  | 'accepted'
  | 'revoked'
  | 'declined'
  | 'expired'
  | 'wrong_account'

export interface InvitationPreview {
  invitation_id: string
  status: InvitationStatus
  inventory_id: string | null
  inventory_name: string | null
  inventory_description: string | null
  inventory_icon: string | null
  inventory_color: string | null
  owner_name: string | null
  role: MemberRole | null
  expires_at: string | null
}

export type NotificationType = 'low_stock' | 'out_of_stock' | 'expiring' | 'expired' | 'info'

export interface AppNotification {
  id: string
  inventory_id: string
  user_id: string
  product_id: string | null
  type: NotificationType
  message: string
  read_at: string | null
  created_at: string
}

export interface NotificationPrefs {
  notifications_enabled: boolean
  low_stock: boolean
  out_of_stock: boolean
  expiry: boolean
  email_enabled: boolean
  in_app_enabled: boolean
  delay_minutes: number
}

export interface PendingAlert {
  id: string
  inventory_id: string
  product_id: string
  kind: 'stock' | 'expiry'
  level: 'low' | 'out' | 'soon' | 'expired'
  scheduled_at: string
  created_at: string
  product: { name: string; unit: string; quantity: number; min_stock: number } | null
}
