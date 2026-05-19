import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login').then(m => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./components/overview/overview').then(m => m.OverviewComponent),
  },
  {
    path: 'list',
    canActivate: [authGuard],
    loadComponent: () => import('./components/list/list').then(m => m.ListComponent),
  },
  {
    path: 'record',
    canActivate: [authGuard],
    loadComponent: () => import('./components/record/record').then(m => m.RecordComponent),
  },
  { path: '**', redirectTo: '' },
];
