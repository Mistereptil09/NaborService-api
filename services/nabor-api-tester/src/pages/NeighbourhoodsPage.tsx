import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet-draw'
import { useApi } from '../hooks/useApi'
import { useAppContext } from '../context/AppContext'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { ResponseBox, type ResponseState } from '../components/ResponseBox'
import { Spinner } from '../components/Spinner'

type R = { data: unknown; status: number; state: ResponseState } | null

const PALETTE = ['#4f98a3','#6daa45','#bb653b','#5591c7','#d163a7','#dd6974','#e8af34']

export function NeighbourhoodsPage() {
  const { appState } = useAppContext()
  const api = useApi()
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<L.Map | null>(null)
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const drawnLayerRef = useRef<L.Layer | null>(null)

  const [geojson, setGeojson] = useState('')
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [zip, setZip] = useState('')
  const [submitResult, setSubmitResult] = useState<R>(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [neighbourhoods, setNeighbourhoods] = useState<unknown[]>([])
  const [listLoading, setListLoading] = useState(false)

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return
    const map = L.map(mapRef.current).setView([46.6, 2.35], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19
    }).addTo(map)

    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    drawnItemsRef.current = drawnItems

    const drawControl = new (L.Control as unknown as Record<string, unknown>).Draw({
      edit: { featureGroup: drawnItems },
      draw: {
        polygon: { shapeOptions: { color: '#4f98a3', weight: 2, fillOpacity: 0.15 } },
        polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false
      }
    }) as L.Control
    map.addControl(drawControl)

    map.on((L as unknown as Record<string, Record<string, string>>).Draw.Event.CREATED as unknown as string, (e: unknown) => {
      const event = e as { layer: L.Layer & { toGeoJSON: () => object } }
      drawnItems.clearLayers()
      drawnLayerRef.current = event.layer
      drawnItems.addLayer(event.layer)
      setGeojson(JSON.stringify(event.layer.toGeoJSON(), null, 2))
    })

    leafletRef.current = map
    return () => { map.remove(); leafletRef.current = null }
  }, [])

  function overlayNeighbourhoods(items: unknown[]) {
    const map = leafletRef.current
    if (!map) return
    map.eachLayer(l => { if ((l as unknown as Record<string, boolean>)._nb_overlay) map.removeLayer(l) })
    items.forEach((item, i) => {
      const feature = item as { geometry?: object; type?: string }
      if (feature.geometry || feature.type === 'Feature') {
        const layer = L.geoJSON(item as GeoJSON.GeoJsonObject, {
          style: { color: PALETTE[i % PALETTE.length], weight: 2, fillOpacity: 0.1 }
        });
        (layer as unknown as Record<string, boolean>)._nb_overlay = true
        layer.addTo(map)
      }
    })
  }

  async function handleSubmit() {
    if (!appState.jwt) { setSubmitResult({ data: 'Admin JWT required.', status: 0, state: 'warning' }); return }
    if (!drawnLayerRef.current) { setSubmitResult({ data: 'Draw a polygon first.', status: 0, state: 'warning' }); return }
    if (!name || !city) { setSubmitResult({ data: 'Name and city are required.', status: 0, state: 'warning' }); return }
    const layer = drawnLayerRef.current as L.Layer & { toGeoJSON: () => { geometry: object } }
    const payload = { name, city, zipCode: zip, geometry: layer.toGeoJSON().geometry }
    setSubmitLoading(true)
    const res = await api.post('/admin/neighbourhoods', payload)
    setSubmitLoading(false)
    setSubmitResult({ data: res.data, status: res.status, state: res.ok ? 'success' : 'error' })
    if (res.ok) fetchNeighbourhoods()
  }

  function clearDrawing() {
    drawnItemsRef.current?.clearLayers()
    drawnLayerRef.current = null
    setGeojson('')
  }

  async function fetchNeighbourhoods() {
    setListLoading(true)
    const res = await api.get('/admin/neighbourhoods')
    setListLoading(false)
    if (res.ok) {
      const items = Array.isArray(res.data)
        ? res.data
        : ((res.data as Record<string, unknown[]>)?.data || (res.data as Record<string, unknown[]>)?.features || [])
      setNeighbourhoods(items)
      overlayNeighbourhoods(items)
    }
  }

  return (
    <section aria-labelledby="neigh-title">
      <div className="page-header">
        <h1 className="page-title" id="neigh-title">Neighbourhood Drawer</h1>
        <p className="page-desc">Draw a GeoJSON polygon on the map, attach metadata, and POST it to Neo4j.</p>
      </div>

      <Card title={<><PolygonIcon /> Draw a Polygon</>}>
        <p className="card-desc">Use the drawing toolbar on the map. Draw a polygon, then fill in the metadata below.</p>
        <div ref={mapRef} style={{ height: 420, borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden', marginTop: 'var(--space-4)' }} />
      </Card>

      <Card title={<><FileIcon /> Neighbourhood Metadata</>} badge="POST /admin/neighbourhoods">
        <div className="form-row">
          <FormField id="neigh-name" label="Name" value={name} onChange={setName} placeholder="Marais Nord" />
          <FormField id="neigh-city" label="City" value={city} onChange={setCity} placeholder="Paris" />
        </div>
        <FormField id="neigh-zip" label="ZIP Code" value={zip} onChange={setZip} placeholder="75004" maxLength={10} />
        <div className="form-group">
          <label className="form-label" htmlFor="drawn-geojson">Drawn GeoJSON</label>
          <textarea
            id="drawn-geojson"
            className="form-input"
            rows={5}
            value={geojson}
            readOnly
            placeholder="Draw a polygon on the map above…"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', resize: 'vertical' }}
          />
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitLoading}>
            {submitLoading ? <Spinner /> : <SendIcon />} Submit Neighbourhood
          </button>
          <button className="btn btn-ghost btn-sm" onClick={clearDrawing}>Clear Drawing</button>
        </div>
        {submitResult && <ResponseBox data={submitResult.data} status={submitResult.status} state={submitResult.state} />}
      </Card>

      <Card title={<><ListIcon /> Existing Neighbourhoods</>} badge="GET /admin/neighbourhoods">
        <div className="btn-row" style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}>
          <button className="btn btn-ghost btn-sm" onClick={fetchNeighbourhoods} disabled={listLoading}>
            {listLoading ? <Spinner /> : <RefreshIcon />} Refresh
          </button>
        </div>
        {neighbourhoods.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon"><ListIcon /></div>
            <p>Click Refresh to load neighbourhoods from the API.</p>
          </div>
        )}
        {neighbourhoods.map((item, i) => {
          const props = (item as Record<string, Record<string, string>>).properties || item as Record<string, string>
          return (
            <div key={i} className="neighbourhood-item">
              <div className="neighbourhood-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="neighbourhood-name">{props.name || props.id || 'Unnamed'}</span>
              <span className="neighbourhood-meta">{props.city || ''}{props.zipCode ? ` · ${props.zipCode}` : ''}</span>
            </div>
          )
        })}
      </Card>
    </section>
  )
}

const PolygonIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
const FileIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
const SendIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
const ListIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
const RefreshIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.35"/></svg>
