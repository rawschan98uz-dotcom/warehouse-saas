import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError, jsonResponse, safeJson } from '@/lib/api/http'
import { verifyIntegrationKey } from '@/lib/api/integration-auth'

interface UpdateCustomerPayload {
  full_name?: string
  phone?: string | null
  email?: string | null
  birthday?: string | null
  gender?: 'male' | 'female' | 'other' | null
  source?: string | null
  tags?: string[]
  notes?: string | null
  is_active?: boolean
}

type Params = Promise<{ id: string }>

function getHeader(request: Request, key: string) {
  return request.headers.get(key)?.trim() || ''
}

export async function GET(request: Request, context: { params: Params }) {
  const { id } = await context.params
  const organizationId = getHeader(request, 'x-org-id')
  const apiKey = getHeader(request, 'x-api-key')

  const authResult = await verifyIntegrationKey(organizationId, apiKey)
  if (!authResult.ok) {
    return jsonError(authResult.error || 'Unauthorized', authResult.status || 401)
  }

  const admin = createAdminClient()

  const [customerResult, kpiResult, debtsResult, purchasesResult] = await Promise.all([
    admin
      .from('customers')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle(),
    admin
      .from('customer_kpis')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('customer_id', id)
      .maybeSingle(),
    admin
      .from('customer_debts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('customer_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('transactions')
      .select('id, total_amount, currency, notes, created_at, from_location_id, transaction_items(quantity, price, currency, products(name, sku))')
      .eq('organization_id', organizationId)
      .eq('type', 'sale')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (customerResult.error) {
    return jsonError('Failed to load customer', 500, { details: customerResult.error.message })
  }
  if (!customerResult.data) {
    return jsonError('Customer not found', 404)
  }

  return jsonResponse({
    success: true,
    data: {
      customer: customerResult.data,
      kpis: kpiResult.data || null,
      debts: debtsResult.data || [],
      purchases: purchasesResult.data || [],
    },
  })
}

export async function PATCH(request: Request, context: { params: Params }) {
  const { id } = await context.params
  const organizationId = getHeader(request, 'x-org-id')
  const apiKey = getHeader(request, 'x-api-key')

  const authResult = await verifyIntegrationKey(organizationId, apiKey)
  if (!authResult.ok) {
    return jsonError(authResult.error || 'Unauthorized', authResult.status || 401)
  }

  const payload = await safeJson<UpdateCustomerPayload>(request)
  if (!payload) {
    return jsonError('Invalid JSON body', 400)
  }

  const updateData: Record<string, unknown> = {}

  if (typeof payload.full_name === 'string') {
    if (payload.full_name.trim().length === 0) {
      return jsonError('full_name cannot be empty', 400)
    }
    updateData.full_name = payload.full_name.trim()
  }
  if (payload.phone !== undefined) updateData.phone = payload.phone
  if (payload.email !== undefined) updateData.email = payload.email
  if (payload.birthday !== undefined) updateData.birthday = payload.birthday
  if (payload.gender !== undefined) updateData.gender = payload.gender
  if (payload.source !== undefined) updateData.source = payload.source
  if (payload.tags !== undefined) updateData.tags = payload.tags
  if (payload.notes !== undefined) updateData.notes = payload.notes
  if (typeof payload.is_active === 'boolean') updateData.is_active = payload.is_active

  if (Object.keys(updateData).length === 0) {
    return jsonError('No fields to update', 400)
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('customers')
    .update(updateData)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    return jsonError('Failed to update customer', 500, { details: error.message })
  }

  return jsonResponse({
    success: true,
    data,
  })
}
