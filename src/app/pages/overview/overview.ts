import { Component, inject, signal, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
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
  imports: [MapComponent, LeafletDrawModule, MatButtonModule, MatIconModule],
})
export class OverviewComponent implements OnDestroy {
  visibleTypes: AreaType[] = ['forest', 'field'];
  forestArea = signal(0);
  fieldArea = signal(0);
  drawMode = signal<'none' | 'edit-single'>('none');

  private readonly areaService = inject(AreaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private drawnItems!: L.FeatureGroup;
  private layerTypes = new Map<L.Layer, AreaType>();
  private layerNames = new Map<L.Layer, string>();
  private layerIds = new Map<L.Layer, string>();
  private layerCreatedAt = new Map<L.Layer, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private singleEditHandler?: any;
  private suppressUntil = 0;
  private pendingSyncAreas: SavedArea[] | null = null;
  private areasSubscription?: Subscription;
  private routeSub?: Subscription;
  private pendingEditId: string | null = null;
  private map?: L.Map;

  readonly mapOptions: L.MapOptions = {
    zoom: 8,
    center: L.latLng(47.5, 14.5),
  };

  get hasLayers(): boolean {
    return (this.drawnItems?.getLayers().length ?? 0) > 0;
  }

  onMapReady(map: L.Map): void {
    this.map = map;
    this.drawnItems = new L.FeatureGroup();
    map.addLayer(this.drawnItems);

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('draw:edited', (e: any) => {
      e.layers.eachLayer((layer: L.Layer) => {
        if (layer instanceof L.Polygon) {
          this.updateAreaLabel(layer);
          this.persist(layer);
        }
      });
      this.updateTotalArea();
    });
  }

  ngOnDestroy(): void {
    this.areasSubscription?.unsubscribe();
    this.routeSub?.unsubscribe();
  }

  confirmMode(): void {
    if (this.drawMode() === 'edit-single') {
      this.singleEditHandler?.save();
      this.setDrawMode('none');
      this.router.navigate(['/list']);
      return;
    }
    this.setDrawMode('none');
  }

  cancelMode(): void {
    if (this.drawMode() === 'edit-single') {
      this.singleEditHandler?.revertLayers();
      this.setDrawMode('none');
      this.router.navigate(['/list']);
      return;
    }
    this.setDrawMode('none');
  }

  private setDrawMode(mode: 'none' | 'edit-single'): void {
    if (this.drawMode() === 'edit-single') this.singleEditHandler?.disable();
    this.drawMode.set(mode);
    if (mode === 'none' && this.pendingSyncAreas) {
      const areas = this.pendingSyncAreas;
      this.pendingSyncAreas = null;
      this.syncAreas(areas);
    }
  }

  formatArea(m2: number): string {
    return `${(m2 / 10000).toFixed(4)} ha`;
  }

  private suppress(): void {
    this.suppressUntil = Date.now() + 2000;
    this.pendingSyncAreas = null;
  }

  private persist(layer: L.Polygon): void {
    this.suppress();
    this.areaService.saveArea(this.toSavedArea(layer));
  }

  private toSavedArea(layer: L.Polygon): SavedArea {
    const ring = layer.getLatLngs()[0] as L.LatLng[];
    const type = this.layerTypes.get(layer) ?? 'forest';
    const name = this.layerNames.get(layer);
    const id = this.layerIds.get(layer)!;
    const createdAt = this.layerCreatedAt.get(layer);
    return {
      id,
      ...(name ? { name } : {}),
      ...(createdAt ? { createdAt } : {}),
      type,
      points: ring.map((ll) => [ll.lat, ll.lng]),
    };
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

  private styleFor(type: AreaType): L.PathOptions {
    const { color } = AREA_TYPES[type];
    return { color, fillColor: color, fillOpacity: 0.35, weight: 2, stroke: true, opacity: 1 };
  }

  private syncAreas(areas: SavedArea[]): void {
    this.drawnItems.clearLayers();
    this.layerTypes.clear();
    this.layerNames.clear();
    this.layerIds.clear();
    this.layerCreatedAt.clear();
    for (const area of areas) {
      const type: AreaType = (area.type in AREA_TYPES) ? area.type : 'forest';
      const layer = L.polygon(area.points);
      this.layerIds.set(layer, area.id);
      this.setLayerType(layer, type);
      if (area.name) this.layerNames.set(layer, area.name);
      if (area.createdAt) this.layerCreatedAt.set(layer, area.createdAt);
      this.updateAreaLabel(layer);
      layer.addTo(this.drawnItems);
    }
    this.updateTotalArea();
    this.tryStartPendingEdit();
  }

  private tryStartPendingEdit(): void {
    if (!this.pendingEditId || !this.map) return;
    const entry = [...this.layerIds.entries()].find(([, id]) => id === this.pendingEditId);
    if (!entry) return;
    this.pendingEditId = null;
    this.startSingleEdit(entry[0] as L.Polygon);
  }

  private startSingleEdit(layer: L.Polygon): void {
    if (!this.map) return;
    this.map.fitBounds(layer.getBounds(), { padding: [60, 60] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const LA = L as any;
    this.singleEditHandler = new LA.EditToolbar.Edit(this.map, {
      featureGroup: new L.FeatureGroup([layer]),
    });
    this.singleEditHandler.enable();
    this.drawMode.set('edit-single');
  }
}
