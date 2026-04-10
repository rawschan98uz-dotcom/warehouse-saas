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

  const admin = createAdminClient()

  const [customersResult, kpiResult, debtsResult] = await Promise.all([
    admin
      .from('customers')
      .select('id, full_name, phone, email, created_at, is_active, source, tags')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false }),
    admin
      .from('customer_kpis')
      .select('*')
      .eq('organization_id', organizationId),
    admin
      .from('customer_debts')
      .select('customer_id, status, outstanding_amount')
      .eq('organization_id', organizationId),
  ])

  if (customersResult.error) {
    return jsonError('Failed to load customers', 500, { details: customersResult.error.message })
  }
  if (kpiResult.error) {
    return jsonError('Failed to load customer KPI data', 500, { details: kpiResult.error.message })
  }
  if (debtsResult.error) {
    return jsonError('Failed to load customer debt data', 500, { details: debtsResult.error.message })
  }

  const kpiByCustomer = new Map<string, Record<string, unknown>>()
  for (const row of kpiResult.data || []) {
    kpiByCustomer.set(row.customer_id, row as unknown as Record<string, unknown>)
  }

  const debtByCustomer = new Map<string, number>()
  for (const debt of debtsResult.data || []) {
    if (debt.status === 'open' || debt.status === 'partially_paid') {
      debtByCustomer.set(
        debt.customer_id,
        (debtByCustomer.get(debt.customer_id) || 0) + Number(debt.outstanding_amount || 0)
      )
    }
  }

  const data = (customersResult.data || []).map((customer) => {
    const kpi = kpiByCustomer.get(customer.id)
    return {
      ...customer,
      kpis: {
        purchases_count: Number(kpi?.purchases_count || 0),
        total_spent: Number(kpi?.total_spent || 0),
        average_check: Number(kpi?.average_check || 0),
        first_purchase_at: kpi?.first_purchase_at || null,
        last_purchase_at: kpi?.last_purchase_at || null,
      },
      current_debt: debtByCustomer.get(customer.id) || 0,
    }
  })

  const totals = data.reduce(
    (acc, row) => {
      acc.customers += 1
      if (row.current_debt > 0) {
        acc.with_debt += 1
      }
      acc.total_debt += row.current_debt
      acc.total_spent += row.kpis.total_spent
      return acc
    },
    {
      customers: 0,
      with_debt: 0,
      total_debt: 0,
      total_spent: 0,
    }
  )

  return jsonResponse({
    success: true,
    totals,
    data,
  })
}
