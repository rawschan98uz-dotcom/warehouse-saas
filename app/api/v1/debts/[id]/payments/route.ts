import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError, jsonResponse, safeJson } from '@/lib/api/http'
import { verifyIntegrationKey } from '@/lib/api/integration-auth'
import { findIntegrationReplay, saveIntegrationLog } from '@/lib/api/integration-idempotency'

interface PayDebtPayload {
  user_id: string
  payment_method_id: string
  amount: number
  notes?: string
}

type Params = Promise<{ id: string }>

function getHeader(request: Request, key: string) {
  return request.headers.get(key)?.trim() || ''
}

export async function POST(request: Request, context: { params: Params }) {
  const { id } = await context.params
  const endpoint = 'v1.debts.pay'
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

  const replay = await findIntegrationReplay(organizationId, `${endpoint}.${id}`, idempotencyKey)
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

  const payload = await safeJson<PayDebtPayload>(request)
  if (!payload) {
    return jsonError('Invalid JSON body', 400)
  }

  if (!payload.user_id || !payload.payment_method_id || typeof payload.amount !== 'number') {
    return jsonError('Required fields: user_id, payment_method_id, amount', 400)
  }

  const admin = createAdminClient()
  const rpcResult = await admin.rpc('pay_customer_debt', {
    org_id: organizationId,
    user_id_param: payload.user_id,
    debt_id_param: id,
    payment_method_id_param: payload.payment_method_id,
    amount_param: payload.amount,
    notes_param: payload.notes || null,
  })

  if (rpcResult.error) {
    await saveIntegrationLog({
      organizationId,
      endpoint: `${endpoint}.${id}`,
      idempotencyKey,
      requestBody: payload,
      responseBody: { success: false, error: rpcResult.error.message },
      statusCode: 500,
    })

    return jsonError('Failed to apply debt payment', 500, { details: rpcResult.error.message })
  }

  const result = rpcResult.data as Record<string, unknown>
  const statusCode = result?.success === true ? 201 : 400

  await saveIntegrationLog({
    organizationId,
    endpoint: `${endpoint}.${id}`,
    idempotencyKey,
    requestBody: payload,
    responseBody: result,
    statusCode,
  })

  return jsonResponse(result, statusCode)
}
