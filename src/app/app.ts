import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionDetectedEvent, VersionInstallationFailedEvent, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { AuthService } from './shared/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  readonly authService = inject(AuthService);
  private readonly swUpdate = inject(SwUpdate);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  constructor() {
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
  }

  ngOnInit(): void {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates.subscribe((e) => {
      switch (e.type) {
        case 'VERSION_DETECTED':
          console.log('[SW] VERSION_DETECTED:', (e as VersionDetectedEvent).version);
          break;
        case 'VERSION_READY':
          console.log('[SW] VERSION_READY:', (e as VersionReadyEvent).latestVersion);
          this.showUpdateQuestion();
          break;
        case 'VERSION_INSTALLATION_FAILED':
          console.error('[SW] VERSION_INSTALLATION_FAILED:', (e as VersionInstallationFailedEvent).error);
          break;
      }
    });

    this.swUpdate.unrecoverable.subscribe((e) => {
      console.error('[SW] Unrecoverable state:', e);
      document.location.reload();
    });

    const check = () => this.swUpdate.checkForUpdate().catch(() => { });
    check();
    setInterval(check, 2 * 60 * 1000);
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
    this.router.navigate(['/login']);
  }

  showUpdateQuestion() {
    const snack = this.snackBar.open('Eine neue Version ist verfügbar.', 'Aktualisieren', {
          duration: 0,
        });
        snack.onAction().subscribe(async () => {
          await this.swUpdate.activateUpdate();
          document.location.reload()
        });
  }
}
