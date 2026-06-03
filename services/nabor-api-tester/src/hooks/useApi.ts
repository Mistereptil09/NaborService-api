import { useAppContext } from '../context/AppContext'
import { makeClient, safeCall, type ApiResult } from '../api/client'

export function useApi() {
  const { appState } = useAppContext()
  const client = makeClient(appState.baseUrl, appState.jwt)

  async function get<T = unknown>(path: string): Promise<ApiResult<T>> {
    return safeCall(() => client.get<T>(path))
  }

  async function post<T = unknown>(path: string, data?: unknown): Promise<ApiResult<T>> {
    return safeCall(() => client.post<T>(path, data))
  }

  async function patch<T = unknown>(path: string, data?: unknown): Promise<ApiResult<T>> {
    return safeCall(() => client.patch<T>(path, data))
  }

  return { get, post, patch }
}
