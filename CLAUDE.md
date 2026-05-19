# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Hektarix** is an Angular 21 PWA for managing land parcels on an interactive map. Users draw, edit, and organize property boundaries (forests, fields, etc.) with automatic area calculation. Data is stored in Firebase Firestore and synced in real time.

## Commands

```bash
npm start          # Dev server at http://localhost:4200
npm run build      # Development build
npm run build:prod # Production build (optimized)
npm run deploy     # Production build + Firebase Hosting deploy
```

No test runner or linter is currently configured.

## Architecture

**Stack:** Angular 21 (standalone components), OpenLayers 10 (maps), Firebase (Auth + Firestore + Hosting), Angular Material, RxJS + Angular Signals.

### Key Services (`src/app/shared/`)

- **`AuthService`** — Firebase Google OAuth with email whitelist; exposes auth state via signals. `AuthGuard` protects all routes except `/login`.
- **`AreaService`** — Firestore CRUD for the `SavedArea` model; uses `collectionData()` for real-time observable sync across all views.
- **`GeolocationService`** — Wraps the browser Geolocation API for GPS point capture during manual recording.

### Pages (`src/app/pages/`)

- **`/overview`** — Main view: OpenLayers map + area list panel. Hosts polygon drawing/editing (OL `Draw` and `Modify` interactions), feature selection, and persists changes back via `AreaService`.
- **`/record`** — Two modes: manual GPS point capture or cadastral (Kataster) parcel selection. Produces a polygon that gets saved via `AreaService`.
- **`/list`** — Tabular area browser.

### Map Component (`src/app/shared/map/`)

Reusable OpenLayers wrapper used by both Overview and Record pages. Manages layers (base tile + vector feature layer), drawing interactions, and map view state (persisted to `localStorage`).

### Data Flow

1. **Record**: User captures polygon → `AreaService.saveArea()` → Firestore
2. **Overview edit**: Firestore → `AreaService` observable → Overview component → OL Modify interaction → `AreaService.updateArea()` → Firestore
3. All views auto-update via Firestore real-time subscriptions.

### Patterns

- **Standalone components** — no NgModules; each component imports its own dependencies.
- **Angular Signals** — used for local reactive state (`signal()`, `computed()`); services expose Firestore streams as observables.
- **OpenLayers** — all GIS logic (drawing, editing, feature styling, coordinate projection) goes through OL APIs directly, not wrapped in an abstraction layer.
- **PWA / Service Worker** — configured via `ngsw-config.json`; production builds register the SW automatically.
