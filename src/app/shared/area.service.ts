import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { SavedArea, AreaType } from './area';
import { AuthService } from './auth.service';

interface StoredArea {
  id: string;
  name?: string;
  type: AreaType;
  points: { lat: number; lng: number }[];
}

function toStored(area: SavedArea): StoredArea {
  return { ...area, points: area.points.map(([lat, lng]) => ({ lat, lng })) };
}

function fromStored(data: StoredArea): SavedArea {
  return { ...data, points: data.points.map(({ lat, lng }) => [lat, lng]) };
}

@Injectable({ providedIn: 'root' })
export class AreaService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  private get col() {
    const uid = this.auth.uid;
    if (!uid) throw new Error('Nicht angemeldet');
    return collection(this.firestore, `users/${uid}/areas`);
  }

  private areaDoc(id: string) {
    const uid = this.auth.uid;
    if (!uid) throw new Error('Nicht angemeldet');
    return doc(this.firestore, `users/${uid}/areas/${id}`);
  }

  async loadAreas(): Promise<SavedArea[]> {
    const snap = await getDocs(this.col);
    return snap.docs.map((d) => fromStored(d.data() as StoredArea));
  }

  async saveArea(area: SavedArea): Promise<void> {
    await setDoc(this.areaDoc(area.id), toStored(area));
  }

  async deleteArea(id: string): Promise<void> {
    await deleteDoc(this.areaDoc(id));
  }

  async saveAll(areas: SavedArea[]): Promise<void> {
    const snap = await getDocs(this.col);
    const batch = writeBatch(this.firestore);
    snap.docs.forEach((d) => batch.delete(d.ref));
    areas.forEach((area) => batch.set(this.areaDoc(area.id), toStored(area)));
    await batch.commit();
  }
}
