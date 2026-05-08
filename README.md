# Hektarix

Hektarix is a modern web application for managing land parcels, forests, agricultural fields, and other mapped areas.

The application allows users to draw, edit, organize, and manage property boundaries directly on an interactive map. Different area types such as forests, fields, and other land categories are visually distinguished and automatically calculated.

---

# Features

## Interactive Map Management

* Draw and edit land boundaries directly on the map
* Rearrange and organize mapped areas
* Interactive GIS-like workflow using Leaflet
* Visual differentiation between forests, fields, and other area types

## Automatic Area Calculation

* Automatic calculation of area sizes in square meters (m²)
* Live updates when polygons are edited
* Clear display of total and individual area sizes

## Modern Web Stack

* Frontend built with Angular
* Backend powered by Firebase
* Real-time data synchronization
* Cloud-hosted infrastructure

## Area Types

Hektarix supports different land categories including:

* Forests
* Agricultural fields
* Grassland
* Custom land areas

Each area type is displayed with its own styling and color configuration.

---

# Tech Stack

## Frontend

* Angular
* TypeScript
* Leaflet
* Angular Material

## Backend

* Firebase Authentication
* Cloud Firestore
* Firebase Hosting
* Firebase Functions (optional)

---

# Installation

## Prerequisites

Make sure the following tools are installed:

* Node.js
* Angular CLI
* Firebase CLI

```bash
npm install -g @angular/cli
npm install -g firebase-tools
```

---

# Setup

Clone the repository:

```bash
git clone <repository-url>
cd hektarix
```

Install dependencies:

```bash
npm install
```

Configure Firebase:

```bash
firebase login
firebase init
```

Add your Firebase configuration to:

```bash
src/environments/environment.ts
```

Example:

```ts
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

# Development Server

Run the Angular development server:

```bash
ng serve
```

Open your browser at:

```text
http://localhost:4200
```

---

# Build

Create a production build:

```bash
ng build
```

---

# Firebase Deployment

Deploy the application:

```bash
firebase deploy
```

---

# Leaflet Integration

Hektarix uses Leaflet for rendering and editing geographic data.

Main features include:

* Polygon drawing
* Polygon editing
* Area calculations
* Layer styling
* Dynamic rendering of land types

---

# Project Structure

```text
src/
 ├── app/
 │    ├── components/
 │    ├── services/
 │    ├── models/
 │    ├── pages/
 │    └── shared/
 │
 ├── assets/
 ├── environments/
 └── styles/
```

---

# Future Ideas

* Satellite map integration
* Export to GeoJSON
* PDF reports
* Multi-user collaboration
* GPS field tracking
* Mobile optimization
* Offline support
* Statistics dashboard

---

# Author

Developed with ❤️ using Angular, Firebase, and Leaflet.
