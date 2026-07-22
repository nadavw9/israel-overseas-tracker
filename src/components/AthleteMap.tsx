import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Athlete } from '../domain/athlete'
import { useI18n } from '../i18n/context'

type AthleteMapProps = {
  athletes: Athlete[]
  onOpen: (athlete: Athlete) => void
}

export function AthleteMap({ athletes, onOpen }: AthleteMapProps) {
  const located = athletes.filter((athlete) => athlete.location)
  const { locale, messages } = useI18n()

  return (
    <section className="map-view" aria-labelledby="map-title">
      <div className="view-intro">
        <div>
          <p className="section-heading__eyebrow">{messages.mapKicker}</p>
          <h2 id="map-title">{messages.mapTitle}</h2>
        </div>
        <p>{messages.mapped(located.length)}</p>
      </div>
      <div className="map-location-list" aria-label={messages.mapLocations}>
        {located.map((athlete) => (
          <button
            key={athlete.id}
            type="button"
            onClick={() => onOpen(athlete)}
            aria-label={messages.openMapAthlete(athlete.name[locale])}
          >
            <strong>{athlete.name[locale]}</strong>
            <span>{athlete.location!.city}</span>
          </button>
        ))}
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
                <div dir={locale === 'he' ? 'rtl' : 'ltr'}>
                  <strong>{athlete.name[locale]}</strong><br />
                  {athlete.team}<br />
                  {athlete.location!.city}, {athlete.location!.country}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </section>
  )
}
