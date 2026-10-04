import { supabase } from '../lib/supabase'
import type { InvitationRow, Member, MemberRole } from '../types/database'
import { must, mustAffect } from './helpers'

export async function fetchMembers(inventoryId: string): Promise<Member[]> {
  const rows = must(
    await supabase
      .from('inventory_members')
      .select('id, inventory_id, user_id, role, created_at, user:users(id, email, display_name)')
      .eq('inventory_id', inventoryId)
      .order('created_at'),
  )
  return rows as unknown as Member[]
}

export async function updateMemberRole(memberId: string, role: MemberRole): Promise<void> {
  mustAffect(await supabase.from('inventory_members').update({ role }).eq('id', memberId).select('id'))
}

export async function removeMember(memberId: string): Promise<void> {
  mustAffect(await supabase.from('inventory_members').delete().eq('id', memberId).select('id'))
}

export async function fetchPendingInvitations(inventoryId: string): Promise<InvitationRow[]> {
  const rows = must(
    await supabase
      .from('inventory_invitations')
      .select('id, inventory_id, invited_email, role, expires_at, created_at')
      .eq('inventory_id', inventoryId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .is('declined_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  )
  return rows as InvitationRow[]
}
