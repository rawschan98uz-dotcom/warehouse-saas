export function jsonResponse(payload: unknown, status = 200) {
  return Response.json(payload, { status })
}

export function jsonError(message: string, status = 400, details?: Record<string, unknown>) {
  return Response.json(
    {
      success: false,
      error: message,
      ...(details || {}),
    },
    { status }
  )
}

export async function safeJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
