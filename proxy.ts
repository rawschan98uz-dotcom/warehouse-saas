import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(_request: NextRequest) {
  void _request
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
