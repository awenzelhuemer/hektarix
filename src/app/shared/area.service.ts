import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  setDoc,
  deleteDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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

  private get col() {
    return collection(this.firestore, 'areas');
  }

  private areaDoc(id: string) {
    return doc(this.firestore, `areas/${id}`);
  }

  watchAreas(): Observable<SavedArea[]> {
    return (collectionData(this.col) as Observable<StoredArea[]>).pipe(
      map(docs => docs.map(fromStored))
    );
  }

  async saveArea(area: SavedArea): Promise<void> {
    await setDoc(this.areaDoc(area.id), toStored(area));
  }

  async deleteArea(id: string): Promise<void> {
    await deleteDoc(this.areaDoc(id));
  }
}
