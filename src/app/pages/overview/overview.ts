import { Component, inject, signal, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import OlMap from 'ol/Map';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { Modify } from 'ol/interaction';
import { doubleClick } from 'ol/events/condition';
import { getArea } from 'ol/sphere';
import { MapComponent, OlMapOptions } from '../../shared/map/map.component';
import { AREA_TYPES, AreaType, SavedArea } from '../../shared/area';
import { AreaService } from '../../shared/area.service';

@Component({
  selector: 'app-overview',
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
  imports: [MapComponent, FormsModule, MatButtonModule, MatIconModule],
})
export class OverviewComponent implements OnDestroy {
  visibleTypes: AreaType[] = ['forest', 'field'];
  forestArea = signal(0);
  fieldArea = signal(0);
  drawMode = signal<'none' | 'edit-single'>('none');

  private readonly areaService = inject(AreaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private map?: OlMap;
  private searchTimeout?: ReturnType<typeof setTimeout>;

  searchQuery = '';
  searchResults = signal<{ lat: string; lon: string; display_name: string }[]>([]);
  private vectorSource = new VectorSource();
  private vectorLayer = new VectorLayer({ source: this.vectorSource, zIndex: 50 });

  private featureTypes = new Map<Feature<Polygon>, AreaType>();
  private featureNames = new Map<Feature<Polygon>, string>();
  private featureIds = new Map<Feature<Polygon>, string>();
  private featureCreatedAt = new Map<Feature<Polygon>, number>();

  private modifyInteraction?: Modify;
  private modifySource?: VectorSource;
  private editingFeature?: Feature<Polygon>;
  private originalCoords?: number[][][];

  private suppressUntil = 0;
  private pendingSyncAreas: SavedArea[] | null = null;
  private areasSubscription?: Subscription;
  private routeSub?: Subscription;
  private pendingEditId: string | null = null;

  readonly mapOptions: OlMapOptions = { zoom: 8, center: [47.5, 14.5] };

  get hasLayers(): boolean {
    return this.vectorSource.getFeatures().length > 0;
  }

  onMapReady(map: OlMap): void {
    this.map = map;
    map.addLayer(this.vectorLayer);

    this.routeSub = this.route.queryParamMap.subscribe(params => {
      const editId = params.get('edit');
      if (editId) {
        this.pendingEditId = editId;
        this.tryStartPendingEdit();
      }
    });

    this.areasSubscription = this.areaService.watchAreas().subscribe(areas => {
      if (Date.now() < this.suppressUntil) return;
      if (this.drawMode() !== 'none') {
        this.pendingSyncAreas = areas;
        return;
      }
      this.syncAreas(areas);
    });
  }

  ngOnDestroy(): void {
    this.areasSubscription?.unsubscribe();
    this.routeSub?.unsubscribe();
  }

  confirmMode(): void {
    if (this.drawMode() === 'edit-single' && this.editingFeature) {
      this.persist(this.editingFeature);
      this.cleanupModify();
      this.setDrawMode('none');
      this.router.navigate(['/list']);
    }
  }

  cancelMode(): void {
    if (this.drawMode() === 'edit-single' && this.editingFeature && this.originalCoords) {
      this.editingFeature.getGeometry()!.setCoordinates(this.originalCoords);
      this.updateFeatureLabel(this.editingFeature);
      this.cleanupModify();
      this.setDrawMode('none');
      this.router.navigate(['/list']);
    }
  }

  formatArea(m2: number): string {
    return `${(m2 / 10000).toFixed(2)} ha`;
  }

  onSearchInput(): void {
    clearTimeout(this.searchTimeout);
    if (!this.searchQuery.trim()) { this.searchResults.set([]); return; }
    this.searchTimeout = setTimeout(() => this.fetchLocations(), 400);
  }

  private async fetchLocations(): Promise<void> {
    const q = encodeURIComponent(this.searchQuery.trim());
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5&countrycodes=at`,
        { headers: { 'Accept-Language': 'de' } },
      );
      this.searchResults.set(await res.json());
    } catch {
      this.searchResults.set([]);
    }
  }

  selectLocation(result: { lat: string; lon: string }): void {
    this.map?.getView().animate({
      center: fromLonLat([parseFloat(result.lon), parseFloat(result.lat)]),
      zoom: 16, duration: 500,
    });
    this.searchQuery = '';
    this.searchResults.set([]);
  }

  private setDrawMode(mode: 'none' | 'edit-single'): void {
    this.drawMode.set(mode);
    if (mode === 'none' && this.pendingSyncAreas) {
      const areas = this.pendingSyncAreas;
      this.pendingSyncAreas = null;
      this.syncAreas(areas);
    }
  }

  private suppress(): void {
    this.suppressUntil = Date.now() + 2000;
    this.pendingSyncAreas = null;
  }

  private persist(feature: Feature<Polygon>): void {
    this.suppress();
    this.areaService.saveArea(this.toSavedArea(feature));
  }

  private toSavedArea(feature: Feature<Polygon>): SavedArea {
    const ring = feature.getGeometry()!.getCoordinates()[0];
    const points: [number, number][] = ring.slice(0, -1).map(c => {
      const [lon, lat] = toLonLat(c);
      return [lat, lon];
    });
    const type = this.featureTypes.get(feature) ?? 'forest';
    const name = this.featureNames.get(feature);
    const id = this.featureIds.get(feature)!;
    const createdAt = this.featureCreatedAt.get(feature);
    return {
      id,
      ...(name ? { name } : {}),
      ...(createdAt ? { createdAt } : {}),
      type,
      points,
    };
  }

  private calculateArea(feature: Feature<Polygon>): number {
    return getArea(feature.getGeometry()!);
  }

  private updateFeatureLabel(feature: Feature<Polygon>): void {
    const name = this.featureNames.get(feature);
    const area = this.formatArea(this.calculateArea(feature));
    const type = this.featureTypes.get(feature) ?? 'forest';
    const visible = this.visibleTypes.includes(type);
    const { color } = AREA_TYPES[type];

    feature.setStyle(new Style({
      stroke: new Stroke({ color, width: 2 }),
      fill: new Fill({ color: hexWithAlpha(color, visible ? 0.35 : 0) }),
      text: visible ? new Text({
        text: name ? `${name}\n${area}` : area,
        font: '12px sans-serif',
        fill: new Fill({ color: '#111' }),
        backgroundFill: new Fill({ color: 'rgba(255,255,255,0.7)' }),
        padding: [2, 4, 2, 4],
        overflow: true,
      }) : undefined,
    }));
  }

  private updateTotalArea(): void {
    let forest = 0, field = 0;
    for (const feature of this.vectorSource.getFeatures() as Feature<Polygon>[]) {
      const type = this.featureTypes.get(feature) ?? 'forest';
      const area = this.calculateArea(feature);
      if (type === 'forest') forest += area;
      else if (type === 'field') field += area;
    }
    this.forestArea.set(forest);
    this.fieldArea.set(field);
  }

  private syncAreas(areas: SavedArea[]): void {
    this.vectorSource.clear();
    this.featureTypes.clear();
    this.featureNames.clear();
    this.featureIds.clear();
    this.featureCreatedAt.clear();

    for (const area of areas) {
      const type: AreaType = (area.type in AREA_TYPES) ? area.type : 'forest';
      const coords = area.points.map(([lat, lon]) => fromLonLat([lon, lat]));
      coords.push(coords[0]);
      const feature = new Feature({ geometry: new Polygon([coords]) });

      this.featureIds.set(feature, area.id);
      this.featureTypes.set(feature, type);
      if (area.name) this.featureNames.set(feature, area.name);
      if (area.createdAt) this.featureCreatedAt.set(feature, area.createdAt);
      this.updateFeatureLabel(feature);
      this.vectorSource.addFeature(feature);
    }

    this.updateTotalArea();
    this.tryStartPendingEdit();
  }

  private tryStartPendingEdit(): void {
    if (!this.pendingEditId || !this.map) return;
    const feature = (this.vectorSource.getFeatures() as Feature<Polygon>[])
      .find(f => this.featureIds.get(f) === this.pendingEditId);
    if (!feature) return;
    this.pendingEditId = null;
    this.startSingleEdit(feature);
  }

  private startSingleEdit(feature: Feature<Polygon>): void {
    if (!this.map) return;
    this.editingFeature = feature;
    this.originalCoords = feature.getGeometry()!.getCoordinates();

    const extent = feature.getGeometry()!.getExtent();
    this.map.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 400 });

    this.modifySource = new VectorSource({ features: [feature] });
    this.modifyInteraction = new Modify({ source: this.modifySource, deleteCondition: doubleClick });
    this.modifyInteraction.on('modifyend', () => {
      this.updateFeatureLabel(feature);
      this.updateTotalArea();
    });
    this.map.addInteraction(this.modifyInteraction);
    this.drawMode.set('edit-single');
  }

  private cleanupModify(): void {
    if (this.modifyInteraction) {
      this.map?.removeInteraction(this.modifyInteraction);
      this.modifyInteraction = undefined;
    }
    this.modifySource = undefined;
    this.editingFeature = undefined;
    this.originalCoords = undefined;
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
