import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import { LeafletDrawModule } from '@bluehalo/ngx-leaflet-draw';
import * as L from 'leaflet';

const AREAS_KEY = 'hektarix-areas';
const VIEW_KEY = 'hektarix-view';
const LAYER_KEY = 'hektarix-layer';

const AREA_TYPES = {
  forest: { label: 'Forest', color: '#2d6a4f' },
  field:  { label: 'Field',  color: '#e9c46a' },
} as const;

type AreaType = keyof typeof AREA_TYPES;

interface SavedArea {
  id: string;
  type: AreaType;
  points: [number, number][];
}

interface SavedView {
  lat: number;
  lng: number;
  zoom: number;
}

@Component({
  selector: 'app-overview',
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
  imports: [LeafletModule, LeafletDrawModule, MatButtonToggleModule, FormsModule],
})
export class OverviewComponent {
  readonly areaTypes = Object.entries(AREA_TYPES).map(([key, val]) => ({
    key: key as AreaType,
    ...val,
  }));

  visibleTypes: AreaType[] = ['forest', 'field'];
  forestArea = signal(0);
  fieldArea = signal(0);

  private drawnItems!: L.FeatureGroup;
  private layerTypes = new Map<L.Layer, AreaType>();

  readonly baseLayers: Record<string, L.TileLayer> = {
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

  readonly mapOptions: L.MapOptions = {
    zoom: 8,
    center: L.latLng(47.5, 14.5),
  };

  onMapReady(map: L.Map): void {
    const savedLayerName = localStorage.getItem(LAYER_KEY) ?? 'Streets';
    (this.baseLayers[savedLayerName] ?? this.baseLayers['Streets']).addTo(map);
    map.on('baselayerchange', (e: L.LayersControlEvent) => localStorage.setItem(LAYER_KEY, e.name));

    this.restoreView(map);
    map.on('moveend', () => this.saveView(map));

    this.drawnItems = new L.FeatureGroup();
    map.addLayer(this.drawnItems);
    this.loadAreas();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drawControl = new (L as any).Control.Draw({
      draw: {
        polygon: { allowIntersection: false, showArea: false },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: { featureGroup: this.drawnItems },
    });
    map.addControl(drawControl);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('draw:created', (e: any) => {
      const layer = e.layer as L.Polygon;
      this.setLayerType(layer, 'forest');
      this.bindTypePopup(layer);
      this.updateAreaLabel(layer);
      this.drawnItems.addLayer(layer);
      this.updateTotalArea();
      this.saveAreas();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('draw:edited', (e: any) => {
      e.layers.eachLayer((layer: L.Layer) => {
        if (layer instanceof L.Polygon) this.updateAreaLabel(layer);
      });
      this.updateTotalArea();
      this.saveAreas();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('draw:deleted', (e: any) => {
      e.layers.eachLayer((layer: L.Layer) => this.layerTypes.delete(layer));
      this.updateTotalArea();
      this.saveAreas();
    });
  }

  formatArea(m2: number): string {
    return `${(m2 / 10000).toFixed(4)} ha`;
  }

  private calculateArea(layer: L.Polygon): number {
    const latlngs = layer.getLatLngs()[0] as L.LatLng[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (L as any).GeometryUtil.geodesicArea(latlngs);
  }

  private updateAreaLabel(layer: L.Polygon): void {
    const text = this.formatArea(this.calculateArea(layer));
    if (layer.getTooltip()) {
      layer.setTooltipContent(text);
    } else {
      layer.bindTooltip(text, { permanent: true, direction: 'center', className: 'area-label' });
    }
  }

  private updateTotalArea(): void {
    let forest = 0, field = 0;
    this.drawnItems.eachLayer((layer) => {
      if (!(layer instanceof L.Polygon)) return;
      const type = this.layerTypes.get(layer) ?? 'forest';
      if (type === 'forest') forest += this.calculateArea(layer);
      else if (type === 'field') field += this.calculateArea(layer);
    });
    this.forestArea.set(forest);
    this.fieldArea.set(field);
  }

  private setLayerType(layer: L.Polygon, type: AreaType): void {
    this.layerTypes.set(layer, type);
    const visible = new Set(this.visibleTypes);
    const safeType: AreaType = (type in AREA_TYPES) ? type as AreaType : 'forest';
    layer.setStyle(visible.has(safeType) ? this.styleFor(safeType) : { opacity: 0, fillOpacity: 0, stroke: false });
  }

  private bindTypePopup(layer: L.Polygon): void {
    const container = document.createElement('div');
    container.className = 'area-type-popup';

    for (const { key, label, color } of this.areaTypes) {
      const btn = document.createElement('button');
      btn.className = 'area-type-btn';
      btn.dataset['type'] = key;
      btn.innerHTML = `<span class="area-type-dot" style="background:${color}"></span>${label}`;
      container.appendChild(btn);
    }

    container.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-type]');
      if (!btn) return;
      const type = btn.dataset['type'] as AreaType;
      this.setLayerType(layer, type);
      layer.closePopup();
      this.saveAreas();
    });

    layer.bindPopup(container);
  }

  private styleFor(type: AreaType): L.PathOptions {
    const { color } = AREA_TYPES[type];
    return { color, fillColor: color, fillOpacity: 0.35, weight: 2, stroke: true, opacity: 1 };
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

  private loadAreas(): void {
    try {
      const raw = localStorage.getItem(AREAS_KEY);
      if (!raw) return;
      const areas: SavedArea[] = JSON.parse(raw);
      for (const area of areas) {
        const type: AreaType = (area.type in AREA_TYPES) ? area.type : 'forest';
        const layer = L.polygon(area.points);
        this.setLayerType(layer, type);
        this.bindTypePopup(layer);
        this.updateAreaLabel(layer);
        layer.addTo(this.drawnItems);
      }
      this.updateTotalArea();
    } catch {
      localStorage.removeItem(AREAS_KEY);
    }
  }

  private saveAreas(): void {
    const areas: SavedArea[] = [];
    this.drawnItems.eachLayer((layer) => {
      if (layer instanceof L.Polygon) {
        const ring = layer.getLatLngs()[0] as L.LatLng[];
        const type = this.layerTypes.get(layer) ?? 'forest';
        areas.push({
          id: crypto.randomUUID(),
          type,
          points: ring.map((ll) => [ll.lat, ll.lng]),
        });
      }
    });
    localStorage.setItem(AREAS_KEY, JSON.stringify(areas));
  }
}
