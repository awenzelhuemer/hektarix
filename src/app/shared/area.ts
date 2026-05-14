export const AREA_TYPES = {
  forest: { label: 'Wald', color: '#2d6a4f' },
  field:  { label: 'Feld',  color: '#e9c46a' },
} as const;

export type AreaType = keyof typeof AREA_TYPES;

export interface SavedArea {
  id: string;
  name?: string;
  note?: string;
  type: AreaType;
  points: [number, number][];
  createdAt?: number;
  lastModifiedAt?: number;
}
