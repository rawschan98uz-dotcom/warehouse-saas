import { createAdminClient } from '@/lib/supabase/admin'

export interface IntegrationAuthResult {
  ok: boolean
  organizationId?: string
  error?: string
  status?: number
}

export async function verifyIntegrationKey(
  organizationId: string,
  apiKey: string
): Promise<IntegrationAuthResult> {
  if (!organizationId) {
    return {
      ok: false,
      error: 'Missing x-org-id header',
      status: 400,
    }
  }

  if (!apiKey) {
    return {
      ok: false,
      error: 'Missing x-api-key header',
      status: 401,
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('organizations')
    .select('id, metadata')
    .eq('id', organizationId)
    .single()

  if (error || !data) {
    return {
      ok: false,
      error: 'Organization not found',
      status: 404,
    }
  }

  const expectedKey = (data.metadata as Record<string, unknown> | null)?.integration_api_key

  if (typeof expectedKey !== 'string' || expectedKey.length === 0) {
    return {
      ok: false,
      error: 'Integration key is not configured for organization',
      status: 403,
    }
  }

  if (expectedKey !== apiKey) {
    return {
      ok: false,
      error: 'Invalid api key',
      status: 403,
    }
  }

  return {
    ok: true,
    organizationId,
  }
}
