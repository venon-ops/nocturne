import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'NOCTURNE — live differently', description: 'Billetterie sociale pour la nuit.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fr"><body>{children}</body></html>; }
