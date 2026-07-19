import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Athlete } from '../domain/athlete'

export function AthleteMap({ athletes }: { athletes: Athlete[] }) {
  const located = athletes.filter((athlete) => athlete.location)

  return (
    <section className="map-view" aria-labelledby="map-title">
      <div className="view-intro">
        <div>
          <p className="section-heading__eyebrow">Verified club locations</p>
          <h2 id="map-title">Athlete locations</h2>
        </div>
        <p>{located.length} mapped</p>
      </div>
      <div className="map-frame">
        <MapContainer center={[43, -35]} zoom={2} scrollWheelZoom className="athlete-map">
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          />
          {located.map((athlete) => (
            <CircleMarker
              key={athlete.id}
              center={[athlete.location!.lat, athlete.location!.lng]}
              radius={9}
              pathOptions={{ color: '#070708', weight: 3, fillColor: '#f5d878', fillOpacity: 1 }}
            >
              <Popup>
                <strong>{athlete.name.en}</strong><br />
                {athlete.team}<br />
                {athlete.location!.city}, {athlete.location!.country}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </section>
  )
}
