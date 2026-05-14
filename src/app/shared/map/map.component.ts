import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorTileLayer from 'ol/layer/VectorTile';
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import VectorTileSource from 'ol/source/VectorTile';
import MVT from 'ol/format/MVT';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';

import BaseLayer from 'ol/layer/Base';
import { GeolocationService } from '../geolocation.service';

export interface OlMapOptions {
  zoom?: number;
  center?: [number, number]; // [lat, lon]
}

const LAYER_KEY = 'hektarix-layer';
const OVERLAY_KEY = 'hektarix-overlays';
const VIEW_KEY = 'hektarix-view';

interface SavedView { lon: number; lat: number; zoom: number; }

function buildDefaultBaseLayers(): Record<string, BaseLayer> {
  return {
    'Straße': new TileLayer({ source: new OSM() }),
    'Satellit': new TileLayer({
      source: new XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 19 }),
    }),
    'Topografie': new TileLayer({
      source: new XYZ({ url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png', maxZoom: 17 }),
    }),
    'Orthofoto (BEV)': new TileLayer({
      source: new XYZ({
        url: 'https://kataster.bev.gv.at/ortho/gwc/service/wmts?service=WMTS&Version=1.1.1&Request=GetTile&Layer=inspire:AT_BEV_OI&Style=inspire:default&TileMatrixSet=EPSG:93857&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}',
        maxZoom: 19,
      }),
    }),
  };
}

const KATASTER_SOURCE = new VectorTileSource({
  format: new MVT(),
  url: 'https://kataster.bev.gv.at/tiles/kataster/{z}/{x}/{y}.pbf',
  maxZoom: 16,
});

function buildDefaultOverlays(): Record<string, BaseLayer> {
  return {
    'Kataster (BEV)': new VectorTileLayer({
      source: KATASTER_SOURCE,
      minZoom: 14,
      style: new Style({
        stroke: new Stroke({ color: 'black', width: 1 }),
        fill: new Fill({ color: 'rgba(0,0,0,0)' }),
      }),
    }),
  };
}

const DEFAULT_BASE_LAYERS = buildDefaultBaseLayers();
const DEFAULT_OVERLAYS = buildDefaultOverlays();

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
  imports: [MatButtonModule, MatIconModule],
})
export class MapComponent implements OnInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  @Input() baseLayers: Record<string, BaseLayer> = DEFAULT_BASE_LAYERS;
  @Input() overlays: Record<string, BaseLayer> = DEFAULT_OVERLAYS;
  @Input() persistView = false;
  @Input() katasterSelectionEnabled = false;
  @Input() mapOptions: OlMapOptions = { zoom: 15, center: [48.31, 14.29] };
  @Output() readonly mapReady = new EventEmitter<Map>();
  @Output() readonly katasterFeatureClick = new EventEmitter<[number, number][]>();

  baseLayerNames: string[] = [];
  overlayNames: string[] = [];
  activeBaseName = '';
  layerSwitcherOpen = false;

  private map?: Map;
  private locationFeature?: Feature<Point>;
  private locationLayer?: VectorLayer<VectorSource>;
  private lastPosition?: [number, number];
  private watchId?: number;
  private readonly highlightedIds: (string | number)[] = [];

  private readonly geo = inject(GeolocationService);

  ngOnInit(): void {
    this.baseLayerNames = Object.keys(this.baseLayers);
    this.overlayNames = Object.keys(this.overlays);

    const savedBase = localStorage.getItem(LAYER_KEY);
    this.activeBaseName = (savedBase && this.baseLayers[savedBase]) ? savedBase : this.baseLayerNames[0];

    const savedOverlaysRaw = localStorage.getItem(OVERLAY_KEY);
    const activeOverlays: string[] = savedOverlaysRaw
      ? JSON.parse(savedOverlaysRaw)
      : this.overlayNames;

    const [lat, lon] = this.mapOptions.center ?? [48.31, 14.29];
    const zoom = this.mapOptions.zoom ?? 15;

    const view = new View({ center: fromLonLat([lon, lat]), zoom });

    const baseLayers = this.baseLayerNames.map((name) => {
      const layer = this.baseLayers[name];
      layer.setVisible(name === this.activeBaseName);
      return layer;
    });

    const overlayLayers = this.overlayNames.map((name) => {
      const layer = this.overlays[name];
      layer.setVisible(activeOverlays.includes(name));
      return layer;
    });

    const locationSource = new VectorSource();
    this.locationLayer = new VectorLayer({ source: locationSource, zIndex: 900 });

    this.map = new Map({
      target: this.mapEl.nativeElement,
      layers: [...baseLayers, ...overlayLayers, this.locationLayer],
      view,
      controls: [],
    });

    if (this.persistView) {
      this.restoreView(view);
      this.map.on('moveend', () => this.saveView(view));
    }

    this.addKatasterHighlight();
    this.startLocationWatch(locationSource);
    this.mapReady.emit(this.map);
  }

  ngOnDestroy(): void {
    if (this.watchId !== undefined) this.geo.clearWatch(this.watchId);
    this.map?.setTarget(undefined);
  }

  selectBaseLayer(name: string): void {
    this.baseLayerNames.forEach(n => this.baseLayers[n].setVisible(n === name));
    this.activeBaseName = name;
    localStorage.setItem(LAYER_KEY, name);
    this.layerSwitcherOpen = false;
  }

  isOverlayActive(name: string): boolean {
    return this.overlays[name]?.getVisible() ?? false;
  }

  toggleOverlay(name: string): void {
    const layer = this.overlays[name];
    if (!layer) return;
    layer.setVisible(!layer.getVisible());
    const active = this.overlayNames.filter(n => this.overlays[n].getVisible());
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(active));
  }

  zoomIn(): void {
    const view = this.map?.getView();
    if (view) view.animate({ zoom: (view.getZoom() ?? 10) + 1, duration: 200 });
  }

  zoomOut(): void {
    const view = this.map?.getView();
    if (view) view.animate({ zoom: (view.getZoom() ?? 10) - 1, duration: 200 });
  }

  goToLocation(): void {
    if (this.map && this.lastPosition) {
      const [lat, lon] = this.lastPosition;
      this.map.getView().animate({
        center: fromLonLat([lon, lat]),
        zoom: Math.max(this.map.getView().getZoom() ?? 15, 15),
        duration: 400,
      });
    }
  }

  private addKatasterHighlight(): void {
    if (!this.map) return;

    const highlightStyle = new Style({
      stroke: new Stroke({ color: '#ff6b00', width: 3 }),
      fill: new Fill({ color: 'rgba(255, 107, 0, 0.15)' }),
    });

    const katasterLayer = this.overlays['Kataster (BEV)'] as VectorTileLayer;

    const highlightLayer = new VectorTileLayer({
      source: KATASTER_SOURCE,
      minZoom: 14,
      zIndex: 500,
      style: (feature) =>
        this.highlightedIds.includes(feature.getId() as string | number)
          ? highlightStyle
          : undefined,
    });

    this.map.addLayer(highlightLayer);

    const pickSmallest = (pixel: number[]) => {
      if (!katasterLayer?.getVisible()) return null;
      const features = this.map!.getFeaturesAtPixel(pixel, {
        layerFilter: (l) => l === katasterLayer,
      });
      return features.slice().sort((a, b) => {
        const area = (f: typeof a) => { const e = f.getGeometry()?.getExtent() ?? [0,0,0,0]; return (e[2]-e[0])*(e[3]-e[1]); };
        return area(a) - area(b);
      })[0] ?? null;
    };

    this.map.on('pointermove', (e) => {
      if (!this.katasterSelectionEnabled) {
        if (this.highlightedIds.length) { this.highlightedIds.length = 0; highlightLayer.changed(); }
        this.mapEl.nativeElement.style.cursor = '';
        return;
      }
      const feature = pickSmallest(e.pixel);
      this.highlightedIds.length = 0;
      if (feature) this.highlightedIds.push(feature.getId() as string | number);
      highlightLayer.changed();
      this.mapEl.nativeElement.style.cursor = feature ? 'pointer' : '';
    });

    this.map.on('click', (e) => {
      if (!this.katasterSelectionEnabled) return;
      const feature = pickSmallest(e.pixel);
      if (!feature) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const f = feature as any;
      const flat: number[] | undefined = f.flatCoordinates_;
      const ends: number[] | undefined = f.ends_;
      if (!flat?.length) return;
      const ringEnd = ends?.[0] ?? flat.length;
      const ring: number[][] = [];
      for (let i = 0; i < ringEnd; i += 2) {
        ring.push([flat[i], flat[i + 1]]);
      }
      if (ring.length < 4) return;
      const points: [number, number][] = ring.slice(0, -1).map(c => {
        const [lon, lat] = toLonLat(c);
        return [lat, lon];
      });
      this.katasterFeatureClick.emit(points);
    });
  }

  private startLocationWatch(source: VectorSource): void {
    this.watchId = this.geo.watch((pos) => {
      const [lat, lon] = pos;
      this.lastPosition = pos;
      const coord = fromLonLat([lon, lat]);
      if (this.locationFeature) {
        (this.locationFeature.getGeometry() as Point).setCoordinates(coord);
      } else {
        this.locationFeature = new Feature({ geometry: new Point(coord) });
        this.locationFeature.setStyle(new Style({
          image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color: 'rgba(66, 165, 245, 0.9)' }),
            stroke: new Stroke({ color: '#1565c0', width: 2 }),
          }),
        }));
        source.addFeature(this.locationFeature);
      }
    });
  }

  private restoreView(view: View): void {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw) {
      try {
        const { lon, lat, zoom }: SavedView = JSON.parse(raw);
        view.setCenter(fromLonLat([lon, lat]));
        view.setZoom(zoom);
        return;
      } catch {
        localStorage.removeItem(VIEW_KEY);
      }
    }
  }

  private saveView(view: View): void {
    const center = view.getCenter();
    if (!center) return;
    const [lon, lat] = toLonLat(center);
    localStorage.setItem(VIEW_KEY, JSON.stringify({ lon, lat, zoom: view.getZoom() }));
  }
}
