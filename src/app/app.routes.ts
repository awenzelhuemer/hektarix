import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/overview/overview').then(m => m.OverviewComponent),
  },
  { path: '**', redirectTo: '' },
];
