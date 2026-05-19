import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrl: './login.scss',
  imports: [MatButtonModule, MatIconModule],
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  error = '';

  async signIn(): Promise<void> {
    try {
      await this.authService.signInWithGoogle();
      this.router.navigate(['/']);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.';
    }
  }
}
