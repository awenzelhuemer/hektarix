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

  async loadAreas(): Promise<SavedArea[]> {
    const snap = await getDocs(collection(this.firestore, 'areas'));
    return snap.docs.map((d) => fromStored(d.data() as StoredArea));
  }

  async saveArea(area: SavedArea): Promise<void> {
    await setDoc(doc(this.firestore, 'areas', area.id), toStored(area));
  }

  async deleteArea(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'areas', id));
  }

  async saveAll(areas: SavedArea[]): Promise<void> {
    const snap = await getDocs(collection(this.firestore, 'areas'));
    const batch = writeBatch(this.firestore);
    snap.docs.forEach((d) => batch.delete(d.ref));
    areas.forEach((area) => batch.set(doc(this.firestore, 'areas', area.id), toStored(area)));
    await batch.commit();
  }
}
