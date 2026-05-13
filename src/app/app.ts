import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { AuthService } from './shared/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  readonly authService = inject(AuthService);
  private readonly swUpdate = inject(SwUpdate);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  ngOnInit(): void {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => {
        const snack = this.snackBar.open('Eine neue Version ist verfügbar.', 'Aktualisieren', {
          duration: 0,
        });
        snack.onAction().subscribe(() => document.location.reload());
      });
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }
}
