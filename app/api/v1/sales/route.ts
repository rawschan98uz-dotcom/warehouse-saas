import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError, jsonResponse, safeJson } from '@/lib/api/http'
import { verifyIntegrationKey } from '@/lib/api/integration-auth'
import { findIntegrationReplay, saveIntegrationLog } from '@/lib/api/integration-idempotency'

interface SaleItemPayload {
  product_id: string
  quantity: number
  price?: number
}

interface SalePaymentPayload {
  payment_method_id: string
  amount: number
  notes?: string
}

interface CreateSalePayload {
  user_id: string
  location_id: string
  customer_id?: string
  notes?: string
  due_date?: string
  items: SaleItemPayload[]
  payments: SalePaymentPayload[]
}

function getHeader(request: Request, key: string) {
  return request.headers.get(key)?.trim() || ''
}

export async function POST(request: Request) {
  const endpoint = 'v1.sales.create'
  const organizationId = getHeader(request, 'x-org-id')
  const apiKey = getHeader(request, 'x-api-key')
  const idempotencyKey = getHeader(request, 'x-idempotency-key')

  const authResult = await verifyIntegrationKey(organizationId, apiKey)
  if (!authResult.ok) {
    return jsonError(authResult.error || 'Unauthorized', authResult.status || 401)
  }

  if (!idempotencyKey) {
    return jsonError('Missing x-idempotency-key header', 400)
  }

  const replay = await findIntegrationReplay(organizationId, endpoint, idempotencyKey)
  if (replay) {
    return jsonResponse(
      {
        success: true,
        replay: true,
        data: replay.response_body,
      },
      replay.status_code || 200
    )
  }

  const payload = await safeJson<CreateSalePayload>(request)
  if (!payload) {
    return jsonError('Invalid JSON body', 400)
  }

  if (!payload.user_id || !payload.location_id || !Array.isArray(payload.items)) {
    return jsonError('Required fields: user_id, location_id, items[]', 400)
  }

  const admin = createAdminClient()

  const rpcResult = await admin.rpc('create_sale_with_payments', {
    org_id: organizationId,
    user_id_param: payload.user_id,
    location_id_param: payload.location_id,
    customer_id_param: payload.customer_id || null,
    items: payload.items,
    payments: payload.payments || [],
    notes_param: payload.notes || null,
    due_date_param: payload.due_date || null,
  })

  if (rpcResult.error) {
    await saveIntegrationLog({
      organizationId,
      endpoint,
      idempotencyKey,
      requestBody: payload,
      responseBody: { success: false, error: rpcResult.error.message },
      statusCode: 500,
    })

    return jsonError('Failed to create sale', 500, { details: rpcResult.error.message })
  }

  const result = rpcResult.data as Record<string, unknown>
  const statusCode = result?.success === true ? 201 : 400

  await saveIntegrationLog({
    organizationId,
    endpoint,
    idempotencyKey,
    requestBody: payload,
    responseBody: result,
    statusCode,
  })

  return jsonResponse(result, statusCode)
}
