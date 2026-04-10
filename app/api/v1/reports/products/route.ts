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

  const [productsResult, inventoryResult, salesItemsResult] = await Promise.all([
    admin
      .from('products')
      .select('id, sku, name, category_id, purchase_price, sale_price, currency, min_stock_level, is_active')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true }),
    admin
      .from('inventory')
      .select('product_id, quantity')
      .eq('organization_id', organizationId),
    admin
      .from('transaction_items')
      .select('product_id, quantity, total, transactions!inner(type, organization_id)')
      .eq('transactions.organization_id', organizationId)
      .eq('transactions.type', 'sale'),
  ])

  if (productsResult.error) {
    return jsonError('Failed to load products', 500, { details: productsResult.error.message })
  }
  if (inventoryResult.error) {
    return jsonError('Failed to load inventory', 500, { details: inventoryResult.error.message })
  }
  if (salesItemsResult.error) {
    return jsonError('Failed to load product sales', 500, { details: salesItemsResult.error.message })
  }

  const inventoryByProduct = new Map<string, number>()
  for (const row of inventoryResult.data || []) {
    inventoryByProduct.set(
      row.product_id,
      (inventoryByProduct.get(row.product_id) || 0) + Number(row.quantity || 0)
    )
  }

  const soldQtyByProduct = new Map<string, number>()
  const soldAmountByProduct = new Map<string, number>()

  for (const row of salesItemsResult.data || []) {
    soldQtyByProduct.set(
      row.product_id,
      (soldQtyByProduct.get(row.product_id) || 0) + Number(row.quantity || 0)
    )
    soldAmountByProduct.set(
      row.product_id,
      (soldAmountByProduct.get(row.product_id) || 0) + Number(row.total || 0)
    )
  }

  const data = (productsResult.data || []).map((p) => {
    const stockQty = inventoryByProduct.get(p.id) || 0
    const soldQty = soldQtyByProduct.get(p.id) || 0
    const soldAmount = soldAmountByProduct.get(p.id) || 0

    return {
      ...p,
      stock_quantity: stockQty,
      stock_value: stockQty * Number(p.purchase_price || 0),
      sold_quantity: soldQty,
      sold_amount: soldAmount,
      low_stock: stockQty <= Number(p.min_stock_level || 0) && Number(p.min_stock_level || 0) > 0,
    }
  })

  return jsonResponse({
    success: true,
    data,
  })
}
