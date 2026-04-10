import { createAdminClient } from '@/lib/supabase/admin'

interface SaveIntegrationLogParams {
  organizationId: string
  endpoint: string
  idempotencyKey: string
  requestBody: unknown
  responseBody: unknown
  statusCode: number
}

export async function findIntegrationReplay(
  organizationId: string,
  endpoint: string,
  idempotencyKey: string
) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('integration_requests')
    .select('response_body, status_code')
    .eq('organization_id', organizationId)
    .eq('endpoint', endpoint)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  return data
}

export async function saveIntegrationLog(params: SaveIntegrationLogParams) {
  const admin = createAdminClient()

  await admin.from('integration_requests').upsert(
    {
      organization_id: params.organizationId,
      endpoint: params.endpoint,
      idempotency_key: params.idempotencyKey,
      request_body: params.requestBody,
      response_body: params.responseBody,
      status_code: params.statusCode,
    },
    {
      onConflict: 'organization_id,endpoint,idempotency_key',
    }
  )
}
