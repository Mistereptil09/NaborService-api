import { useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useApi } from '../hooks/useApi'
import { useAppContext } from '../context/AppContext'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { ResponseBox, type ResponseState } from '../components/ResponseBox'
import { Spinner } from '../components/Spinner'
import { StepPills } from '../components/StepPills'

type R = { data: unknown; status: number; state: ResponseState } | null
type LoginChallenge = 'totp_setup_required' | 'totp_required' | null

export function AuthPage() {
  const { appState, setAppState } = useAppContext()
  const api = useApi()
  const [step, setStep] = useState(1)

  // Login
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginResult, setLoginResult] = useState<R>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  // Challenge state
  const [challenge, setChallenge] = useState<LoginChallenge>(null)
  const [challengeToken, setChallengeToken] = useState('')

  // TOTP setup
  const [totpUri, setTotpUri] = useState('')
  const [setupResult, setSetupResult] = useState<R>(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const totpCanvasRef = useRef<HTMLCanvasElement>(null)

  // TOTP confirm
  const [totpCode, setTotpCode] = useState('')
  const [confirmResult, setConfirmResult] = useState<R>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // SSO QR
  const [ssoQrCode, setSsoQrCode] = useState('')
  const [ssoScanUrl, setSsoScanUrl] = useState('')
  const [ssoTokenUuid, setSsoTokenUuid] = useState('')
  const [ssoStatus, setSsoStatus] = useState<string | null>(null)
  const [ssoValidateCode, setSsoValidateCode] = useState('')
  const [ssoResult, setSsoResult] = useState<R>(null)
  const [ssoLoading, setSsoLoading] = useState(false)
  const [ssoValidateResult, setSsoValidateResult] = useState<R>(null)
  const [ssoValidateLoading, setSsoValidateLoading] = useState(false)
  const [ssoStatusResult, setSsoStatusResult] = useState<R>(null)
  const [ssoPolling, setSsoPolling] = useState(false)
  const ssoPollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function renderQr(ref: React.RefObject<HTMLCanvasElement | null>, value: string) {
    if (!value) return
    requestAnimationFrame(async () => {
      if (!ref.current) return
      await QRCode.toCanvas(ref.current, value, {
        width: 220,
        margin: 2,
        color: { dark: '#000', light: '#fff' },
      })
    })
  }

  function stopSsoPolling() {
    if (ssoPollingRef.current) {
      clearInterval(ssoPollingRef.current)
      ssoPollingRef.current = null
    }
    setSsoPolling(false)
  }

  function resetTransientAuthState() {
    setChallenge(null)
    setChallengeToken('')
    setTotpUri('')
    setTotpCode('')
    setSetupResult(null)
    setConfirmResult(null)
    setSsoQrCode('')
    setSsoScanUrl('')
    setSsoTokenUuid('')
    setSsoStatus(null)
    setSsoValidateCode('')
    setSsoResult(null)
    setSsoValidateResult(null)
    setSsoStatusResult(null)
    stopSsoPolling()
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async function handleLogin() {
    if (!email || !password) return
    setLoginLoading(true)
    const res = await api.post('/auth/login', { email, password })
    setLoginLoading(false)

    const data = (res.data ?? {}) as Record<string, any>

    if (!res.ok) {
      setLoginResult({ data: res.data, status: res.status, state: 'error' })
      return
    }

    const directJwt = data.access_token || data.token || data.jwt
    if (directJwt) {
      setAppState(s => ({ ...s, jwt: directJwt }))
      resetTransientAuthState()
      setStep(4)
      setLoginResult({ data: res.data, status: res.status, state: 'success' })
      return
    }

    const nextChallenge = (data.challenge ?? null) as LoginChallenge
    const nextChallengeToken = data.challenge_token ?? data.challengeToken ?? ''
    const nextTotpUri = data.otpauthUrl ?? data.otpauth_url ?? data.uri ?? ''

    if (nextChallenge === 'totp_setup_required') {
      setChallenge('totp_setup_required')
      setChallengeToken(nextChallengeToken)
      setTotpUri(nextTotpUri)
      setStep(3)
      setLoginResult({ data: res.data, status: res.status, state: 'warning' })
      if (nextTotpUri) await renderQr(totpCanvasRef, nextTotpUri)
      return
    }

    if (nextChallenge === 'totp_required') {
      setChallenge('totp_required')
      setChallengeToken(nextChallengeToken)
      setTotpUri('')
      setStep(3)
      setLoginResult({ data: res.data, status: res.status, state: 'warning' })
      return
    }

    setLoginResult({ data: res.data, status: res.status, state: 'success' })
  }

  // ─── TOTP Setup ───────────────────────────────────────────────────────────

  async function handleTotpSetup() {
    // FIX #1: Clear stale challenge/challengeToken before calling the endpoint.
    // Without this, if the user previously received a totp_setup_required challenge
    // from login and then clicks "Regenerate QR", the old challenge state persists.
    // handleTotpConfirm would then route to /auth/totp/confirm-setup with an expired
    // challenge_token instead of using the JWT-based /auth/totp/confirm.
    setChallenge(null)
    setChallengeToken('')

    setSetupLoading(true)
    const res = await api.post('/auth/totp/setup', {})
    setSetupLoading(false)

    const data = (res.data ?? {}) as Record<string, any>
    const uri = data.otpauthUrl ?? data.otpauth_url ?? data.uri ?? ''

    if (res.ok && uri) {
      setTotpUri(uri)
      setStep(3)
      await renderQr(totpCanvasRef, uri)
    }

    setSetupResult({ data: res.data, status: res.status, state: res.ok ? 'success' : 'error' })
  }

  // ─── TOTP Confirm ─────────────────────────────────────────────────────────

  async function handleTotpConfirm() {
    if (totpCode.length !== 6) return
    setConfirmLoading(true)

    const endpoint =
      challenge === 'totp_setup_required'
        ? '/auth/totp/confirm-setup'
        : challenge === 'totp_required'
          ? '/auth/totp/verify'
          : '/auth/totp/confirm'

    const payload =
      challenge === 'totp_setup_required' || challenge === 'totp_required'
        ? { challenge_token: challengeToken, code: totpCode }
        : { code: totpCode }

    const res = await api.post(endpoint, payload)
    setConfirmLoading(false)

    const data = (res.data ?? {}) as Record<string, any>
    const jwt = data.access_token || data.token || data.jwt

    if (res.ok) {
      if (jwt) setAppState(s => ({ ...s, jwt }))
      setChallenge(null)
      setChallengeToken('')
      setStep(4)
    }

    setConfirmResult({ data: res.data, status: res.status, state: res.ok ? 'success' : 'error' })
  }

  // ─── SSO QR ───────────────────────────────────────────────────────────────

  async function handleGenerateSsoQr() {
    setSsoLoading(true)
    setSsoStatus(null)
    setSsoQrCode('')
    setSsoScanUrl('')
    setSsoTokenUuid('')
    if (ssoPollingRef.current) clearInterval(ssoPollingRef.current)

    const res = await api.post('/auth/sso/qr/generate', {})
    setSsoLoading(false)

    const data = (res.data ?? {}) as Record<string, any>
    if (res.ok) {
      setSsoQrCode(data.qr_code ?? '')
      setSsoScanUrl(data.scan_url ?? '')
      const uuidMatch = (data.scan_url ?? '').match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      )
      if (uuidMatch) setSsoTokenUuid(uuidMatch[1])
    }

    setSsoResult({ data: res.data, status: res.status, state: res.ok ? 'success' : 'error' })
  }

  async function handleCheckSsoStatus(uuid: string) {
    if (!uuid) return
    const res = await api.get(`/auth/sso/qr/${uuid}/status`)
    const data = (res.data ?? {}) as Record<string, any>
    setSsoStatus(data.status ?? JSON.stringify(data))
    setSsoStatusResult({ data: res.data, status: res.status, state: res.ok ? 'success' : 'error' })
  }

  function startSsoPolling(uuid: string) {
    if (ssoPollingRef.current) clearInterval(ssoPollingRef.current)
    setSsoPolling(true)
    ssoPollingRef.current = setInterval(async () => {
      await handleCheckSsoStatus(uuid)
    }, 3000)
  }

  async function handleValidateSsoQr() {
    if (!ssoValidateCode) return
    setSsoValidateLoading(true)
    const res = await api.post('/auth/sso/qr/validate', { token_uuid: ssoValidateCode })
    setSsoValidateLoading(false)
    if (res.ok) stopSsoPolling()
    setSsoValidateResult({ data: res.data, status: res.status, state: res.ok ? 'success' : 'error' })
  }

  function clearToken() {
    setAppState(s => ({ ...s, jwt: null }))
    resetTransientAuthState()
    setLoginResult(null)
    setStep(1)
  }

  const canConfirm = !!challengeToken || !!totpUri || challenge === 'totp_required'

  const confirmEndpointLabel =
    challenge === 'totp_setup_required'
      ? 'POST /auth/totp/confirm-setup'
      : challenge === 'totp_required'
        ? 'POST /auth/totp/verify'
        : 'POST /auth/totp/confirm'

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <section aria-labelledby="auth-title">
      <div className="page-header">
        <h1 className="page-title" id="auth-title">Auth & TOTP</h1>
        <p className="page-desc">
          Test the full authentication flow: JWT login, TOTP setup and verification, and SSO QR code generation.
        </p>
      </div>

      <StepPills steps={['Login', 'Setup TOTP', 'Confirm', 'SSO QR']} current={step} />

      {challenge && (
        <div className="response-box warning" style={{ marginBottom: 'var(--space-5)' }}>
          {challenge === 'totp_setup_required'
            ? 'TOTP setup required. Scan the QR code below, then enter the 6-digit code to finish login.'
            : 'TOTP verification required. Enter the 6-digit code from your authenticator app to finish login.'}
        </div>
      )}

      {/* ── Login ── */}
      <Card title={<><LockIcon /> Login</>} badge="POST /auth/login">
        <div className="form-row">
          <FormField id="email" label="Email" type="email" value={email} onChange={setEmail} placeholder="admin@example.com" autoComplete="username" />
          <FormField id="password" label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="current-password" />
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleLogin} disabled={loginLoading}>
            {loginLoading ? <Spinner /> : <SendIcon />} Login
          </button>
          {(appState.jwt || challengeToken) && (
            <button className="btn btn-ghost btn-sm" onClick={clearToken}>Clear Session</button>
          )}
        </div>
        {loginResult && <ResponseBox data={loginResult.data} status={loginResult.status} state={loginResult.state} />}
      </Card>

      {/* ── TOTP Setup ── */}
      <Card title={<><PhoneIcon /> TOTP Setup</>} badge="POST /auth/totp/setup">
        <p className="card-desc">
          {challenge === 'totp_setup_required'
            ? 'The login response already returned an OTP URI — scan the QR below. You can also regenerate it using this endpoint.'
            : 'Requires a valid JWT. Renders the returned OTP URI as a scannable QR code.'}
        </p>
        <div className="btn-row">
          <button
            className="btn btn-primary"
            onClick={handleTotpSetup}
            // FIX #2 & #3: only enable when a real JWT exists.
            // The old condition (!appState.jwt && !challengeToken) allowed this button
            // when only a challenge_token was present, but POST /auth/totp/setup is
            // protected by @UseGuards(JwtAuthGuard) and requires a real Bearer JWT.
            // A challenge_token is not a JWT and will always get a 401.
            disabled={setupLoading || !appState.jwt}
          >
            {setupLoading ? <Spinner /> : <ShieldIcon />}
            {totpUri ? 'Regenerate QR' : 'Setup TOTP'}
          </button>
        </div>
        {totpUri && (
          <div>
            <div className="qr-wrapper"><canvas ref={totpCanvasRef} /></div>
            <div className="response-box info" style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
              {totpUri}
            </div>
          </div>
        )}
        {!totpUri && <canvas ref={totpCanvasRef} style={{ display: 'none' }} />}
        {setupResult && <ResponseBox data={setupResult.data} status={setupResult.status} state={setupResult.state} />}
      </Card>

      {/* ── TOTP Confirm ── */}
      <Card title={<><CheckIcon /> TOTP Verification</>} badge={confirmEndpointLabel}>
        {!!challengeToken && (
          <div className="response-box info" style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-xs)' }}>
            Using temporary <code>challenge_token</code> from login — no JWT required for this step.
          </div>
        )}
        <FormField
          id="totp-code"
          label="6-Digit Code"
          value={totpCode}
          onChange={(value) => setTotpCode(value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          maxLength={6}
          inputMode="numeric"
          mono
        />
        <div className="btn-row">
          <button
            className="btn btn-primary"
            onClick={handleTotpConfirm}
            disabled={confirmLoading || totpCode.length !== 6 || !canConfirm}
          >
            {confirmLoading ? <Spinner /> : <CheckIcon />} Verify Code
          </button>
        </div>
        {!canConfirm && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', marginTop: 'var(--space-3)' }}>
            Complete login or TOTP setup first.
          </p>
        )}
        {confirmResult && <ResponseBox data={confirmResult.data} status={confirmResult.status} state={confirmResult.state} />}
      </Card>

      {/* ── SSO QR ── */}
      <Card title={<><QrIcon /> SSO QR Code</>} badge="POST /auth/sso/qr/generate">
        <p className="card-desc">
          Generate a QR code for desktop login simulation. The desktop app scans it; the logged-in mobile client validates it.
        </p>

        {/* Step 1 — Generate */}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleGenerateSsoQr} disabled={ssoLoading}>
            {ssoLoading ? <Spinner /> : <QrIcon />} Generate SSO QR
          </button>
          {ssoTokenUuid && !ssoPolling && (
            <button className="btn btn-ghost btn-sm" onClick={() => startSsoPolling(ssoTokenUuid)}>
              <RefreshIcon /> Poll Status
            </button>
          )}
          {ssoPolling && (
            <button className="btn btn-ghost btn-sm" onClick={stopSsoPolling}>
              Stop Polling
            </button>
          )}
        </div>

        {ssoQrCode && (
          <div>
            <div className="qr-wrapper">
              <img
                src={ssoQrCode.startsWith('data:') ? ssoQrCode : `data:image/png;base64,${ssoQrCode}`}
                alt="SSO QR Code"
                width={220}
                height={220}
              />
            </div>
            {ssoScanUrl && (
              <div className="response-box info" style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                <strong>Scan URL:</strong> {ssoScanUrl}
              </div>
            )}
            {ssoTokenUuid && (
              <div className="response-box info" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
                <strong>Token UUID:</strong> <code>{ssoTokenUuid}</code>
              </div>
            )}
          </div>
        )}

        {ssoResult && <ResponseBox data={ssoResult.data} status={ssoResult.status} state={ssoResult.state} />}

        {/* Step 2 — Check status */}
        {ssoTokenUuid && (
          <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-6)', borderTop: '1px solid var(--color-border)' }}>
            <p className="card-desc" style={{ marginBottom: 'var(--space-3)' }}>
              <strong>GET /auth/sso/qr/{'{token_uuid}'}/status</strong>
              {ssoPolling && (
                <span style={{ marginLeft: 'var(--space-2)', color: 'var(--color-primary)', fontSize: 'var(--text-xs)' }}>
                  ● polling every 3s
                </span>
              )}
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => handleCheckSsoStatus(ssoTokenUuid)}>
              Check Once
            </button>
            {ssoStatus && (
              <div className="response-box info" style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                Status: <strong>{ssoStatus}</strong>
              </div>
            )}
            {ssoStatusResult && (
              <ResponseBox data={ssoStatusResult.data} status={ssoStatusResult.status} state={ssoStatusResult.state} />
            )}
          </div>
        )}

        {/* Step 3 — Validate */}
        <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-6)', borderTop: '1px solid var(--color-border)' }}>
          <p className="card-desc" style={{ marginBottom: 'var(--space-3)' }}>
            <strong>POST /auth/sso/qr/validate</strong> — Requires JWT. Paste a token UUID to validate it as the logged-in user.
          </p>
          <FormField
            id="sso-validate-uuid"
            label="Token UUID to validate"
            value={ssoValidateCode}
            onChange={setSsoValidateCode}
            placeholder={ssoTokenUuid || '00000000-0000-0000-0000-000000000000'}
            mono
          />
          <div className="btn-row" style={{ marginTop: 'var(--space-3)' }}>
            <button
              className="btn btn-primary"
              onClick={handleValidateSsoQr}
              disabled={ssoValidateLoading || !appState.jwt || !ssoValidateCode}
            >
              {ssoValidateLoading ? <Spinner /> : <CheckIcon />} Validate QR
            </button>
            {ssoTokenUuid && (
              <button className="btn btn-ghost btn-sm" onClick={() => setSsoValidateCode(ssoTokenUuid)}>
                Use generated UUID
              </button>
            )}
          </div>
          {!appState.jwt && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', marginTop: 'var(--space-2)' }}>
              Login first to get a JWT before validating.
            </p>
          )}
          {ssoValidateResult && (
            <ResponseBox data={ssoValidateResult.data} status={ssoValidateResult.status} state={ssoValidateResult.state} />
          )}
        </div>
      </Card>
    </section>
  )
}

const LockIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
const SendIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>
const PhoneIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
const ShieldIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
const CheckIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
const QrIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
const RefreshIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
