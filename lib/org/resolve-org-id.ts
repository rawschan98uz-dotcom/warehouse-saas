import type { SupabaseClient } from '@supabase/supabase-js'

export async function resolveOrganizationId(
  supabase: SupabaseClient,
  currentOrgId?: string | null
): Promise<string> {
  if (currentOrgId && currentOrgId.length > 0) {
    return currentOrgId
  }

  const { data: ensuredOrgId, error } = await supabase.rpc('ensure_user_organization')

  if (error || typeof ensuredOrgId !== 'string' || ensuredOrgId.length === 0) {
    throw new Error('Организация не найдена')
  }

  return ensuredOrgId
}
