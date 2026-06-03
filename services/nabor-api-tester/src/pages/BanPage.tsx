import { useState, useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import { useApi } from '../hooks/useApi'
import { useAppContext } from '../context/AppContext'
import { Card } from '../components/Card'
import { ResponseBox, type ResponseState } from '../components/ResponseBox'
import { Spinner } from '../components/Spinner'
import axios from 'axios'

interface Suggestion {
  label: string
  lat: number
  lng: number
  city: string
  postcode: string
}

type ResolveResult = {
  address: string
  lat: number
  lng: number
  neighbourhoodId: string
  method: string
} | null

type R = { data: unknown; status: number; state: ResponseState } | null
const PALETTE = ['#4f98a3','#6daa45','#bb653b','#5591c7','#d163a7','#dd6974','#e8af34']

export function BanPage() {
  const { appState } = useAppContext()
  const api = useApi()
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const neighLayersRef = useRef<L.Layer[]>([])

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [autocompleteLoading, setAutocompleteLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [resolveResult, setResolveResult] = useState<ResolveResult>(null)
  const [resolveLoading, setResolveLoading] = useState(false)

  const [assignResult, setAssignResult] = useState<R>(null)
  const [assignLoading, setAssignLoading] = useState(false)

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return
    const map = L.map(mapRef.current).setView([48.8566, 2.3522], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19
    }).addTo(map)
    leafletRef.current = map

    // Load neighbourhood overlays on init
    loadNeighbourhoods(map)
    return () => { map.remove(); leafletRef.current = null }
  }, [])

  async function loadNeighbourhoods(map: L.Map) {
    const res = await api.get('/admin/neighbourhoods')
    if (!res.ok) return
    const items = Array.isArray(res.data)
      ? res.data
      : ((res.data as Record<string, unknown[]>)?.data || (res.data as Record<string, unknown[]>)?.features || [])
    neighLayersRef.current.forEach(l => map.removeLayer(l))
    neighLayersRef.current = [];
    (items as unknown[]).forEach((item, i) => {
      const f = item as { geometry?: object; type?: string }
      if (f.geometry || f.type === 'Feature') {
        const layer = L.geoJSON(item as GeoJSON.GeoJsonObject, {
          style: { color: PALETTE[i % PALETTE.length], weight: 2, fillOpacity: 0.1 },
          onEachFeature: (feature, layer) => {
            const name = (feature.properties as Record<string,string> || {}).name || 'Neighbourhood'
            layer.bindPopup(`<b>${name}</b>`)
          }
        })
        layer.addTo(map)
        neighLayersRef.current.push(layer)
      }
    })
  }

  const fetchSuggestions = useCallback(async (q: string) => {
    setAutocompleteLoading(true)
    // Try your backend first, fall back to BAN directly
    const res = await api.get<unknown>(`/geo/autocomplete?q=${encodeURIComponent(q)}`)
    if (res.ok) {
      const items = Array.isArray(res.data)
        ? res.data
        : ((res.data as Record<string, unknown[]>)?.features || [])
      setSuggestions((items as unknown[]).slice(0, 8).map((item) => {
        const it = item as Record<string, unknown>
        const props = (it.properties || it) as Record<string, string>
        const coords = (it.geometry as Record<string, number[]>)?.coordinates || []
        return {
          label: props.label || props.name || props.display_name || '',
          lat: parseFloat(props.lat) || coords[1] || 0,
          lng: parseFloat(props.lon || props.lng) || coords[0] || 0,
          city: props.city || props.municipality || '',
          postcode: props.postcode || '',
        }
      }))
    } else {
      // Direct BAN fallback
      try {
        const banRes = await axios.get('https://api-adresse.data.gouv.fr/search/', { params: { q, limit: 8 } })
        const features = banRes.data.features || []
        setSuggestions(features.map((f: Record<string, Record<string, unknown>>) => ({
          label: String(f.properties.label || ''),
          lat: (f.geometry.coordinates as number[])[1],
          lng: (f.geometry.coordinates as number[])[0],
          city: String(f.properties.city || ''),
          postcode: String(f.properties.postcode || ''),
        })))
      } catch { setSuggestions([]) }
    }
    setAutocompleteLoading(false)
    setShowDropdown(true)
  }, [api])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 3) { setSuggestions([]); setShowDropdown(false); return }
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 300)
  }

  async function selectSuggestion(s: Suggestion) {
    setQuery(s.label)
    setShowDropdown(false)
    setSuggestions([])

    // Place marker
    const map = leafletRef.current
    if (map) {
      if (markerRef.current) map.removeLayer(markerRef.current)
      markerRef.current = L.marker([s.lat, s.lng]).addTo(map).bindPopup(s.label).openPopup()
      map.setView([s.lat, s.lng], 15)
    }

    // Resolve neighbourhood
    setResolveLoading(true)
    setResolveResult(null)
    const res = await api.get(`/geo/resolve-neighbourhood?lat=${s.lat}&lng=${s.lng}`)
    setResolveLoading(false)
    if (res.ok) {
      const d = res.data as Record<string, string>
      setResolveResult({
        address: s.label,
        lat: s.lat,
        lng: s.lng,
        neighbourhoodId: d.neighbourhoodId || d.neighbourhood_id || d.id || '—',
        method: d.method || d.resolution_method || 'unknown',
      })
    } else {
      setResolveResult({ address: s.label, lat: s.lat, lng: s.lng, neighbourhoodId: '—', method: 'no-match' })
    }
  }

  async function handleAssign() {
    if (!appState.jwt) { setAssignResult({ data: 'Login required.', status: 0, state: 'warning' }); return }
    if (!resolveResult?.neighbourhoodId || resolveResult.neighbourhoodId === '—') return
    setAssignLoading(true)
    const res = await api.patch('/users/me', { neighbourhoodId: resolveResult.neighbourhoodId })
    setAssignLoading(false)
    setAssignResult({ data: res.data, status: res.status, state: res.ok ? 'success' : 'error' })
  }

  function methodClass(m: string) {
    if (m.includes('polygon') || m.includes('intersection')) return 'method-polygon'
    if (m.includes('centroid') || m.includes('nearest')) return 'method-centroid'
    return 'method-none'
  }

  return (
    <section aria-labelledby="ban-title">
      <div className="page-header">
        <h1 className="page-title" id="ban-title">BAN Autocomplete & Geo Resolver</h1>
        <p className="page-desc">Search real French addresses, pin them on the map, and resolve their neighbourhood from Neo4j.</p>
      </div>

      <Card title={<><SearchIcon /> Address Search</>} badge="GET /geo/autocomplete">
        <div className="form-group autocomplete-wrapper">
          <label className="form-label" htmlFor="ban-input">Type an address</label>
          <div style={{ position: 'relative' }}>
            <input
              id="ban-input"
              type="search"
              className="form-input"
              value={query}
              onChange={handleInputChange}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              placeholder="12 rue de Rivoli, Paris"
              autoComplete="off"
              spellCheck={false}
            />
            {autocompleteLoading && (
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                <Spinner />
              </span>
            )}
            {showDropdown && suggestions.length > 0 && (
              <div className="autocomplete-dropdown" role="listbox" aria-label="Address suggestions">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    className="dropdown-item"
                    role="option"
                    onMouseDown={() => selectSuggestion(s)}
                  >
                    <svg className="dropdown-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <div>
                      <div className="dropdown-item-label">{s.label}</div>
                      <div className="dropdown-item-meta">{[s.city, s.postcode].filter(Boolean).join(' · ')}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div ref={mapRef} style={{ height: 420, borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden', marginTop: 'var(--space-4)' }} />
      </Card>

      {(resolveLoading || resolveResult) && (
        <Card title={<><InfoIcon /> Neighbourhood Resolution</>} badge="GET /geo/resolve-neighbourhood">
          {resolveLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--color-text-muted)' }}>
              <Spinner /> Resolving neighbourhood…
            </div>
          )}
          {!resolveLoading && resolveResult && (
            <>
              <div className="resolution-result">
                <div className="kv"><span className="k">Address</span>   <span className="v">{resolveResult.address}</span></div>
                <div className="kv"><span className="k">Coordinates</span><span className="v">{resolveResult.lat.toFixed(6)}, {resolveResult.lng.toFixed(6)}</span></div>
                <div className="kv"><span className="k">Neighbourhood ID</span><span className="v">{resolveResult.neighbourhoodId}</span></div>
                <div className="kv">
                  <span className="k">Method</span>
                  <span className="v"><span className={`method-pill ${methodClass(resolveResult.method)}`}>{resolveResult.method}</span></span>
                </div>
              </div>
              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  onClick={handleAssign}
                  disabled={assignLoading || !appState.jwt || resolveResult.neighbourhoodId === '—'}
                >
                  {assignLoading ? <Spinner /> : <UserIcon />} Assign to My Profile
                </button>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', alignSelf: 'center' }}>PATCH /users/me</span>
              </div>
              {assignResult && <ResponseBox data={assignResult.data} status={assignResult.status} state={assignResult.state} />}
            </>
          )}
        </Card>
      )}
    </section>
  )
}

const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
const InfoIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
const UserIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
