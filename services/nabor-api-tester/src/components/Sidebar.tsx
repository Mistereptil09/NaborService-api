import type { Page } from '../App'

interface Props {
  page: Page
  onNavigate: (p: Page) => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  jwt: string | null
}

export function Sidebar({ page, onNavigate, theme, onToggleTheme, jwt }: Props) {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar-logo">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect width="28" height="28" rx="6" fill="currentColor" opacity="0.12"/>
          <path d="M6 14 L10 10 L14 14 L18 10 L22 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="14" cy="19" r="3" fill="currentColor"/>
          <circle cx="8"  cy="19" r="1.5" fill="currentColor" opacity="0.5"/>
          <circle cx="20" cy="19" r="1.5" fill="currentColor" opacity="0.5"/>
        </svg>
        <span className="sidebar-logo-text">Nabor<br/>API Tester</span>
      </div>

      <span className="sidebar-section-label">Tools</span>

      <NavItem icon="lock" label="Auth & TOTP"       active={page === 'auth'}           onClick={() => onNavigate('auth')} />
      <NavItem icon="polygon" label="Neighbourhoods" active={page === 'neighbourhoods'} onClick={() => onNavigate('neighbourhoods')} />
      <NavItem icon="search" label="BAN / Geo"       active={page === 'ban'}            onClick={() => onNavigate('ban')} />

      <div className="sidebar-footer">
        <div className="jwt-badge">
          <div className={`jwt-dot${jwt ? ' active' : ''}`} />
          <span className="jwt-label" title={jwt ?? ''}>
            {jwt ? jwt.substring(0, 20) + '…' : 'No token'}
          </span>
        </div>
        <button
          className="theme-btn"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title="Toggle theme"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </nav>
  )
}

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`nav-item${active ? ' active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <NavIcon name={icon} />
      <span>{label}</span>
    </button>
  )
}

function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    lock: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    polygon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="3 11 22 2 13 21 11 13 3 11"/>
      </svg>
    ),
    search: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
  }
  return <>{icons[name] ?? null}</>
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}
