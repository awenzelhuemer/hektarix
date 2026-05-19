import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import Map from 'ol/Map';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { MapComponent, OlMapOptions } from '../../components/map/map.component';
import { AREA_TYPES, AreaType } from '../../models/area';
import { GeolocationService } from '../../services/geolocation.service';
import { AreaService } from '../../services/area.service';

type RecordState = 'idle' | 'recording' | 'kataster' | 'completing';

@Component({
  selector: 'app-record',
  templateUrl: './record.html',
  styleUrl: './record.scss',
  imports: [MapComponent, FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatButtonToggleModule],
})
export class RecordComponent implements OnDestroy {
  state: RecordState = 'idle';
  private activeMode: 'manual' | 'kataster' = 'manual';
  points = signal<[number, number][]>([]);
  name = '';
  note = '';
  areaType: AreaType = 'forest';

  currentLocation = signal<[number, number] | null>(null);
  locationError = signal<string | null>(null);

  readonly canFinish = computed(() => this.points().length >= 3);
  readonly areaTypes = Object.entries(AREA_TYPES).map(([key, val]) => ({ key: key as AreaType, ...val }));

  readonly mapOptions: OlMapOptions = { zoom: 15, center: [48.31, 14.29] };

  private watchId?: number;

  private readonly drawSource = new VectorSource();
  private readonly drawLayer = new VectorLayer({ source: this.drawSource, zIndex: 50 });
  private readonly locationSource = new VectorSource();
  private readonly locationLayer = new VectorLayer({ source: this.locationSource, zIndex: 100 });
  private readonly existingSource = new VectorSource();
  private readonly existingLayer = new VectorLayer({ source: this.existingSource, zIndex: 10 });

  private polygonFeature?: Feature<Polygon>;
  private locationFeature?: Feature<Point>;
  private pointFeatures: Feature<Point>[] = [];
  private map?: Map;
  private searchTimeout?: ReturnType<typeof setTimeout>;

  searchQuery = '';
  searchResults = signal<{ lat: string; lon: string; display_name: string }[]>([]);

  private readonly geo = inject(GeolocationService);
  private readonly areaService = inject(AreaService);
  constructor(private router: Router) {}

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

  onMapReady(map: Map): void {
    this.map = map;
    map.addLayer(this.existingLayer);
    map.addLayer(this.drawLayer);
    map.addLayer(this.locationLayer);

    map.on('click', (e) => {
      if (this.state !== 'recording') return;
      const [lon, lat] = toLonLat(e.coordinate);
      this.addPointAt([lat, lon]);
    });

    this.areaService.watchAreas().pipe(take(1)).subscribe(areas => {
      for (const area of areas) {
        const color = AREA_TYPES[area.type]?.color ?? '#888';
        const coords = area.points.map(([lat, lon]) => fromLonLat([lon, lat]));
        coords.push(coords[0]);
        const feature = new Feature({ geometry: new Polygon([coords]) });
        feature.setStyle(new Style({
          stroke: new Stroke({ color, width: 1.5 }),
          fill: new Fill({ color: hexWithAlpha(color, 0.2) }),
        }));
        this.existingSource.addFeature(feature);
      }
    });
  }

  startManual(): void {
    this.activeMode = 'manual';
    this.state = 'recording';
    this.beginWatch();
  }

  startKataster(): void {
    this.activeMode = 'kataster';
    this.state = 'kataster';
  }

  onKatasterClick(points: [number, number][]): void {
    if (this.state !== 'kataster' || points.length < 3) return;
    this.clearDrawings();
    this.points.set(points);

    const olCoords = points.map(([lat, lon]) => fromLonLat([lon, lat]));
    olCoords.push(olCoords[0]);
    this.polygonFeature = new Feature({ geometry: new Polygon([olCoords]) });
    this.polygonFeature.setStyle(new Style({
      stroke: new Stroke({ color: '#ff6b00', width: 3 }),
      fill: new Fill({ color: 'rgba(255, 107, 0, 0.15)' }),
    }));
    this.drawSource.addFeature(this.polygonFeature);
    this.state = 'completing';
  }

  addPoint(): void {
    const loc = this.currentLocation();
    if (!loc) return;
    this.addPointAt(loc);
  }

  private addPointAt(loc: [number, number]): void {
    this.points.update(pts => [...pts, loc]);
    const pts = this.points();
    const [lat, lon] = loc;
    const olCoord = fromLonLat([lon, lat]);

    const pointFeature = new Feature({ geometry: new Point(olCoord) });
    pointFeature.setStyle(new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: '#4caf50' }),
        stroke: new Stroke({ color: '#1b5e20', width: 2 }),
      }),
      text: new Text({
        text: String(pts.length),
        offsetY: -14,
        font: 'bold 11px sans-serif',
        fill: new Fill({ color: '#1b5e20' }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
    }));
    this.pointFeatures.push(pointFeature);
    this.drawSource.addFeature(pointFeature);

    const olCoords = pts.map(([la, lo]) => fromLonLat([lo, la]));
    olCoords.push(olCoords[0]);

    if (this.polygonFeature) {
      this.polygonFeature.getGeometry()!.setCoordinates([olCoords]);
    } else if (pts.length >= 2) {
      this.polygonFeature = new Feature({ geometry: new Polygon([olCoords]) });
      this.polygonFeature.setStyle(new Style({
        stroke: new Stroke({ color: AREA_TYPES[this.areaType].color, width: 2, lineDash: [6, 4] }),
        fill: new Fill({ color: hexWithAlpha(AREA_TYPES[this.areaType].color, 0.2) }),
      }));
      this.drawSource.addFeature(this.polygonFeature);
    }
  }

  removeLastPoint(): void {
    if (!this.points().length) return;
    this.points.update(pts => pts.slice(0, -1));
    const pts = this.points();

    const removed = this.pointFeatures.pop();
    if (removed) this.drawSource.removeFeature(removed);

    if (pts.length < 2) {
      if (this.polygonFeature) {
        this.drawSource.removeFeature(this.polygonFeature);
        this.polygonFeature = undefined;
      }
    } else if (this.polygonFeature) {
      const olCoords = pts.map(([lat, lon]) => fromLonLat([lon, lat]));
      olCoords.push(olCoords[0]);
      this.polygonFeature.getGeometry()!.setCoordinates([olCoords]);
    }
  }

  finishRecording(): void {
    if (!this.canFinish()) return;
    this.stopWatch();
    this.state = 'completing';
  }

  backToRecording(): void {
    this.clearDrawings();
    this.points.set([]);
    if (this.activeMode === 'manual') {
      this.state = 'recording';
      this.beginWatch();
    } else {
      this.state = 'kataster';
    }
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

  clearRecording(): void {
    this.clearDrawings();
    this.points.set([]);
    this.state = 'idle';
    this.name = '';
    this.note = '';
  }

  cancel(): void {
    this.stopWatch();
    this.clearDrawings();
    this.state = 'idle';
    this.points.set([]);
    this.name = '';
    this.note = '';
  }

  private beginWatch(): void {
    this.locationError.set(null);
    if (this.watchId !== undefined) this.geo.clearWatch(this.watchId);

    this.watchId = this.geo.watch(
      ([lat, lon]) => {
        this.currentLocation.set([lat, lon]);
        const coord = fromLonLat([lon, lat]);
        if (this.locationFeature) {
          this.locationFeature.getGeometry()!.setCoordinates(coord);
        } else {
          this.locationFeature = new Feature({ geometry: new Point(coord) });
          this.locationFeature.setStyle(new Style({
            image: new CircleStyle({
              radius: 10,
              fill: new Fill({ color: 'rgba(66, 165, 245, 0.9)' }),
              stroke: new Stroke({ color: '#1565c0', width: 2 }),
            }),
          }));
          this.locationSource.addFeature(this.locationFeature);
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

  private clearDrawings(): void {
    this.drawSource.clear();
    this.locationSource.clear();
    this.polygonFeature = undefined;
    this.locationFeature = undefined;
    this.pointFeatures = [];
  }

  ngOnDestroy(): void {
    this.stopWatch();
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
