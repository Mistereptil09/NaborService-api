export type ResponseState = 'success' | 'error' | 'warning' | 'info' | ''

interface Props {
  data: unknown
  status?: number
  state?: ResponseState
}

export function ResponseBox({ data, status, state = '' }: Props) {
  if (data === null || data === undefined) return null
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  const isOk = status !== undefined && status >= 200 && status < 300

  return (
    <>
      <div className={`response-box ${state}`}>{text}</div>
      {status !== undefined && (
        <div className="status-row">
          <span className={`status-code ${isOk ? 'ok' : 'err'}`}>{status}</span>
          <span>{isOk ? 'Success' : 'Error'} — {new Date().toLocaleTimeString()}</span>
        </div>
      )}
    </>
  )
}
