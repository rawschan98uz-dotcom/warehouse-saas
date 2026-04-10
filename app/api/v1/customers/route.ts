import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError, jsonResponse, safeJson } from '@/lib/api/http'
import { verifyIntegrationKey } from '@/lib/api/integration-auth'

interface CreateCustomerPayload {
  full_name?: string
  phone?: string
  email?: string
  birthday?: string
  gender?: 'male' | 'female' | 'other'
  source?: string
  tags?: string[]
  notes?: string
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

  const url = new URL(request.url)
  const search = url.searchParams.get('search')
  const active = url.searchParams.get('active')
  const limit = Math.min(Number(url.searchParams.get('limit') || '50'), 200)
  const offset = Number(url.searchParams.get('offset') || '0')

  const admin = createAdminClient()
  let query = admin
    .from('customers')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (active === 'true') {
    query = query.eq('is_active', true)
  }
  if (active === 'false') {
    query = query.eq('is_active', false)
  }
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) {
    return jsonError('Failed to load customers', 500, { details: error.message })
  }

  return jsonResponse({
    success: true,
    data: data || [],
    paging: { offset, limit },
  })
}

export async function POST(request: Request) {
  const organizationId = getHeader(request, 'x-org-id')
  const apiKey = getHeader(request, 'x-api-key')

  const authResult = await verifyIntegrationKey(organizationId, apiKey)
  if (!authResult.ok) {
    return jsonError(authResult.error || 'Unauthorized', authResult.status || 401)
  }

  const payload = await safeJson<CreateCustomerPayload>(request)
  if (!payload) {
    return jsonError('Invalid JSON body', 400)
  }

  if (!payload.full_name || payload.full_name.trim().length === 0) {
    return jsonError('Field full_name is required', 400)
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('customers')
    .insert({
      organization_id: organizationId,
      full_name: payload.full_name.trim(),
      phone: payload.phone?.trim() || null,
      email: payload.email?.trim() || null,
      birthday: payload.birthday || null,
      gender: payload.gender || null,
      source: payload.source || null,
      tags: payload.tags || [],
      notes: payload.notes || null,
      is_active: true,
    })
    .select('*')
    .single()

  if (error) {
    return jsonError('Failed to create customer', 500, { details: error.message })
  }

  return jsonResponse({
    success: true,
    data,
  }, 201)
}
