import { Injectable, inject } from '@angular/core';
import { Auth, GoogleAuthProvider, signInWithPopup, signOut, authState, User } from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);

  readonly user = toSignal<User | null>(authState(this.auth));

  get uid(): string | null {
    return this.user()?.uid ?? null;
  }

  async signInWithGoogle(): Promise<void> {
    const result = await signInWithPopup(this.auth, new GoogleAuthProvider());
    if (!result.user.email || !environment.allowedEmails.includes(result.user.email)) {
      await signOut(this.auth);
      throw new Error('Dieses Konto ist nicht berechtigt, auf Hektarix zuzugreifen.');
    }
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }
}
