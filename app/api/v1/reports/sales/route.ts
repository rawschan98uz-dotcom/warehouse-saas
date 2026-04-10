import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError, jsonResponse } from '@/lib/api/http'
import { verifyIntegrationKey } from '@/lib/api/integration-auth'

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

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const locationId = url.searchParams.get('location_id')
  const userId = url.searchParams.get('user_id')

  const admin = createAdminClient()

  let query = admin
    .from('transactions')
    .select('id, total_amount, currency, created_at, user_id, from_location_id, customer_id, sale_payments(amount, payment_method_id)')
    .eq('organization_id', organizationId)
    .eq('type', 'sale')
    .order('created_at', { ascending: false })

  if (from) {
    query = query.gte('created_at', new Date(from).toISOString())
  }
  if (to) {
    query = query.lte('created_at', new Date(to).toISOString())
  }
  if (locationId) {
    query = query.eq('from_location_id', locationId)
  }
  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query
  if (error) {
    return jsonError('Failed to generate sales report', 500, { details: error.message })
  }

  const rows = data || []

  const totals = rows.reduce(
    (acc, tx) => {
      acc.sales_count += 1
      acc.sales_amount += Number(tx.total_amount || 0)
      acc.customers_count += tx.customer_id ? 1 : 0
      return acc
    },
    {
      sales_count: 0,
      sales_amount: 0,
      customers_count: 0,
    }
  )

  return jsonResponse({
    success: true,
    totals,
    data: rows,
  })
}
