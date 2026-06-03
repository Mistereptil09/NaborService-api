import axios from 'axios'

export function makeClient(baseUrl: string, jwt: string | null) {
  return axios.create({
    baseURL: baseUrl,
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    validateStatus: () => true, // never throw on non-2xx
  })
}

export interface ApiResult<T = unknown> {
  status: number
  data: T
  ok: boolean
}

export async function safeCall<T = unknown>(
  fn: () => Promise<{ status: number; data: T }>
): Promise<ApiResult<T>> {
  try {
    const res = await fn()
    return { status: res.status, data: res.data, ok: res.status >= 200 && res.status < 300 }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error'
    return { status: 0, data: { error: msg } as T, ok: false }
  }
}
