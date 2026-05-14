import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import * as L from 'leaflet';
import { MapComponent } from '../../shared/map/map.component';
import { AREA_TYPES, AreaType } from '../../shared/area';
import { GeolocationService } from '../../shared/geolocation.service';
import { AreaService } from '../../shared/area.service';

type RecordState = 'idle' | 'recording' | 'completing';

@Component({
  selector: 'app-record',
  templateUrl: './record.html',
  styleUrl: './record.scss',
  imports: [MapComponent, FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatButtonToggleModule],
})
export class RecordComponent implements OnDestroy {
  state: RecordState = 'idle';
  points = signal<[number, number][]>([]);
  name = '';
  note = '';
  areaType: AreaType = 'forest';

  currentLocation = signal<[number, number] | null>(null);
  locationError = signal<string | null>(null);

  readonly canFinish = computed(() => this.points().length >= 3);

  readonly areaTypes = Object.entries(AREA_TYPES).map(([key, val]) => ({ key: key as AreaType, ...val }));

  readonly mapOptions: L.MapOptions = {
    zoom: 15,
    center: L.latLng(48.31, 14.29),
  };

  private map?: L.Map;
  private watchId?: number;
  private polygonLayer?: L.Polygon;
  private currentMarker?: L.CircleMarker;
  private pointMarkers: L.CircleMarker[] = [];
  private existingAreaLayers: L.Polygon[] = [];

  private readonly geo = inject(GeolocationService);
  private readonly areaService = inject(AreaService);
  constructor(private router: Router) {}

  onMapReady(map: L.Map): void {
    this.map = map;
    this.geo.getCurrentPosition().then((pos) => map.setView(pos, 17)).catch(() => {});
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.state === 'recording') {
        this.addPointAt([e.latlng.lat, e.latlng.lng]);
      }
    });

    this.areaService.watchAreas().pipe(take(1)).subscribe(areas => {
      for (const area of areas) {
        const color = AREA_TYPES[area.type]?.color ?? '#888';
        const layer = L.polygon(area.points, {
          color, fillColor: color, fillOpacity: 0.2, weight: 1.5, interactive: false,
        }).addTo(map);
        this.existingAreaLayers.push(layer);
      }
    });
  }

  startRecording(): void {
    this.state = 'recording';
    this.points.set([]);
    this.clearLayers();
    this.beginWatch();
  }

  addPoint(): void {
    const loc = this.currentLocation();
    if (!loc) return;
    this.addPointAt(loc);
  }

  private addPointAt(loc: [number, number]): void {
    if (!this.map) return;

    this.points.update(pts => [...pts, loc]);
    const pts = this.points();

    const marker = L.circleMarker(loc, {
      radius: 6, color: '#1b5e20', fillColor: '#4caf50', fillOpacity: 1, weight: 2,
    }).addTo(this.map);
    marker.bindTooltip(`${pts.length}`, { permanent: true, className: 'point-number' });
    this.pointMarkers.push(marker);

    if (this.polygonLayer) {
      this.polygonLayer.setLatLngs(pts);
    } else if (pts.length >= 2) {
      this.polygonLayer = L.polygon(pts, {
        color: AREA_TYPES[this.areaType].color,
        fillColor: AREA_TYPES[this.areaType].color,
        fillOpacity: 0.2,
        weight: 2,
        dashArray: '6, 4',
      }).addTo(this.map);
    }
  }

  removeLastPoint(): void {
    if (!this.points().length) return;
    this.points.update(pts => pts.slice(0, -1));
    const pts = this.points();
    this.pointMarkers.pop()?.remove();
    if (pts.length < 2) {
      this.polygonLayer?.remove();
      this.polygonLayer = undefined;
    } else {
      this.polygonLayer?.setLatLngs(pts);
    }
  }

  finishRecording(): void {
    if (!this.canFinish()) return;
    this.stopWatch();
    this.state = 'completing';
  }

  backToRecording(): void {
    this.state = 'recording';
    this.beginWatch();
  }

  async save(): Promise<void> {
    const pts = this.points();
    if (pts.length < 3) return;
    await this.areaService.saveArea({
      id: crypto.randomUUID(),
      name: this.name.trim() || undefined,
      note: this.note.trim() || undefined,
      type: this.areaType,
      points: pts,
      createdAt: Date.now(),
    });
    this.router.navigate(['/']);
  }

  cancel(): void {
    this.stopWatch();
    this.clearLayers();
    this.state = 'idle';
    this.points.set([]);
    this.name = '';
    this.note = '';
  }

  private beginWatch(): void {
    this.locationError.set(null);
    if (this.watchId !== undefined) this.geo.clearWatch(this.watchId);

    this.watchId = this.geo.watch(
      (ll) => {
        this.currentLocation.set(ll);
        if (!this.map) return;
        if (this.currentMarker) {
          this.currentMarker.setLatLng(ll);
        } else {
          this.currentMarker = L.circleMarker(ll, {
            radius: 10, color: '#1565c0', fillColor: '#42a5f5', fillOpacity: 0.9, weight: 2,
          }).addTo(this.map);
        }
      },
      (err) => this.locationError.set(err),
    );
  }

  private stopWatch(): void {
    if (this.watchId !== undefined) {
      this.geo.clearWatch(this.watchId);
      this.watchId = undefined;
    }
  }

  private clearLayers(): void {
    this.polygonLayer?.remove();
    this.currentMarker?.remove();
    this.pointMarkers.forEach(m => m.remove());
    this.polygonLayer = undefined;
    this.currentMarker = undefined;
    this.pointMarkers = [];
  }

  ngOnDestroy(): void {
    this.stopWatch();
    this.existingAreaLayers.forEach(l => l.remove());
    this.map = undefined;
  }
}
