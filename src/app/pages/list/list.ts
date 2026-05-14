import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDivider } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { AREA_TYPES, AreaType, SavedArea } from '../../shared/area';
import { AreaService } from '../../shared/area.service';
import { AreaEditDialogComponent } from './../../dialogs/area-edit-dialog';

type SortField = 'name' | 'area';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-list',
  templateUrl: './list.html',
  styleUrl: './list.scss',
  imports: [MatButtonModule, MatDivider, MatIconModule],
})
export class ListComponent {
  private readonly areaService = inject(AreaService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly sortBy = signal<SortField>('name');
  readonly sortDir = signal<SortDir>('asc');

  readonly areas = toSignal(this.areaService.watchAreas(), { initialValue: [] as SavedArea[] });

  readonly grouped = computed(() => {
    const sortBy = this.sortBy();
    const sortDir = this.sortDir();

    return (Object.keys(AREA_TYPES) as AreaType[])
      .map(type => {
        const areas = this.areas()
          .filter(a => a.type === type)
          .slice()
          .sort((a, b) => {
            const cmp = sortBy === 'name'
              ? (a.name ?? '').localeCompare(b.name ?? '', 'de', { sensitivity: 'base' })
              : this.calcArea(a.points) - this.calcArea(b.points);
            return sortDir === 'asc' ? cmp : -cmp;
          });

        return {
          type,
          label: AREA_TYPES[type].label,
          color: AREA_TYPES[type].color,
          icon: AREA_TYPES[type].icon,
          areas,
          totalArea: areas.reduce((sum, a) => sum + this.calcArea(a.points), 0),
        };
      })
      .filter(g => g.areas.length > 0);
  });

  toggleSort(field: SortField): void {
    if (this.sortBy() === field) {
      this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDir.set('asc');
    }
  }

  formatDate(ts?: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('de-AT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  formatArea(m2: number): string {
    return `${(m2 / 10000).toFixed(4)} ha`;
  }

  calcArea(points: [number, number][]): number {
    if (points.length < 3) return 0;
    const toRad = (d: number) => d * Math.PI / 180;
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const [lat1, lng1] = points[i];
      const [lat2, lng2] = points[(i + 1) % n];
      area += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
    }
    return Math.abs(area * 6378137 * 6378137 / 2);
  }

  openEdit(area: SavedArea): void {
    this.dialog.open(AreaEditDialogComponent, { data: area, width: '360px' })
      .afterClosed()
      .subscribe((result?: Pick<SavedArea, 'name' | 'note' | 'type'>) => {
        if (result) this.areaService.saveArea({ ...area, ...result });
      });
  }

  editShape(area: SavedArea, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/'], { queryParams: { edit: area.id } });
  }

  delete(area: SavedArea, event: Event): void {
    event.stopPropagation();
    this.areaService.deleteArea(area.id);
  }
}
