import type { ArtistProfile, Event, FeedPost, TicketType } from '@nocturne/types';
export const artists: ArtistProfile[] = [
  { id: 'a1', handle: 'lyra', displayName: 'LYRA', followersCount: 12400, verified: true, avatarUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=200&q=80' },
  { id: 'a2', handle: 'synthese', displayName: 'SYNTHÈSE', followersCount: 8900, verified: true, avatarUrl: 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=200&q=80' }
];
export const events: Event[] = [
  { id: 'e1', slug: 'lyra-all-night-long', title: 'LYRA — ALL NIGHT LONG', startsAt: '2026-09-12T22:30:00+02:00', endsAt: '2026-09-13T06:00:00+02:00', city: 'Paris', genre: 'Techno hypnotique', coverUrl: 'https://images.unsplash.com/photo-1571266028243-d220c9c3b9a0?auto=format&fit=crop&w=1400&q=85', venueName: 'La Station', artist: artists[0], status: 'published', minPriceCents: 1800 },
  { id: 'e2', slug: 'synthese-pulse', title: 'PULSE w/ SYNTHÈSE', startsAt: '2026-09-18T23:00:00+02:00', city: 'Lyon', genre: 'Electro / breaks', coverUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=85', venueName: 'Le Sucre', artist: artists[1], status: 'published', minPriceCents: 1400 },
  { id: 'e3', slug: 'orbit-club-opening', title: 'ORBIT — OPENING NIGHT', startsAt: '2026-09-26T23:30:00+02:00', city: 'Marseille', genre: 'House solaire', coverUrl: 'https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?auto=format&fit=crop&w=1400&q=85', venueName: 'Cabaret Aléatoire', status: 'published', minPriceCents: 1200 }
];
export const posts: FeedPost[] = [
  { id: 'p1', artist: artists[0], kind: 'event', body: 'Paris, je vous retrouve pour une nuit sans interruption. J’ai préparé quelque chose de très spécial.', createdAt: 'Il y a 2 h', event: events[0], mediaUrl: events[0].coverUrl },
  { id: 'p2', artist: artists[1], kind: 'music', body: 'Mon nouveau morceau « Aube » est sorti. Écoutez-le avant notre prochaine date à Lyon.', createdAt: 'Hier', mediaUrl: 'https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&w=1200&q=85' }
];
export const ticketTypes: TicketType[] = [{ id: 't1', eventId: 'e1', name: 'Early bird', priceCents: 1800, quantity: 100, soldQuantity: 82, currency: 'EUR' }, { id: 't2', eventId: 'e1', name: 'Regular', priceCents: 2400, quantity: 300, soldQuantity: 104, currency: 'EUR' }];
