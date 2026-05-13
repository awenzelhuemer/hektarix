import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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
  Straße: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }),
  Satellit: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19,
    },
  ),
  Topografie: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution:
      'Map data: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
  }),
};

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
  imports: [LeafletModule, MatButtonModule, MatIconModule],
})
export class MapComponent implements OnInit, OnDestroy {
  @Input() baseLayers: Record<string, L.TileLayer> = DEFAULT_BASE_LAYERS;
  @Input() persistView = false;
  @Input() mapOptions: L.MapOptions = { zoom: 15, center: L.latLng(48.31, 14.29) };
  @Output() readonly mapReady = new EventEmitter<L.Map>();

  leafletOptions!: L.MapOptions;

  private readonly geo = inject(GeolocationService);
  private map?: L.Map;
  private locationMarker?: L.CircleMarker;
  private lastLocation?: L.LatLng;
  private watchId?: number;

  ngOnInit(): void {
    this.leafletOptions = { ...this.mapOptions, zoomControl: false };
  }

  ngOnDestroy(): void {
    if (this.watchId !== undefined) {
      this.geo.clearWatch(this.watchId);
    }
  }

  onLeafletReady(map: L.Map): void {
    this.map = map;

    const layerNames = Object.keys(this.baseLayers);
    const savedName = localStorage.getItem(LAYER_KEY) ?? layerNames[0];
    (this.baseLayers[savedName] ?? this.baseLayers[layerNames[0]]).addTo(map);
    L.control.layers(this.baseLayers).addTo(map);
    map.on('baselayerchange', (e: L.LayersControlEvent) => localStorage.setItem(LAYER_KEY, e.name));

    this.startLocationWatch(map);

    if (this.persistView) {
      this.restoreView(map);
      map.on('moveend', () => this.saveView(map));
    }

    this.mapReady.emit(map);
  }

  zoomIn(): void {
    this.map?.zoomIn();
  }

  zoomOut(): void {
    this.map?.zoomOut();
  }

  goToLocation(): void {
    if (this.map && this.lastLocation) {
      this.map.flyTo(this.lastLocation, Math.max(this.map.getZoom(), 15));
    }
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
