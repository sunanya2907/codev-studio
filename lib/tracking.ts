// Support for GPS / live-tracking / fleet / delivery / asset apps.
//
// 1. isTrackingIdea()  - detects such an idea from the user's prompt.
// 2. *_ADDENDUM        - extra rules appended to each agent's prompt (data model, ingest API,
//                        live polling, geofences, trips, security, map usage).
// 3. Fixed files       - written by code, NOT by the AI, so they always work:
//      components/LiveMap.tsx   real map (Leaflet + OpenStreetMap, loaded from a CDN, no npm package)
//      lib/geo.ts               distance / bearing / geofence maths
//      scripts/simulate-device.mjs  fake GPS device for testing the live map
//
// NOTE: everything here is plain string constants with no backticks or ${ } inside the file
// bodies, so they can be embedded safely with String.raw.
import { parseFiles, serializeFiles, type GenFile } from "@/lib/files";

const TRACKING_RE =
  /\b(gps|track(?:er|ers|ing)?|fleet|geofenc\w*|live location|real[- ]time location|vehicle|vehicles|telematics|geolocation|asset tracking|delivery (?:app|tracking|driver)|ride[- ]?(?:hailing|share)|taxi|courier|dispatch|find my|child tracker|pet tracker|live map)\b/i;

export const isTrackingIdea = (idea: string) => TRACKING_RE.test(idea);

// ---------------------------------------------------------------- prompt addenda

const SHARED_MODEL = `
TRACKING / GPS RULES (this app is a live-tracking system):
Entities (use these names unless the idea clearly needs more): Device (id, name, type, apiKeyHash, ownerId -> User, status ONLINE|OFFLINE|MOVING|IDLE, lastLat, lastLng, lastSpeed, lastHeading, lastBattery, lastSeenAt), LocationPoint (id, deviceId, lat, lng, speed km/h, heading deg, accuracy m, battery %, recordedAt, createdAt; index on [deviceId, recordedAt]), Trip (id, deviceId, startedAt, endedAt, distanceMeters, maxSpeed), Geofence (id, ownerId, name, centerLat, centerLng, radiusMeters), Alert (id, deviceId, type GEOFENCE_ENTER|GEOFENCE_EXIT|SPEEDING|OFFLINE|LOW_BATTERY, message, acknowledged, createdAt). Coordinates are Float; do NOT use PostGIS or any geo extension.
Endpoints (names are part of the contract):
- POST /api/ingest : used by the tracker device or phone. Auth is a per-device key in the header x-device-key (NOT the user login). Body { lat, lng, speed?, heading?, accuracy?, battery?, recordedAt? }. Returns { ok: true }.
- GET /api/live : the latest position, speed, status and battery of every device of the logged-in user (one call, used by the live map every few seconds).
- GET /api/devices/[id]/history?from=&to= : LocationPoint list for the route replay.
- Devices CRUD (create returns the plain device key ONCE), Geofences CRUD, GET /api/alerts, PATCH /api/alerts/[id].
Live updates use POLLING of GET /api/live every 3 to 5 seconds (serverless hosting cannot keep WebSockets open).`;

export const SRS_TRACKING_ADDENDUM = `\n${SHARED_MODEL}
In the SRS: include FRs for live map, device registration with API key, route history replay, geofence alerts, speed alerts, offline detection (no point for 5 minutes), trip detection, and a "use this phone as a tracker" page. Pages must include: "/" (dashboard with live map + device list), "/devices", "/devices/[id]" (live position, history replay, trips), "/geofences", "/alerts", "/track" (phone tracker). Non-functional: ingest endpoint must handle bursts, validate coordinates, rate-limit per device, location history retention policy, and a privacy note (location data is personal data; consent required).`;

export const FRONTEND_TRACKING_ADDENDUM = `\n${SHARED_MODEL}

MAP: a ready-made map component ALREADY EXISTS at components/LiveMap.tsx. Do NOT write that file and do NOT import any map package (no leaflet, no google maps). Use it exactly like this:
  import LiveMap from "@/components/LiveMap";
  <LiveMap className="h-[480px] w-full rounded-xl" markers={[{ id, lat, lng, label, color, heading, selected }]} paths={[{ id, points: [[lat,lng],...], color }]} zones={[{ id, lat, lng, radius, label, color }]} fitKey={someValue} onMarkerClick={(id) => ...} onMapClick={(lat, lng) => ...} />
(markers move smoothly when their lat/lng change; fitKey re-fits the view when it changes; zones are geofence circles with radius in meters; onMapClick is used to pick a geofence centre.)
LIVE: the dashboard polls GET /api/live every 4 seconds with setInterval inside useEffect (clear it on unmount; pause while document.hidden). Show status badges, speed, battery, "last seen 12s ago" (updates every second), and a clear OFFLINE state.
DEMO MODE (important): when fetch fails (preview has no backend), run a local simulation: 4 to 6 demo vehicles driving along plausible routes around a real city, updating every 2 seconds, so the map visibly moves; one demo geofence; a few demo alerts. Keep the real fetch calls in lib/api.ts.
HISTORY REPLAY: /devices/[id] draws the route with paths, has a time slider + play/pause that moves one marker along the route, and shows distance, max speed and duration.
PHONE TRACKER page /track: a ready-made helper ALREADY EXISTS at lib/native-location.ts (do NOT write it): import { startLocationSharing } from "@/lib/native-location"; const stop = await startLocationSharing((p) => send(p), (msg) => setError(msg)); where p is { lat, lng, speed (km/h), heading, accuracy } and stop() ends sharing. It uses the background GPS of the Android app when the site runs inside the Capacitor APK, and the browser's navigator.geolocation otherwise. The page has a "Start sharing my location" button and a Stop button, shows accuracy, last sent time and a visible "sharing" indicator, POSTs each point to /api/ingest with header x-device-key from an input field (keep it in React state, not localStorage), handles permission denied, explains that in a normal browser the page must stay open, and explains the consent clearly.
Never log or display other users' devices. Handle empty states (no devices yet: show how to add one and the key).`;

export const BACKEND_TRACKING_ADDENDUM = `\n${SHARED_MODEL}

HELPERS THAT ALREADY EXIST (do not write them): lib/geo.ts exports haversineMeters(aLat,aLng,bLat,bLng), bearingDegrees(aLat,aLng,bLat,bLng), isInsideCircle(lat,lng,centerLat,centerLng,radiusMeters), isValidCoord(lat,lng), pathDistanceMeters(points: {lat:number;lng:number}[]), speedKmh(meters, seconds). Import from "@/lib/geo".
INGEST (app/api/ingest/route.ts), in this order: read x-device-key; hash it with Node's built-in crypto (createHash("sha256")) and look the Device up by apiKeyHash (return 401 if unknown, never reveal which part was wrong); validate the body with zod (lat -90..90, lng -180..180, speed >= 0 and < 500, recordedAt not more than 24h old or 5 minutes in the future, default now); reject exact duplicates and points that imply an impossible jump (> 300 km/h from the last point) with 422; save the LocationPoint; update the Device last* fields and status (MOVING if speed > 3, else IDLE); compare with the previous position for each of the owner's Geofences and create an Alert on ENTER/EXIT; create a SPEEDING alert if speed is over the limit (default 100 km/h) and a LOW_BATTERY alert when battery < 15 (at most one open alert of each type per device per hour). Also accept an array of up to 100 points for devices that upload in batches. Add a simple in-memory rate limit per device (e.g. 120 requests per minute) returning 429.
OFFLINE: in GET /api/live, mark a device OFFLINE if lastSeenAt is older than 5 minutes (do not need a cron job) and create the OFFLINE alert once.
LIVE: GET /api/live returns { devices: [...], serverTime } for the logged-in user only, with no history (cheap query, select only the needed fields).
HISTORY: GET /api/devices/[id]/history verifies the device belongs to the user, limits the range (max 7 days, max 5000 points, ordered by recordedAt asc) and returns { points, distanceMeters, maxSpeed }.
Device creation generates a random key with crypto.randomBytes(24).toString("base64url"), stores ONLY its sha256 hash, and returns the plain key once in the response. Never log keys or coordinates. Everything except /api/ingest requires the logged-in user and is scoped to that user's devices.
A device simulator script already exists, do not write one.`;

export const DATABASE_TRACKING_ADDENDUM = `\n${SHARED_MODEL}
Add @@index([deviceId, recordedAt]) on LocationPoint, @@index([ownerId]) on Device, @unique on Device.apiKeyHash, onDelete: Cascade from Device to LocationPoint/Trip/Alert, and enums for status and alert type.`;

export const QA_TRACKING_ADDENDUM = `
Also check this live-tracking system specifically: (1) /api/ingest authenticates by hashed device key and validates coordinates and impossible jumps; (2) no route lets one user see another user's devices or history; (3) device keys are shown once and stored hashed; (4) the dashboard polls /api/live and cleans up its timer; (5) LiveMap is used from "@/components/LiveMap" and no map package is imported; (6) database indexes exist for deviceId + recordedAt; (7) location-history retention and privacy/consent are addressed; (8) rate limiting on ingest; (9) the offline/geofence/speed alert logic exists. Mention that live updates are polling-based and that very large fleets need a dedicated realtime service.`;

// ---------------------------------------------------------------- fixed files

const LIVE_MAP = String.raw`"use client";
// Live map (Leaflet + OpenStreetMap). Leaflet is loaded from a CDN when the map first mounts,
// so no npm package is needed. Markers move smoothly when their lat/lng change.
import { useEffect, useRef, useState } from "react";

export type MapMarker = { id: string; lat: number; lng: number; label?: string; color?: string; heading?: number; selected?: boolean };
export type MapPath = { id: string; points: [number, number][]; color?: string };
export type MapZone = { id: string; lat: number; lng: number; radius: number; label?: string; color?: string };

type Props = {
  markers?: MapMarker[];
  paths?: MapPath[];
  zones?: MapZone[];
  center?: [number, number];
  zoom?: number;
  fitKey?: string | number;
  dark?: boolean;
  className?: string;
  onMarkerClick?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
};

const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js";
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css";

let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L && w.L.map) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    if (!document.getElementById("livemap-dark-css")) {
      const st = document.createElement("style");
      st.id = "livemap-dark-css";
      st.textContent =
        ".livemap-dark .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.95) contrast(.9)}" +
        ".livemap-pin{width:22px;height:22px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.5);position:relative}" +
        ".livemap-pin.sel{box-shadow:0 0 0 4px rgba(250,204,21,.9),0 2px 6px rgba(0,0,0,.5)}" +
        ".livemap-arrow{position:absolute;left:50%;top:-9px;margin-left:-5px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid currentColor}";
      document.head.appendChild(st);
    }
    const s = document.createElement("script");
    s.src = LEAFLET_JS;
    s.async = true;
    s.onload = () => ((window as any).L ? resolve((window as any).L) : reject(new Error("Leaflet missing")));
    s.onerror = () => {
      leafletPromise = null;
      reject(new Error("Could not load the map library"));
    };
    document.head.appendChild(s);
  });
  return leafletPromise;
}

export default function LiveMap(props: Props) {
  const { markers = [], paths = [], zones = [], center, zoom = 13, fitKey, dark = true, className, onMarkerClick, onMapClick } = props;
  const box = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const pins = useRef<Record<string, any>>({});
  const overlay = useRef<any>(null);
  const fitted = useRef<string | number | null | undefined>(undefined);
  const clickRef = useRef(onMarkerClick);
  const mapClickRef = useRef(onMapClick);
  clickRef.current = onMarkerClick;
  mapClickRef.current = onMapClick;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState("");

  // create the map once
  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null;
    loadLeaflet()
      .then((L) => {
        if (dead || !box.current || map.current) return;
        const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(center || [20, 0], center ? zoom : 2);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(m);
        overlay.current = L.layerGroup().addTo(m);
        m.on("click", (e: any) => mapClickRef.current && mapClickRef.current(e.latlng.lat, e.latlng.lng));
        map.current = m;
        if (typeof ResizeObserver !== "undefined" && box.current) {
          ro = new ResizeObserver(() => m.invalidateSize());
          ro.observe(box.current);
        }
        setReady(true);
      })
      .catch((e) => !dead && setFailed(String((e && e.message) || e)));
    return () => {
      dead = true;
      if (ro) ro.disconnect();
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      pins.current = {};
      overlay.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // draw markers (updated in place so they glide), paths and zones
  useEffect(() => {
    const L = (window as any).L;
    const m = map.current;
    if (!ready || !L || !m) return;

    const seen: Record<string, boolean> = {};
    markers.forEach((mk) => {
      if (typeof mk.lat !== "number" || typeof mk.lng !== "number") return;
      seen[mk.id] = true;
      const color = mk.color || "#22c55e";
      const arrow = typeof mk.heading === "number"
        ? '<div class="livemap-arrow" style="color:' + color + ";transform:rotate(" + Math.round(mk.heading) + 'deg);transform-origin:5px 20px"></div>'
        : "";
      const html = '<div class="livemap-pin' + (mk.selected ? " sel" : "") + '" style="background:' + color + '">' + arrow + "</div>";
      const icon = L.divIcon({ html, className: "", iconSize: [22, 22], iconAnchor: [11, 11] });
      let pin = pins.current[mk.id];
      if (!pin) {
        pin = L.marker([mk.lat, mk.lng], { icon }).addTo(m);
        pin.on("click", () => clickRef.current && clickRef.current(mk.id));
        pins.current[mk.id] = pin;
      } else {
        pin.setLatLng([mk.lat, mk.lng]);
        pin.setIcon(icon);
      }
      if (mk.label) {
        const el = document.createElement("span");
        el.textContent = mk.label; // textContent: labels can never inject HTML
        pin.unbindTooltip();
        pin.bindTooltip(el, { direction: "top", offset: [0, -12] });
      }
    });
    Object.keys(pins.current).forEach((id) => {
      if (!seen[id]) {
        m.removeLayer(pins.current[id]);
        delete pins.current[id];
      }
    });

    overlay.current.clearLayers();
    zones.forEach((z) => {
      const c = L.circle([z.lat, z.lng], { radius: z.radius, color: z.color || "#38bdf8", weight: 2, fillOpacity: 0.12 });
      if (z.label) {
        const el = document.createElement("span");
        el.textContent = z.label;
        c.bindTooltip(el);
      }
      c.addTo(overlay.current);
    });
    paths.forEach((p) => {
      if (p.points && p.points.length > 1) L.polyline(p.points, { color: p.color || "#3b82f6", weight: 4, opacity: 0.85 }).addTo(overlay.current);
    });

    // fit the view the first time there is something to show, and whenever fitKey changes
    const pts: [number, number][] = [];
    markers.forEach((mk) => pts.push([mk.lat, mk.lng]));
    paths.forEach((p) => (p.points || []).forEach((q) => pts.push(q)));
    const key = fitKey === undefined ? "first" : fitKey;
    if (pts.length && fitted.current !== key) {
      fitted.current = key;
      if (pts.length === 1) m.setView(pts[0], Math.max(zoom, 15));
      else m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
    }
  });

  if (failed) {
    return (
      <div className={className} style={{ minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, padding: 16, background: "#0f172a", color: "#cbd5e1", borderRadius: 12, fontSize: 13 }}>
        <strong>The map could not load ({failed}).</strong>
        <span>Check the internet connection or an ad blocker. Current positions:</span>
        {markers.slice(0, 8).map((mk) => (
          <span key={mk.id}>{(mk.label || mk.id) + ": " + mk.lat.toFixed(5) + ", " + mk.lng.toFixed(5)}</span>
        ))}
      </div>
    );
  }
  return <div ref={box} className={(dark ? "livemap-dark " : "") + (className || "")} style={{ minHeight: 240, background: "#0f172a" }} />;
}
`;

const NATIVE_LOCATION = String.raw`// Location sharing for the /track page.
// Inside the Capacitor Android app it uses the background-geolocation plugin (keeps working with the
// screen off, shows a notification). In a normal browser it falls back to navigator.geolocation
// (only works while the page is open).
export type SharedPoint = { lat: number; lng: number; speed: number; heading: number; accuracy: number };

export async function startLocationSharing(
  onPoint: (p: SharedPoint) => void,
  onError: (message: string) => void
): Promise<() => void> {
  const cap = typeof window !== "undefined" ? (window as any).Capacitor : null;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());

  if (native) {
    try {
      const BG = cap.registerPlugin ? cap.registerPlugin("BackgroundGeolocation") : cap.Plugins.BackgroundGeolocation;
      const id: string = await BG.addWatcher(
        {
          backgroundTitle: "Location sharing is on",
          backgroundMessage: "Your location is being shared. Open the app to stop.",
          requestPermissions: true,
          stale: false,
          distanceFilter: 10,
        },
        (loc: any, err: any) => {
          if (err) {
            onError(err.code === "NOT_AUTHORIZED" ? "Location permission was denied. Allow location (always) in the phone settings." : String(err.message || err));
            return;
          }
          if (!loc) return;
          onPoint({
            lat: loc.latitude,
            lng: loc.longitude,
            speed: Math.max(0, (loc.speed || 0) * 3.6),
            heading: loc.bearing || 0,
            accuracy: loc.accuracy || 0,
          });
        }
      );
      return () => {
        try { BG.removeWatcher({ id }); } catch (e) { /* ignore */ }
      };
    } catch (e: any) {
      onError(String((e && e.message) || e));
      return () => {};
    }
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError("This device does not support location.");
    return () => {};
  }
  const watch = navigator.geolocation.watchPosition(
    (pos) =>
      onPoint({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speed: Math.max(0, (pos.coords.speed || 0) * 3.6),
        heading: pos.coords.heading || 0,
        accuracy: pos.coords.accuracy || 0,
      }),
    (err) => onError(err.code === 1 ? "Location permission was denied." : err.message || "Could not get the location."),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
  return () => navigator.geolocation.clearWatch(watch);
}
`;

const GEO = String.raw`// Small geo helpers (no dependencies). Distances in metres, speeds in km/h, angles in degrees.
const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function isValidCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDegrees(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const y = Math.sin(rad(bLng - aLng)) * Math.cos(rad(bLat));
  const x = Math.cos(rad(aLat)) * Math.sin(rad(bLat)) - Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(rad(bLng - aLng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function isInsideCircle(lat: number, lng: number, centerLat: number, centerLng: number, radiusMeters: number): boolean {
  return haversineMeters(lat, lng, centerLat, centerLng) <= radiusMeters;
}

export function pathDistanceMeters(points: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  return total;
}

export function speedKmh(meters: number, seconds: number): number {
  return seconds > 0 ? (meters / seconds) * 3.6 : 0;
}
`;

const SIMULATOR = String.raw`// Fake GPS device for testing the live map.
//   BASE_URL=http://localhost:3000 DEVICE_KEY=<key shown when you create a device> node scripts/simulate-device.mjs
// Optional: START_LAT, START_LNG (default: Bengaluru), INTERVAL_MS (default 2000).
const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const key = process.env.DEVICE_KEY;
if (!key) {
  console.error("Set DEVICE_KEY to the key shown when you created the device.");
  process.exit(1);
}
let lat = Number(process.env.START_LAT || 12.9716);
let lng = Number(process.env.START_LNG || 77.5946);
let heading = Math.random() * 360;
let battery = 100;
const every = Number(process.env.INTERVAL_MS || 2000);

async function tick() {
  heading = (heading + (Math.random() - 0.5) * 30 + 360) % 360;
  const speed = 20 + Math.random() * 40; // km/h
  const meters = (speed / 3.6) * (every / 1000);
  lat += (meters * Math.cos((heading * Math.PI) / 180)) / 111320;
  lng += (meters * Math.sin((heading * Math.PI) / 180)) / (111320 * Math.cos((lat * Math.PI) / 180));
  battery = Math.max(5, battery - 0.05);
  try {
    const res = await fetch(base + "/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-key": key },
      body: JSON.stringify({ lat, lng, speed: Math.round(speed), heading: Math.round(heading), accuracy: 8, battery: Math.round(battery), recordedAt: new Date().toISOString() }),
    });
    console.log(new Date().toISOString(), res.status, lat.toFixed(5), lng.toFixed(5));
  } catch (e) {
    console.error("send failed:", e.message);
  }
}
setInterval(tick, every);
tick();
`;

/** Add the fixed tracking files to the generated frontend / backend blobs when they are used. */
export function addTrackingFrontendFiles(frontend: string): string {
  const files = parseFiles(frontend, "app/page.tsx");
  if (!files.length) return frontend;
  const uses = (re: RegExp) => files.some((f) => re.test(f.content));
  const has = (path: string) => files.some((f) => f.path === path);
  const next: GenFile[] = [...files];
  if (uses(/@\/components\/LiveMap/) && !has("components/LiveMap.tsx")) next.push({ path: "components/LiveMap.tsx", content: LIVE_MAP });
  if (uses(/@\/lib\/native-location/) && !has("lib/native-location.ts")) next.push({ path: "lib/native-location.ts", content: NATIVE_LOCATION });
  return next.length === files.length ? frontend : serializeFiles(next);
}

export function addTrackingBackendFiles(backend: string): string {
  const files = parseFiles(backend, "app/api/route.ts");
  if (!files.length) return backend;
  const next: GenFile[] = [...files];
  if (!files.some((f) => f.path === "lib/geo.ts")) next.push({ path: "lib/geo.ts", content: GEO });
  if (!files.some((f) => f.path === "scripts/simulate-device.mjs")) next.push({ path: "scripts/simulate-device.mjs", content: SIMULATOR });
  return serializeFiles(next);
}
