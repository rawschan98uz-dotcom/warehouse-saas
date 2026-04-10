import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

interface OrgMembership {
  organization_id: string
}

export async function ensureOrganizationId(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const fetchFirstOrgMembership = async () =>
    supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<OrgMembership>()

  const existing = await fetchFirstOrgMembership()

  if (existing.data?.organization_id) {
    return existing.data.organization_id
  }

  const rpcResult = await supabase.rpc('ensure_user_organization')
  if (!rpcResult.error && typeof rpcResult.data === 'string' && rpcResult.data.length > 0) {
    return rpcResult.data
  }

  try {
    const admin = createAdminClient()
    const { data: authUser } = await admin.auth.admin.getUserById(userId)

    const fallbackEmail = authUser?.user?.email || `user-${userId.slice(0, 8)}@local.test`

    const { data: createdOrg, error: createOrgError } = await admin
      .from('organizations')
      .insert({
        name: `Organization ${fallbackEmail.split('@')[0]}`,
      })
      .select('id')
      .single()

    if (!createOrgError && createdOrg?.id) {
      await admin
        .from('organization_users')
        .upsert(
          {
            organization_id: createdOrg.id,
            user_id: userId,
            role: 'admin',
          },
          {
            onConflict: 'organization_id,user_id',
          }
        )

      const retry = await fetchFirstOrgMembership()
      if (retry.data?.organization_id) {
        return retry.data.organization_id
      }

      return createdOrg.id
    }
  } catch (error) {
    console.error('Fallback organization creation failed:', error)
  }

  const fallback = await fetchFirstOrgMembership()

  if (fallback.data?.organization_id) {
    return fallback.data.organization_id
  }

  throw new Error('Organization not found')
}
