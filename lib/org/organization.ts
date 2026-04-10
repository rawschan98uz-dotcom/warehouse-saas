import type { SupabaseClient } from '@supabase/supabase-js'

interface OrgMembership {
  organization_id: string
}

export async function ensureOrganizationId(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const existing = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<OrgMembership>()

  if (existing.data?.organization_id) {
    return existing.data.organization_id
  }

  const rpcResult = await supabase.rpc('ensure_user_organization')
  if (!rpcResult.error && typeof rpcResult.data === 'string' && rpcResult.data.length > 0) {
    return rpcResult.data
  }

  const fallback = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<OrgMembership>()

  if (fallback.data?.organization_id) {
    return fallback.data.organization_id
  }

  throw new Error('Organization not found')
}
