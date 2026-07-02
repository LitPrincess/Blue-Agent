import { ItineraryItem } from "../types";
import { resolveMapPoint } from "./geoCoords";
import { resolveNodeType } from "./nodeUtils";

export type MapMarkerPayload = {
  id: string;
  lng: number;
  lat: number;
  icon: string;
  title: string;
  time: string;
  location: string;
  nodeType: "hard_anchor" | "semi_anchor" | "soft_task";
  editable: boolean;
};

const MAP_BOOT = `
  window.mapApi = {
    zoomIn: function() { if (window.__map) window.__map.zoomIn(); },
    zoomOut: function() { if (window.__map) window.__map.zoomOut(); },
    fitView: function() { if (window.__map && window.__markerInstances) window.__map.setFitView(window.__markerInstances, false, [50, 50, 50, 50]); },
  };
`;

export function buildAmapHtml(apiKey: string, markers: MapMarkerPayload[], center: { lng: number; lat: number }) {
  const markerJson = JSON.stringify(markers);
  const centerJson = JSON.stringify(center);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #e8f4ff; touch-action: none; }
    .cartoon-marker { display: flex; flex-direction: column; align-items: center; width: 72px; cursor: grab; }
    .marker-bubble {
      width: 46px; height: 46px; border-radius: 18px;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; box-shadow: 0 8px 18px rgba(40,124,255,0.28);
      border: 3px solid #fff; position: relative;
    }
    .hard_anchor .marker-bubble { background: linear-gradient(135deg, #287cff, #1b63ff); transform: rotate(-4deg); }
    .semi_anchor .marker-bubble { background: linear-gradient(135deg, #17bfd1, #0ea5b7); }
    .soft_task .marker-bubble { background: linear-gradient(135deg, #89b8ff, #5b95ff); animation: float 2.4s ease-in-out infinite; }
    .marker-stem { width: 4px; height: 12px; background: #287cff; border-radius: 999px; margin-top: -2px; }
    .marker-title {
      margin-top: 4px; padding: 4px 6px; border-radius: 10px; background: rgba(255,255,255,0.94);
      color: #30496f; font-size: 10px; font-weight: 800; text-align: center; line-height: 1.2;
      box-shadow: 0 4px 10px rgba(70,131,201,0.18); max-width: 72px;
    }
    .marker-time { color: #7f93b1; font-size: 9px; font-weight: 800; margin-top: 2px; }
    .badge {
      position: absolute; top: -6px; right: -6px; width: 16px; height: 16px; border-radius: 8px;
      background: #fff; color: #287cff; font-size: 9px; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.12);
    }
    @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
  </style>
  <script src="https://webapi.amap.com/maps?v=2.0&key=${apiKey}"></script>
</head>
<body>
  <div id="map"></div>
  <script>
    ${MAP_BOOT}
    const markers = ${markerJson};
    const center = ${centerJson};
    const map = new AMap.Map('map', {
      zoom: 12,
      center: [center.lng, center.lat],
      viewMode: '2D',
      mapStyle: 'amap://styles/normal',
      pinchEnable: true,
      zoomEnable: true,
      dragEnable: true,
      doubleClickZoom: true,
      scrollWheel: true,
      touchZoom: true,
      touchZoomCenter: 1,
      jogEnable: true,
      resizeEnable: true,
    });
    window.__map = map;

    AMap.plugin(['AMap.ToolBar', 'AMap.Scale'], function() {
      map.addControl(new AMap.ToolBar({ position: { top: '48px', right: '12px' } }));
      map.addControl(new AMap.Scale());
    });

    const markerInstances = [];
    const path = [];

    markers.forEach(function(item) {
      path.push([item.lng, item.lat]);
      const typeBadge = item.nodeType === 'hard_anchor' ? '<div class="badge">硬</div>' :
        item.nodeType === 'semi_anchor' ? '<div class="badge">半</div>' : '';
      const html = '<div class="cartoon-marker ' + item.nodeType + '">' +
        '<div class="marker-bubble">' + item.icon + typeBadge + '</div>' +
        '<div class="marker-stem"></div>' +
        '<div class="marker-title">' + item.title + '</div>' +
        '<div class="marker-time">' + item.time + '</div>' +
        '</div>';

      const marker = new AMap.Marker({
        position: [item.lng, item.lat],
        content: html,
        offset: new AMap.Pixel(-36, -72),
        zIndex: item.nodeType === 'hard_anchor' ? 120 : 100,
        draggable: true,
        cursor: 'move',
      });

      marker.on('click', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'markerClick',
          id: item.id,
          editable: true,
          title: item.title,
          time: item.time,
          location: item.location,
        }));
      });

      marker.on('dragend', function() {
        const pos = marker.getPosition();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'markerDrag',
          id: item.id,
          lng: pos.getLng(),
          lat: pos.getLat(),
        }));
      });

      marker.setMap(map);
      markerInstances.push(marker);
    });
    window.__markerInstances = markerInstances;

    if (path.length > 1) {
      new AMap.Polyline({
        path: path,
        strokeColor: '#89B8FF',
        strokeWeight: 5,
        strokeOpacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round',
        showDir: true,
      }).setMap(map);
    }

    if (markerInstances.length > 0) {
      map.setFitView(markerInstances, false, [50, 50, 50, 50]);
    }
  </script>
</body>
</html>`;
}

export function buildLeafletHtml(markers: MapMarkerPayload[], center: { lng: number; lat: number }) {
  const markerJson = JSON.stringify(markers);
  const centerJson = JSON.stringify(center);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; touch-action: none; }
    .cartoon-pin { text-align: center; }
    .cartoon-pin .bubble {
      width: 44px; height: 44px; border-radius: 16px; display: flex; align-items: center; justify-content: center;
      font-size: 22px; border: 3px solid #fff; box-shadow: 0 8px 16px rgba(40,124,255,0.25); margin: 0 auto;
    }
    .cartoon-pin .title {
      margin-top: 4px; background: rgba(255,255,255,0.95); padding: 3px 6px; border-radius: 8px;
      font-size: 10px; font-weight: 800; color: #30496f;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    ${MAP_BOOT}
    const markers = ${markerJson};
    const center = ${centerJson};
    const map = L.map('map', { zoomControl: true, touchZoom: true, scrollWheelZoom: true, doubleClickZoom: true }).setView([center.lat, center.lng], 12);
    window.__map = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    const latlngs = [];
    markers.forEach(function(item) {
      latlngs.push([item.lat, item.lng]);
      const icon = L.divIcon({
        className: '',
        html: '<div class="cartoon-pin"><div class="bubble">' + item.icon + '</div><div class="title">' + item.title + '</div></div>',
        iconSize: [72, 72],
        iconAnchor: [36, 72],
      });
      const marker = L.marker([item.lat, item.lng], { icon, draggable: true }).addTo(map);
      marker.on('click', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'markerClick',
          id: item.id,
          editable: true,
          title: item.title,
          time: item.time,
          location: item.location,
        }));
      });
      marker.on('dragend', function(e) {
        const pos = e.target.getLatLng();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'markerDrag',
          id: item.id,
          lng: pos.lng,
          lat: pos.lat,
        }));
      });
    });

    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: '#89B8FF', weight: 5, opacity: 0.85 }).addTo(map);
      map.fitBounds(latlngs, { padding: [40, 40] });
    }
    window.mapApi.fitView = function() {
      if (latlngs.length > 0) map.fitBounds(latlngs, { padding: [40, 40] });
    };
    window.mapApi.zoomIn = function() { map.zoomIn(); };
    window.mapApi.zoomOut = function() { map.zoomOut(); };
  </script>
</body>
</html>`;
}

export function buildMapMarkers(items: ItineraryItem[], city: string): MapMarkerPayload[] {
  return items.map((item, index) => {
    const point = resolveMapPoint(item, index, city);
    const nodeType = resolveNodeType(item);
    return {
      id: item.id,
      lng: point.lng,
      lat: point.lat,
      icon: point.icon,
      title: item.title,
      time: item.start_time,
      location: item.location,
      nodeType,
      editable: true,
    };
  });
}
