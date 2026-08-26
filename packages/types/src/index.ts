export type Role = 'user' | 'artist_pending' | 'artist_verified' | 'organizer' | 'admin';
export type EventStatus = 'draft' | 'published' | 'cancelled';
export type TicketStatus = 'valid' | 'used' | 'refunded' | 'cancelled';
export type PostKind = 'event' | 'music' | 'update';

export interface ArtistProfile { id: string; handle: string; displayName: string; avatarUrl?: string; bio?: string; followersCount: number; verified: boolean }
export interface Event { id: string; slug: string; title: string; startsAt: string; endsAt?: string; city: string; genre: string; coverUrl: string; venueName: string; artist?: ArtistProfile; status: EventStatus; minPriceCents: number }
export interface TicketType { id: string; eventId: string; name: string; priceCents: number; currency: 'EUR'; quantity: number; soldQuantity: number; saleStartsAt?: string; saleEndsAt?: string }
export interface Ticket { id: string; orderId: string; ticketTypeId: string; eventId: string; qrToken: string; status: TicketStatus; attendeeName?: string }
export interface FeedPost { id: string; artist: ArtistProfile; kind: PostKind; body: string; createdAt: string; mediaUrl?: string; event?: Pick<Event, 'id' | 'slug' | 'title' | 'startsAt' | 'city' | 'coverUrl'> }
export type ApiResult<T> = { data: T; error?: never } | { data?: never; error: { code: string; message: string } };
export const eur = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
