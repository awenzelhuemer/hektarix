export const AREAS_KEY = 'hektarix-areas';

export const AREA_TYPES = {
  forest: { label: 'Forest', color: '#2d6a4f' },
  field:  { label: 'Field',  color: '#e9c46a' },
} as const;

export type AreaType = keyof typeof AREA_TYPES;

export interface SavedArea {
  id: string;
  name?: string;
  type: AreaType;
  points: [number, number][];
}
