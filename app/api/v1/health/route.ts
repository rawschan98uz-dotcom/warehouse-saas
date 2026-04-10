import { jsonResponse } from '@/lib/api/http'

export async function GET() {
  return jsonResponse({
    success: true,
    service: 'warehouse-saas',
    version: 'v1',
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
}
