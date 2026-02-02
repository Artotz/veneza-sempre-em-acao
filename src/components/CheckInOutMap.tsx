import { useMemo, useState, useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { Appointment } from "../lib/types";

type MapPointKind = "checkin" | "checkout";

type MapPoint = {
  id: string;
  label: string;
  position: [number, number];
  kind: MapPointKind;
};

type CheckInOutMapProps = {
  appointments: Appointment[];
  getLabel?: (appointment: Appointment, kind: MapPointKind) => string;
  heightClass?: string;
  emptyMessage?: string;
  emptyFilteredMessage?: string;
};

const markerIconOptions = {
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
} as const;

const checkInMarkerIcon = L.icon({
  ...markerIconOptions,
  className: "leaflet-marker-icon--checkin",
});

const checkOutMarkerIcon = L.icon({
  ...markerIconOptions,
  className: "leaflet-marker-icon--checkout",
});

const mapMarkerIcons: Record<MapPointKind, L.Icon> = {
  checkin: checkInMarkerIcon,
  checkout: checkOutMarkerIcon,
};

const MapFitBounds = ({ points }: { points: MapPoint[] }) => {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((point) => point.position));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
  }, [map, points]);

  return null;
};

export const CheckInOutMap = ({
  appointments,
  getLabel,
  heightClass = "h-64",
  emptyMessage = "Sem coordenadas para exibir no mapa.",
  emptyFilteredMessage = "Nenhum pino visivel com os filtros atuais.",
}: CheckInOutMapProps) => {
  const [showCheckInMarker, setShowCheckInMarker] = useState(true);
  const [showCheckOutMarker, setShowCheckOutMarker] = useState(true);

  const mapPoints = useMemo(() => {
    const points: MapPoint[] = [];
    const pushPoint = (
      appointment: Appointment,
      kind: MapPointKind,
      lat?: number | null,
      lng?: number | null
    ) => {
      if (lat == null || lng == null) return;
      const latNumber = Number(lat);
      const lngNumber = Number(lng);
      if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber)) return;
      const fallbackLabel = kind === "checkin" ? "Check-in" : "Check-out";
      points.push({
        id: `${appointment.id}-${kind}`,
        label: getLabel ? getLabel(appointment, kind) : fallbackLabel,
        position: [latNumber, lngNumber],
        kind,
      });
    };

    appointments.forEach((appointment) => {
      pushPoint(
        appointment,
        "checkin",
        appointment.checkInLat,
        appointment.checkInLng
      );
      pushPoint(
        appointment,
        "checkout",
        appointment.checkOutLat,
        appointment.checkOutLng
      );
    });

    return points;
  }, [appointments, getLabel]);

  const filteredMapPoints = useMemo(
    () =>
      mapPoints.filter((point) => {
        if (point.kind === "checkin") return showCheckInMarker;
        return showCheckOutMarker;
      }),
    [mapPoints, showCheckInMarker, showCheckOutMarker]
  );

  const hasMapPoints = mapPoints.length > 0;
  const hasFilteredMapPoints = filteredMapPoints.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowCheckInMarker((current) => !current)}
          className={`rounded-full border px-3 py-1 text-[10px] font-semibold transition ${
            showCheckInMarker
              ? "border-success/50 bg-success/10 text-success"
              : "border-border bg-white text-foreground-soft"
          }`}
        >
          Check-in
        </button>
        <button
          type="button"
          onClick={() => setShowCheckOutMarker((current) => !current)}
          className={`rounded-full border px-3 py-1 text-[10px] font-semibold transition ${
            showCheckOutMarker
              ? "border-info/50 bg-info/10 text-info"
              : "border-border bg-white text-foreground-soft"
          }`}
        >
          Check-out
        </button>
      </div>

      {hasFilteredMapPoints ? (
        <div className="relative z-0 overflow-hidden rounded-2xl border border-border">
          <MapContainer
            center={filteredMapPoints[0].position}
            zoom={13}
            scrollWheelZoom={false}
            className={`${heightClass} w-full`}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapFitBounds points={filteredMapPoints} />
            {filteredMapPoints.map((point) => (
              <Marker
                key={point.id}
                position={point.position}
                icon={mapMarkerIcons[point.kind]}
              >
                <Popup>
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-foreground">{point.label}</p>
                    <p className="text-foreground-muted">
                      {point.position[0].toFixed(5)}, {point.position[1].toFixed(5)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
          {hasMapPoints ? emptyFilteredMessage : emptyMessage}
        </div>
      )}
    </div>
  );
};
