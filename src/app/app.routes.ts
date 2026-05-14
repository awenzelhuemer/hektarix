import { Routes } from '@angular/router';
import { authGuard } from './shared/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/overview/overview').then(m => m.OverviewComponent),
  },
  {
    path: 'list',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/list/list').then(m => m.ListComponent),
  },
  {
    path: 'record',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/record/record').then(m => m.RecordComponent),
  },
  { path: '**', redirectTo: '' },
];
