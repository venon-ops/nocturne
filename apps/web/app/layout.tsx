import type { Metadata } from 'next';
import './styles.css';
import { Suspense } from 'react';
import RoleRouteGuard from './components/RoleRouteGuard';
export const metadata: Metadata = { title: 'NOCTURNE — live differently', description: 'Billetterie sociale pour la nuit.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fr"><body><Suspense><RoleRouteGuard/></Suspense>{children}</body></html>; }

