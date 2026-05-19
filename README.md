# Hektarix

Hektarix is a Progressive Web App (PWA) for managing land parcels on an interactive map. Users draw, edit, and organize property boundaries (forests, fields, etc.) with automatic area calculation. Data is stored in Firebase Firestore and synced in real time.

---

## Features

- Draw and edit land parcel boundaries directly on an interactive map
- Select parcels from the Austrian cadastre (BEV Kataster) overlay
- Visual differentiation between area types (forests, fields, grassland, etc.)
- Automatic area size calculation in m² / ha
- GPS location tracking during manual field recording
- Real-time data sync via Firestore
- Offline-capable PWA with service worker

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Angular 21 (standalone components) |
| Maps | OpenLayers 10 + ol-mapbox-style |
| UI | Angular Material 21 |
| Backend | Firebase (Auth, Firestore, Hosting) |
| State | RxJS + Angular Signals |
| Language | TypeScript 5.9 |

---

## Commands

```bash
npm start          # Dev server at http://localhost:4200
npm run build      # Development build
npm run build:prod # Production build (optimized)
npm run deploy     # Production build + Firebase Hosting deploy
```

---

## Project Structure

```
src/app/
├── app.config.ts          # App bootstrap & Firebase providers
├── app.routes.ts          # Route definitions
├── app.ts                 # Root component
│
├── components/
│   ├── area-edit-dialog/  # Dialog for editing area name/type
│   ├── confirm-dialog/    # Generic confirmation dialog
│   ├── list/              # Tabular area browser page
│   ├── login/             # Google OAuth login page
│   ├── map/               # Reusable OpenLayers map component
│   ├── overview/          # Main map + area list page
│   └── record/            # GPS recording / cadastre selection page
│
├── guards/
│   └── auth.guard.ts      # Protects all routes except /login
│
├── models/
│   └── area.ts            # SavedArea model + area type definitions
│
└── services/
    ├── area.service.ts    # Firestore CRUD for areas
    ├── auth.service.ts    # Firebase Google OAuth + email whitelist
    └── geolocation.service.ts  # Browser Geolocation API wrapper
```

---

## Setup

### Prerequisites

- Node.js 20+
- Angular CLI: `npm install -g @angular/cli`
- Firebase CLI: `npm install -g firebase-tools`

### Install

```bash
git clone <repository-url>
cd hektarix
npm install
```

### Firebase configuration

Add your Firebase project config to `src/environments/`:

```ts
// src/environments/environment.ts
export const environment = {
  production: false,
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.appspot.com',
    messagingSenderId: 'SENDER_ID',
    appId: 'APP_ID'
  }
};
```

---

## Map Layers

The map component supports configurable base layers and overlays with per-layer opacity/width sliders:

**Base layers**
- Kataster (BEV) — Austrian cadastre via Mapbox GL style

**Overlays**
- Straße (OpenStreetMap)
- Satellit (ESRI World Imagery)
- Topografie (OpenTopoMap)
- Kataster Umrisse — vector tile parcel outlines (BEV)
- Orthofoto (BEV) — aerial imagery from BEV

---

## Author

Developed with Angular, Firebase, and OpenLayers.
