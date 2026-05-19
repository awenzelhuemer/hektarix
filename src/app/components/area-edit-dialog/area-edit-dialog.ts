import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AREA_TYPES, AreaType, SavedArea } from '../../models/area';

@Component({
  selector: 'app-area-edit-dialog',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatIconModule],
  templateUrl: './area-edit-dialog.html',
  styleUrl: './area-edit-dialog.scss',
})
export class AreaEditDialogComponent {
  private readonly data: SavedArea = inject(MAT_DIALOG_DATA);
  readonly areaTypes = Object.entries(AREA_TYPES).map(([key, val]) => ({ key: key as AreaType, ...val }));

  name = this.data.name ?? '';
  note = this.data.note ?? '';
  type: AreaType = this.data.type;
  readonly createdAt = this.data.createdAt;
  readonly lastModifiedAt = this.data.lastModifiedAt;

  formatDate(ts?: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('de-AT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  get result(): Pick<SavedArea, 'name' | 'note' | 'type'> {
    return {
      name: this.name.trim() || undefined,
      note: this.note.trim() || undefined,
      type: this.type,
    };
  }
}
