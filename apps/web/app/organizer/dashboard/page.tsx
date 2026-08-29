'use client';

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  LogOut,
  ScanLine,
  Star,
  Ticket,
  TrendingUp,
} from 'lucide-react';
import { eur } from '@nocturne/types';
import { getSupabase } from '../../../lib/supabase-browser';

type Access =
  | 'loading'
  | 'guest'
  | 'forbidden'
  | 'pending'
  | 'ready';

type EventRow = {
  id: string;
  slug: string;
  title: string;
  city: string;
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'published' | 'cancelled';
  publish_at: string | null;
};

type TicketRow = {
  event_id: string;
  quantity: number;
  sold_quantity: number;
  price_cents: number;
};

type ReviewRow = {
  event_id: string;
  rating: number;
  feedback: string | null;
  created_at: string;
};

type CheckInRow = {
  id: string;
  event_id: string;
  scanned_at: string;
  tickets: {
    public_code: string;
  } | null;
  scan_sessions: {
    label: string;
  } | null;
  profiles: {
    display_name: string;
  } | null;
};

function conceptName(title: string) {
  return (
    title
      .replace(
        /\s*[-–—:]?\s*(édition|edition|ed\.?|vol\.?|volume)\s*[#n°]?\s*\d+.*$/i,
        ''
      )
      .replace(/\s*[#n°]\s*\d+.*$/i, '')
      .trim() || title
  );
}

function eventState(event: EventRow, now: Date) {
  if (event.status === 'cancelled') {
    return 'Annulée';
  }

  if (
    event.status === 'published' ||
    (event.publish_at && new Date(event.publish_at) <= now)
  ) {
    return 'Publiée';
  }

  if (event.publish_at) {
    return 'Programmée';
  }

  return 'Brouillon';
}

function OrganizerDashboardContent() {
  const searchParams = useSearchParams();
  const selectionReady = useRef(false);

  const [access, setAccess] = useState<Access>('loading');
  const [organization, setOrganization] = useState(
    'Votre organisation'
  );
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInRow[]>([]);

  const [selectedEventId, setSelectedEventId] = useState(
    () => searchParams.get('event') ?? ''
  );

  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectionReady.current) {
      selectionReady.current = true;

      const stored = window.sessionStorage.getItem(
        'nocturne-control-event'
      );

      if (!selectedEventId && stored) {
        setSelectedEventId(stored);
      }

      return;
    }

    if (selectedEventId) {
      window.sessionStorage.setItem(
        'nocturne-control-event',
        selectedEventId
      );
    } else {
      window.sessionStorage.removeItem(
        'nocturne-control-event'
      );
    }
  }, [selectedEventId]);

  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabase();

        const { data: auth } =
          await supabase.auth.getUser();

        if (!auth.user) {
          setAccess('guest');
          return;
        }

        const [
          { data: profile },
          { data: organizer },
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select('role')
            .eq('id', auth.user.id)
            .single(),

          supabase
            .from('organizer_profiles')
            .select('name')
            .eq('profile_id', auth.user.id)
            .maybeSingle(),
        ]);

        if (profile?.role === 'organizer_pending') {
          setAccess('pending');
          return;
        }

        if (profile?.role !== 'organizer') {
          setAccess('forbidden');
          return;
        }

        setOrganization(
          organizer?.name ||
            auth.user.email?.split('@')[0] ||
            'Votre organisation'
        );

        const {
          data: eventRows,
          error: eventError,
        } = await supabase
          .from('events')
          .select(
            'id,slug,title,city,starts_at,ends_at,status,publish_at'
          )
          .eq('organizer_id', auth.user.id)
          .order('starts_at');

        if (eventError) {
          throw eventError;
        }

        const rows = (eventRows ?? []) as EventRow[];

        setEvents(rows);

        const ids = rows.map((item) => item.id);

        if (ids.length) {
          const [
            {
              data: ticketRows,
              error: ticketError,
            },
            { data: reviewRows },
            { data: checkInRows },
          ] = await Promise.all([
            supabase
              .from('ticket_types')
              .select(
                'event_id,quantity,sold_quantity,price_cents'
              )
              .in('event_id', ids),

            supabase
              .from('event_reviews')
              .select(
                'event_id,rating,feedback,created_at'
              )
              .in('event_id', ids)
              .order('created_at', {
                ascending: false,
              }),

            supabase
              .from('check_ins')
              .select(
                'id,event_id,scanned_at,tickets(public_code),scan_sessions(label),profiles!check_ins_scanned_by_fkey(display_name)'
              )
              .in('event_id', ids)
              .order('scanned_at', {
                ascending: false,
              }),
          ]);

          if (ticketError) {
            throw ticketError;
          }

          setTickets(
            (ticketRows ?? []) as TicketRow[]
          );

          setReviews(
            (reviewRows ?? []) as ReviewRow[]
          );

          setCheckIns(
            (checkInRows ?? []) as unknown as CheckInRow[]
          );
        }

        setAccess('ready');
      } catch (loadError) {
        console.error(loadError);

        setError(
          'Certaines données du tableau de bord n’ont pas pu être chargées.'
        );

        setAccess('ready');
      }
    }

    load();
  }, []);

  useEffect(() => {
    const ids = events.map((event) => event.id);

    if (!ids.length) {
      return;
    }

    async function refreshCheckIns() {
      const { data } = await getSupabase()
        .from('check_ins')
        .select(
          'id,event_id,scanned_at,tickets(public_code),scan_sessions(label),profiles!check_ins_scanned_by_fkey(display_name)'
        )
        .in('event_id', ids)
        .order('scanned_at', {
          ascending: false,
        });

      if (data) {
        setCheckIns(
          data as unknown as CheckInRow[]
        );
      }
    }

    const timer = setInterval(
      () => void refreshCheckIns(),
      5000
    );

    return () => clearInterval(timer);
  }, [events]);

  const data = useMemo(() => {
    const now = new Date();

    const liveEvents = events.filter(
      (item) => item.status !== 'cancelled'
    );

    const upcoming = liveEvents
      .filter(
        (item) =>
          new Date(item.starts_at) >= now
      )
      .sort((a, b) =>
        a.starts_at.localeCompare(b.starts_at)
      );

    const sold = tickets.reduce(
      (sum, item) =>
        sum + item.sold_quantity,
      0
    );

    const capacity = tickets.reduce(
      (sum, item) =>
        sum + item.quantity,
      0
    );

    const revenue = tickets.reduce(
      (sum, item) =>
        sum +
        item.sold_quantity *
          item.price_cents,
      0
    );

    const drafts = liveEvents.filter(
      (item) =>
        eventState(item, now) ===
        'Brouillon'
    );

    const scheduled = liveEvents.filter(
      (item) =>
        eventState(item, now) ===
        'Programmée'
    );

    const nearCapacity = upcoming.filter(
      (event) => {
        const rows = tickets.filter(
          (ticket) =>
            ticket.event_id === event.id
        );

        const total = rows.reduce(
          (sum, row) =>
            sum + row.quantity,
          0
        );

        const eventSold = rows.reduce(
          (sum, row) =>
            sum + row.sold_quantity,
          0
        );

        return (
          total > 0 &&
          eventSold / total >= 0.8
        );
      }
    );

    const globalRating = reviews.length
      ? reviews.reduce(
          (sum, item) =>
            sum + item.rating,
          0
        ) / reviews.length
      : 0;

    const concepts = new Map<
      string,
      {
        sum: number;
        count: number;
        events: Set<string>;
      }
    >();

    reviews.forEach((review) => {
      const event = events.find(
        (item) =>
          item.id === review.event_id
      );

      if (!event) {
        return;
      }

      const name = conceptName(
        event.title
      );

      const current =
        concepts.get(name) ?? {
          sum: 0,
          count: 0,
          events: new Set<string>(),
        };

      current.sum += review.rating;
      current.count++;
      current.events.add(event.id);

      concepts.set(name, current);
    });

    const conceptRatings = [
      ...concepts.entries(),
    ]
      .map(([name, value]) => ({
        name,
        rating:
          value.sum / value.count,
        reviews: value.count,
        editions: value.events.size,
      }))
      .sort(
        (a, b) =>
          b.rating - a.rating ||
          b.reviews - a.reviews
      );

    const recentFeedback = reviews
      .filter((item) => item.feedback)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        eventTitle:
          events.find(
            (event) =>
              event.id === item.event_id
          )?.title ?? 'Soirée',
      }));

    return {
      upcoming,
      sold,
      capacity,
      revenue,
      drafts,
      scheduled,
      nearCapacity,
      occupancy: capacity
        ? Math.round(
            (sold / capacity) * 100
          )
        : 0,
      globalRating,
      conceptRatings,
      recentFeedback,
    };
  }, [events, tickets, reviews]);

  async function logout() {
    await getSupabase().auth.signOut();

    location.assign(
      '/organizer/auth'
    );
  }

  if (access === 'loading') {
    return (
      <main className="dashboard">
        <p>
          Chargement du tableau de
          bord…
        </p>
      </main>
    );
  }

  if (access === 'guest') {
    return (
      <main className="dashboard organizer-access">
        <p className="eyebrow">
          ESPACE ORGANISATION
        </p>

        <h1>
          Connectez-vous pour accéder
          au tableau de bord.
        </h1>

        <Link
          className="cta"
          href="/organizer/auth"
        >
          Connexion organisateur
        </Link>
      </main>
    );
  }

  if (access === 'pending') {
    return (
      <main className="dashboard organizer-access">
        <p className="eyebrow">
          VALIDATION EN COURS
        </p>

        <h1>
          Votre organisation est en
          cours de validation.
        </h1>

        <button
          className="pro-logout"
          onClick={logout}
        >
          <LogOut size={16} />
          Se déconnecter
        </button>
      </main>
    );
  }

  if (access === 'forbidden') {
    return (
      <main className="dashboard organizer-access">
        <p className="eyebrow">
          ACCÈS RÉSERVÉ
        </p>

        <h1>
          Ce tableau de bord est réservé
          aux organisations.
        </h1>

        <button
          className="pro-logout"
          onClick={logout}
        >
          <LogOut size={16} />
          Changer de compte
        </button>
      </main>
    );
  }

  const alerts = [
    ...(data.drafts.length
      ? [
          `${data.drafts.length} brouillon${
            data.drafts.length > 1
              ? 's'
              : ''
          } à finaliser`,
        ]
      : []),

    ...(data.scheduled.length
      ? [
          `${data.scheduled.length} publication${
            data.scheduled.length > 1
              ? 's'
              : ''
          } programmée${
            data.scheduled.length > 1
              ? 's'
              : ''
          }`,
        ]
      : []),

    ...(data.nearCapacity.length
      ? [
          `${data.nearCapacity.length} soirée${
            data.nearCapacity.length > 1
              ? 's'
              : ''
          } remplie${
            data.nearCapacity.length > 1
              ? 's'
              : ''
          } à plus de 80 %`,
        ]
      : []),

    ...(!data.upcoming.length
      ? [
          'Aucune soirée à venir : commencez votre programmation',
        ]
      : []),
  ];

  const mobileEvents = events.filter(
    (event) =>
      event.status === 'published' &&
      new Date(event.ends_at) >=
        new Date()
  );

  const selectedEvent =
    mobileEvents.find(
      (event) =>
        event.id === selectedEventId
    ) ?? null;

  const selectedHistory =
    selectedEvent
      ? checkIns.filter(
          (item) =>
            item.event_id ===
            selectedEvent.id
        )
      : [];

  const selectedCheckIns =
    selectedHistory.length;

  return (
    <>
      <section className="pro-mobile-control">
        <header>
          <p className="eyebrow">
            CONTRÔLE DES ENTRÉES
          </p>

          <h1>
            {selectedEvent
              ? 'Votre soirée.'
              : 'Choisissez une soirée.'}
          </h1>

          <p>
            {selectedEvent
              ? 'Suivez les entrées et ouvrez le scanner.'
              : 'Sélectionnez une soirée en cours ou à venir.'}
          </p>
        </header>

        {!selectedEvent ? (
          <div className="pro-mobile-event-list">
            {mobileEvents.length ? (
              mobileEvents.map(
                (event) => (
                  <button
                    type="button"
                    key={event.id}
                    onClick={() =>
                      setSelectedEventId(
                        event.id
                      )
                    }
                  >
                    <time>
                      <strong>
                        {new Date(
                          event.starts_at
                        ).toLocaleDateString(
                          'fr-FR',
                          {
                            day: '2-digit',
                          }
                        )}
                      </strong>

                      <span>
                        {new Date(
                          event.starts_at
                        )
                          .toLocaleDateString(
                            'fr-FR',
                            {
                              month:
                                'short',
                            }
                          )
                          .replace(
                            '.',
                            ''
                          )}
                      </span>
                    </time>

                    <span>
                      <strong>
                        {event.title}
                      </strong>

                      <small>
                        {event.city} ·{' '}
                        {new Date(
                          event.starts_at
                        ).toLocaleTimeString(
                          'fr-FR',
                          {
                            hour: '2-digit',
                            minute:
                              '2-digit',
                          }
                        )}
                      </small>
                    </span>

                    <ArrowRight
                      size={20}
                    />
                  </button>
                )
              )
            ) : (
              <div className="pro-empty">
                <CalendarDays
                  size={26}
                />

                <p>
                  Aucune soirée en cours
                  ou à venir.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="pro-mobile-selected">
            <button
              className="pro-mobile-change"
              type="button"
              onClick={() =>
                setSelectedEventId('')
              }
            >
              Changer de soirée
            </button>

            <article>
              <p>
                {selectedEvent.title}
              </p>

              <small>
                {new Date(
                  selectedEvent.starts_at
                ).toLocaleString(
                  'fr-FR',
                  {
                    dateStyle:
                      'medium',
                    timeStyle:
                      'short',
                  }
                )}
              </small>

              <CheckCircle2 />

              <strong>
                {selectedCheckIns}
              </strong>

              <span>
                personne
                {selectedCheckIns > 1
                  ? 's'
                  : ''}{' '}
                scannée
                {selectedCheckIns > 1
                  ? 's'
                  : ''}
              </span>
            </article>

            <Link
              className="pro-mobile-scan"
              href={`/organizer/scan?event=${selectedEvent.id}`}
            >
              <ScanLine size={24} />
              Scanner un billet
            </Link>

            {selectedHistory.length >
              0 && (
              <section className="pro-mobile-history">
                <p className="eyebrow">
                  DERNIÈRES ENTRÉES
                </p>

                {selectedHistory
                  .slice(0, 8)
                  .map(
                    (
                      entry,
                      index
                    ) => (
                      <div
                        key={
                          entry.id
                        }
                      >
                        <CheckCircle2
                          size={
                            16
                          }
                        />

                        <span>
                          Entrée #
                          {selectedCheckIns -
                            index}
                        </span>

                        <time>
                          {new Date(
                            entry.scanned_at
                          ).toLocaleTimeString(
                            'fr-FR',
                            {
                              hour: '2-digit',
                              minute:
                                '2-digit',
                              second:
                                '2-digit',
                            }
                          )}
                        </time>
                      </div>
                    )
                  )}
              </section>
            )}
          </div>
        )}
      </section>

      <div className="pro-desktop-dashboard">
        <header className="pro-dashboard-header">
          <div>
            <p className="eyebrow">
              TABLEAU DE BORD
            </p>

            <h1>
              Bonjour, {organization}.
            </h1>

            <p>
              Voici l’essentiel de votre
              activité et les prochaines
              actions utiles.
            </p>
          </div>

          <Link
            className="cta"
            href="/organizer?view=create"
          >
            <CalendarPlus
              size={18}
            />
            Créer une soirée
          </Link>
        </header>

        {error && (
          <p className="profile-error">
            {error}
          </p>
        )}

        <div className="pro-kpi-grid has-rating">
          <article>
            <span>
              <CalendarDays
                size={18}
              />
              Soirées à venir
            </span>

            <strong>
              {data.upcoming.length}
            </strong>

            <small>
              {events.length} créée
              {events.length > 1
                ? 's'
                : ''}{' '}
              au total
            </small>
          </article>

          <article>
            <span>
              <Ticket size={18} />
              Billets vendus
            </span>

            <strong>
              {data.sold}
            </strong>

            <small>
              Sur {data.capacity} places
              ouvertes
            </small>
          </article>

          <article>
            <span>
              <CircleDollarSign
                size={18}
              />
              Volume brut
            </span>

            <strong>
              {eur(data.revenue)}
            </strong>

            <small>
              Billetterie avant frais
            </small>
          </article>

          <article>
            <span>
              <Gauge size={18} />
              Remplissage
            </span>

            <strong>
              {data.occupancy} %
            </strong>

            <small>
              Toutes vos soirées
            </small>
          </article>

          <article>
            <span>
              <Star size={18} />
              Note globale
            </span>

            <strong>
              {reviews.length
                ? `${data.globalRating.toFixed(
                    1
                  )} / 5`
                : '—'}
            </strong>

            <small>
              {reviews.length} avis reçu
              {reviews.length > 1
                ? 's'
                : ''}
            </small>
          </article>
        </div>

        <div className="pro-dashboard-grid">
          <section className="pro-dashboard-card pro-next-events">
            <div className="pro-card-title">
              <div>
                <p className="eyebrow">
                  PROGRAMMATION
                </p>

                <h2>
                  Prochaines soirées
                </h2>
              </div>

              <Link href="/organizer">
                Tout gérer{' '}
                <ArrowRight
                  size={15}
                />
              </Link>
            </div>

            {data.upcoming.length ===
            0 ? (
              <div className="pro-empty">
                <CalendarPlus
                  size={25}
                />

                <p>
                  Votre prochaine date
                  apparaîtra ici.
                </p>

                <Link href="/organizer?view=create">
                  Créer une première
                  soirée
                </Link>
              </div>
            ) : (
              <div className="pro-next-list">
                {data.upcoming
                  .slice(0, 4)
                  .map((event) => {
                    const rows =
                      tickets.filter(
                        (item) =>
                          item.event_id ===
                          event.id
                      );

                    const sold =
                      rows.reduce(
                        (
                          sum,
                          item
                        ) =>
                          sum +
                          item.sold_quantity,
                        0
                      );

                    const capacity =
                      rows.reduce(
                        (
                          sum,
                          item
                        ) =>
                          sum +
                          item.quantity,
                        0
                      );

                    const rate =
                      capacity
                        ? Math.round(
                            (sold /
                              capacity) *
                              100
                          )
                        : 0;

                    return (
                      <Link
                        href={`/organizer/events/${event.id}`}
                        key={
                          event.id
                        }
                      >
                        <time>
                          <strong>
                            {new Date(
                              event.starts_at
                            ).toLocaleDateString(
                              'fr-FR',
                              {
                                day: '2-digit',
                              }
                            )}
                          </strong>

                          <span>
                            {new Date(
                              event.starts_at
                            )
                              .toLocaleDateString(
                                'fr-FR',
                                {
                                  month:
                                    'short',
                                }
                              )
                              .replace(
                                '.',
                                ''
                              )}
                          </span>
                        </time>

                        <div>
                          <h3>
                            {
                              event.title
                            }
                          </h3>

                          <small>
                            {
                              event.city
                            }{' '}
                            ·{' '}
                            {new Date(
                              event.starts_at
                            ).toLocaleTimeString(
                              'fr-FR',
                              {
                                hour: '2-digit',
                                minute:
                                  '2-digit',
                              }
                            )}
                          </small>

                          <div className="pro-progress">
                            <i
                              style={{
                                width: `${Math.min(
                                  rate,
                                  100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>

                        <em>
                          {sold}/
                          {capacity}

                          <small>
                            {rate}%
                          </small>
                        </em>
                      </Link>
                    );
                  })}
              </div>
            )}
          </section>

          <aside className="pro-dashboard-card pro-actions">
            <div className="pro-card-title">
              <div>
                <p className="eyebrow">
                  À TRAITER
                </p>

                <h2>
                  Actions rapides
                </h2>
              </div>
            </div>

            {alerts.map(
              (alert, index) => (
                <div
                  className="pro-action-row"
                  key={alert}
                >
                  {index === 2 ? (
                    <TrendingUp
                      size={18}
                    />
                  ) : (
                    <AlertCircle
                      size={18}
                    />
                  )}

                  <span>
                    {alert}
                  </span>
                </div>
              )
            )}

            <Link
              className="pro-action-link"
              href="/organizer"
            >
              Ouvrir ma programmation{' '}
              <ArrowRight
                size={15}
              />
            </Link>
          </aside>
        </div>

        <section className="pro-dashboard-card pro-rating-insights">
          <div className="pro-card-title">
            <div>
              <p className="eyebrow">
                SATISFACTION
              </p>

              <h2>
                Retours et performance
                par type de soirée
              </h2>
            </div>

            <span className="event-status">
              {reviews.length} avis
            </span>
          </div>

          {data.conceptRatings.length ? (
            <>
              <div className="pro-concept-list">
                {data.conceptRatings
                  .slice(0, 8)
                  .map((concept) => (
                    <article
                      className="pro-concept-row"
                      key={
                        concept.name
                      }
                    >
                      <div>
                        <h3>
                          {
                            concept.name
                          }
                        </h3>

                        <strong>
                          ★{' '}
                          {concept.rating.toFixed(
                            1
                          )}
                        </strong>
                      </div>

                      <small>
                        {concept.reviews}{' '}
                        avis ·{' '}
                        {
                          concept.editions
                        }{' '}
                        édition
                        {concept.editions >
                        1
                          ? 's'
                          : ''}
                      </small>

                      <div className="pro-rating-bar">
                        <i
                          style={{
                            width: `${
                              (concept.rating /
                                5) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </article>
                  ))}
              </div>

              {data.recentFeedback
                .length > 0 && (
                <div className="pro-feedback-list">
                  <h3>
                    Derniers
                    commentaires
                  </h3>

                  {data.recentFeedback.map(
                    (
                      review,
                      index
                    ) => (
                      <blockquote
                        key={`${review.event_id}-${index}`}
                      >
                        <div>
                          <strong>
                            {
                              review.eventTitle
                            }
                          </strong>

                          <span>
                            ★{' '}
                            {
                              review.rating
                            }
                            /5
                          </span>
                        </div>

                        <p>
                          {
                            review.feedback
                          }
                        </p>

                        <small>
                          {new Date(
                            review.created_at
                          ).toLocaleDateString(
                            'fr-FR'
                          )}
                        </small>
                      </blockquote>
                    )
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="pro-empty">
              <Star size={24} />

              <p>
                Les notes apparaîtront
                ici après vos premières
                soirées.
              </p>
            </div>
          )}
        </section>

        <section className="pro-dashboard-card pro-scan-audit">
          <div className="pro-card-title">
            <div>
              <p className="eyebrow">
                CONTRÔLE DES ENTRÉES
              </p>

              <h2>
                Derniers billets
                scannés
              </h2>
            </div>

            <span className="event-status">
              {checkIns.length} entrées
            </span>
          </div>

          {checkIns.length ? (
            <div className="pro-scan-audit-list">
              {checkIns
                .slice(0, 20)
                .map((entry) => (
                  <article
                    key={entry.id}
                  >
                    <strong>
                      {entry.tickets
                        ?.public_code ??
                        'Ancien billet'}
                    </strong>

                    <span>
                      {entry.profiles
                        ?.display_name ||
                        'Compte organisateur'}
                    </span>

                    <span>
                      {entry.scan_sessions
                        ?.label ||
                        'Session historique'}
                    </span>

                    <time>
                      {new Date(
                        entry.scanned_at
                      ).toLocaleString(
                        'fr-FR',
                        {
                          dateStyle:
                            'short',
                          timeStyle:
                            'medium',
                        }
                      )}
                    </time>
                  </article>
                ))}
            </div>
          ) : (
            <div className="pro-empty">
              <ScanLine size={25} />

              <p>
                Les contrôles
                apparaîtront ici dès le
                premier scan.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default function OrganizerDashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="dashboard">
          <p>
            Chargement du tableau de
            bord…
          </p>
        </main>
      }
    >
      <OrganizerDashboardContent />
    </Suspense>
  );
}
