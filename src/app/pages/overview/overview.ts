import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { LeafletDrawModule } from '@bluehalo/ngx-leaflet-draw';
import * as L from 'leaflet';
import { MapComponent } from '../../shared/map/map.component';
import { AREA_TYPES, AreaType, SavedArea } from '../../shared/area';
import { AreaService } from '../../shared/area.service';

@Component({
  selector: 'app-overview',
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
  imports: [MapComponent, LeafletDrawModule, MatButtonToggleModule, MatButtonModule, MatIconModule, FormsModule, RouterLink],
})
export class OverviewComponent {
  readonly areaTypes = Object.entries(AREA_TYPES).map(([key, val]) => ({
    key: key as AreaType,
    ...val,
  }));

  visibleTypes: AreaType[] = ['forest', 'field'];
  forestArea = signal(0);
  fieldArea = signal(0);

  private readonly areaService = inject(AreaService);
  private drawnItems!: L.FeatureGroup;
  private layerTypes = new Map<L.Layer, AreaType>();
  private layerNames = new Map<L.Layer, string>();

  readonly mapOptions: L.MapOptions = {
    zoom: 8,
    center: L.latLng(47.5, 14.5),
  };

  onMapReady(map: L.Map): void {
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
      e.layers.eachLayer((layer: L.Layer) => { this.layerTypes.delete(layer); this.layerNames.delete(layer); });
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
    const name = this.layerNames.get(layer);
    const area = this.formatArea(this.calculateArea(layer));
    const text = name ? `<strong>${name}</strong><br>${area}` : area;
    layer.unbindTooltip();
    layer.bindTooltip(text, { permanent: true, direction: 'center', className: 'area-label' });
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

    const nameRow = document.createElement('div');
    nameRow.className = 'area-name-row';
    const nameInput = document.createElement('input');
    nameInput.className = 'area-name-input';
    nameInput.type = 'text';
    nameInput.placeholder = 'Name …';
    nameInput.value = this.layerNames.get(layer) ?? '';
    const nameBtn = document.createElement('button');
    nameBtn.className = 'area-name-save';
    nameBtn.textContent = '✓';
    nameBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (name) { this.layerNames.set(layer, name); } else { this.layerNames.delete(layer); }
      this.updateAreaLabel(layer);
      layer.closePopup();
      this.saveAreas();
    });
    nameRow.appendChild(nameInput);
    nameRow.appendChild(nameBtn);
    container.appendChild(nameRow);

    const sep = document.createElement('hr');
    sep.className = 'area-popup-sep';
    container.appendChild(sep);

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
      this.updateTotalArea();
    });

    layer.bindPopup(container);
  }

  private styleFor(type: AreaType): L.PathOptions {
    const { color } = AREA_TYPES[type];
    return { color, fillColor: color, fillOpacity: 0.35, weight: 2, stroke: true, opacity: 1 };
  }

  private loadAreas(): void {
    this.areaService.loadAreas().then((areas) => {
      for (const area of areas) {
        const type: AreaType = (area.type in AREA_TYPES) ? area.type : 'forest';
        const layer = L.polygon(area.points);
        this.setLayerType(layer, type);
        if (area.name) this.layerNames.set(layer, area.name);
        this.bindTypePopup(layer);
        this.updateAreaLabel(layer);
        layer.addTo(this.drawnItems);
      }
      this.updateTotalArea();
    });
  }

  private saveAreas(): void {
    const areas: SavedArea[] = [];
    this.drawnItems.eachLayer((layer) => {
      if (layer instanceof L.Polygon) {
        const ring = layer.getLatLngs()[0] as L.LatLng[];
        const type = this.layerTypes.get(layer) ?? 'forest';
        const name = this.layerNames.get(layer);
        areas.push({
          id: crypto.randomUUID(),
          ...(name ? { name } : {}),
          type,
          points: ring.map((ll) => [ll.lat, ll.lng]),
        });
      }
    });
    this.areaService.saveAll(areas);
  }
}
