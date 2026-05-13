import { Component, EventEmitter, inject, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import * as L from 'leaflet';
import { GeolocationService } from '../geolocation.service';

const LAYER_KEY = 'hektarix-layer';
const VIEW_KEY = 'hektarix-view';

interface SavedView {
  lat: number;
  lng: number;
  zoom: number;
}

const DEFAULT_BASE_LAYERS: Record<string, L.TileLayer> = {
  Streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }),
  Satellite: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19,
    },
  ),
  Topographic: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution:
      'Map data: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
  }),
};

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
  imports: [LeafletModule],
})
export class MapComponent implements OnInit, OnDestroy {
  /** Override base layers. Defaults to Streets / Satellite / Topographic. */
  @Input() baseLayers: Record<string, L.TileLayer> = DEFAULT_BASE_LAYERS;
  /** Persist and restore the map view across page loads. */
  @Input() persistView = false;
  /** Initial map options (zoom + center). Layers are managed internally. */
  @Input() mapOptions: L.MapOptions = { zoom: 15, center: L.latLng(48.31, 14.29) };
  @Output() readonly mapReady = new EventEmitter<L.Map>();

  leafletOptions!: L.MapOptions;

  private readonly geo = inject(GeolocationService);
  private locationMarker?: L.CircleMarker;
  private lastLocation?: L.LatLng;
  private watchId?: number;

  ngOnInit(): void {
    this.leafletOptions = { ...this.mapOptions };
  }

  ngOnDestroy(): void {
    if (this.watchId !== undefined) {
      this.geo.clearWatch(this.watchId);
    }
  }

  onLeafletReady(map: L.Map): void {
    const layerNames = Object.keys(this.baseLayers);
    const savedName = localStorage.getItem(LAYER_KEY) ?? layerNames[0];
    (this.baseLayers[savedName] ?? this.baseLayers[layerNames[0]]).addTo(map);
    L.control.layers(this.baseLayers).addTo(map);
    map.on('baselayerchange', (e: L.LayersControlEvent) => localStorage.setItem(LAYER_KEY, e.name));

    this.startLocationWatch(map);
    this.addLocateControl(map);

    if (this.persistView) {
      this.restoreView(map);
      map.on('moveend', () => this.saveView(map));
    }

    this.mapReady.emit(map);
  }

  private startLocationWatch(map: L.Map): void {
    this.watchId = this.geo.watch((pos) => {
      const ll = L.latLng(pos[0], pos[1]);
      this.lastLocation = ll;
      if (this.locationMarker) {
        this.locationMarker.setLatLng(ll);
      } else {
        this.locationMarker = L.circleMarker(ll, {
          radius: 5, color: '#1565c0', fillColor: '#1565c0', fillOpacity: 0.9, weight: 2,
        }).addTo(map);
      }
    });
  }

  private addLocateControl(map: L.Map): void {
    const self = this;
    const LocateControl = L.Control.extend({
      onAdd(): HTMLElement {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const btn = L.DomUtil.create('a', 'leaflet-control-locate', container);
        btn.title = 'Go to my location';
        btn.setAttribute('role', 'button');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
        </svg>`;
        L.DomEvent.on(btn, 'click', (e) => {
          L.DomEvent.preventDefault(e);
          L.DomEvent.stopPropagation(e);
          if (self.lastLocation) {
            map.flyTo(self.lastLocation, Math.max(map.getZoom(), 15));
          }
        });
        return container;
      },
    });
    new LocateControl({ position: 'topleft' }).addTo(map);
  }

  private restoreView(map: L.Map): void {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw) {
      try {
        const { lat, lng, zoom }: SavedView = JSON.parse(raw);
        map.setView([lat, lng], zoom);
        return;
      } catch {
        localStorage.removeItem(VIEW_KEY);
      }
    }
    map.locate({ setView: true, maxZoom: 13 });
    map.on('locationerror', () => map.setView([47.5, 14.5], 8));
  }

  private saveView(map: L.Map): void {
    const { lat, lng } = map.getCenter();
    localStorage.setItem(VIEW_KEY, JSON.stringify({ lat, lng, zoom: map.getZoom() }));
  }
}
