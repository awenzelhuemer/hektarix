import { Component, inject, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import * as L from 'leaflet';
import { MapComponent } from '../../shared/map/map.component';
import { AREA_TYPES, AREAS_KEY, AreaType } from '../../shared/area';
import { GeolocationService } from '../../shared/geolocation.service';

type RecordState = 'idle' | 'recording' | 'completing';

@Component({
  selector: 'app-record',
  templateUrl: './record.html',
  styleUrl: './record.scss',
  imports: [MapComponent, FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatButtonToggleModule],
})
export class RecordComponent implements OnDestroy {
  state: RecordState = 'idle';
  points: [number, number][] = [];
  name = '';
  areaType: AreaType = 'forest';

  currentLocation = signal<[number, number] | null>(null);
  locationError = signal<string | null>(null);

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

  get canFinish(): boolean { return this.points.length >= 3; }

  private readonly geo = inject(GeolocationService);
  constructor(private router: Router) {}

  onMapReady(map: L.Map): void {
    this.map = map;
    this.geo.getCurrentPosition().then((pos) => map.setView(pos, 17)).catch(() => {});
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.state === 'recording') {
        this.addPointAt([e.latlng.lat, e.latlng.lng]);
      }
    });
  }

  startRecording(): void {
    this.state = 'recording';
    this.points = [];
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

    this.points.push(loc);

    const marker = L.circleMarker(loc, {
      radius: 6, color: '#1b5e20', fillColor: '#4caf50', fillOpacity: 1, weight: 2,
    }).addTo(this.map);
    marker.bindTooltip(`${this.points.length}`, { permanent: true, className: 'point-number' });
    this.pointMarkers.push(marker);

    if (this.polygonLayer) {
      this.polygonLayer.setLatLngs(this.points);
    } else if (this.points.length >= 2) {
      this.polygonLayer = L.polygon(this.points, {
        color: AREA_TYPES[this.areaType].color,
        fillColor: AREA_TYPES[this.areaType].color,
        fillOpacity: 0.2,
        weight: 2,
        dashArray: '6, 4',
      }).addTo(this.map);
    }
  }

  removeLastPoint(): void {
    if (!this.points.length) return;
    this.points.pop();
    this.pointMarkers.pop()?.remove();
    if (this.points.length < 2) {
      this.polygonLayer?.remove();
      this.polygonLayer = undefined;
    } else {
      this.polygonLayer?.setLatLngs(this.points);
    }
  }

  finishRecording(): void {
    if (!this.canFinish) return;
    this.stopWatch();
    this.state = 'completing';
  }

  backToRecording(): void {
    this.state = 'recording';
    this.beginWatch();
  }

  save(): void {
    if (this.points.length < 3) return;
    const areas = JSON.parse(localStorage.getItem(AREAS_KEY) ?? '[]');
    areas.push({
      id: crypto.randomUUID(),
      name: this.name.trim() || undefined,
      type: this.areaType,
      points: this.points,
    });
    localStorage.setItem(AREAS_KEY, JSON.stringify(areas));
    this.router.navigate(['/']);
  }

  cancel(): void {
    this.stopWatch();
    this.router.navigate(['/']);
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
        this.map.setView(ll, this.map.getZoom());
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
    this.map = undefined;
  }
}
