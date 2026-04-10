import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError, jsonResponse, safeJson } from '@/lib/api/http'
import { verifyIntegrationKey } from '@/lib/api/integration-auth'

interface CreateMethodPayload {
  code?: string
  name?: string
  type?: 'cash' | 'card' | 'bank_transfer' | 'digital_wallet' | 'other'
  sort_order?: number
  is_active?: boolean
}

function getHeader(request: Request, key: string) {
  return request.headers.get(key)?.trim() || ''
}

export async function GET(request: Request) {
  const organizationId = getHeader(request, 'x-org-id')
  const apiKey = getHeader(request, 'x-api-key')

  const authResult = await verifyIntegrationKey(organizationId, apiKey)
  if (!authResult.ok) {
    return jsonError(authResult.error || 'Unauthorized', authResult.status || 401)
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('payment_methods')
    .select('*')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    return jsonError('Failed to load payment methods', 500, { details: error.message })
  }

  return jsonResponse({ success: true, data: data || [] })
}

export async function POST(request: Request) {
  const organizationId = getHeader(request, 'x-org-id')
  const apiKey = getHeader(request, 'x-api-key')

  const authResult = await verifyIntegrationKey(organizationId, apiKey)
  if (!authResult.ok) {
    return jsonError(authResult.error || 'Unauthorized', authResult.status || 401)
  }

  const payload = await safeJson<CreateMethodPayload>(request)
  if (!payload) {
    return jsonError('Invalid JSON body', 400)
  }

  if (!payload.code || !payload.name) {
    return jsonError('Fields code and name are required', 400)
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('payment_methods')
    .insert({
      organization_id: organizationId,
      code: payload.code.trim().toLowerCase(),
      name: payload.name.trim(),
      type: payload.type || 'other',
      sort_order: payload.sort_order || 0,
      is_active: payload.is_active ?? true,
    })
    .select('*')
    .single()

  if (error) {
    return jsonError('Failed to create payment method', 500, { details: error.message })
  }

  return jsonResponse({ success: true, data }, 201)
}
