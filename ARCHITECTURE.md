# Architecture des produits NOCTURNE

## Produits actuels

- `apps/web` sert le site public sur ordinateur et l’espace organisateur sous `/organizer`. Ils partagent le même déploiement Next.js et le même backend, mais constituent deux expériences distinctes. Deux domaines pourront pointer vers ce déploiement lors de la mise en production.
- `apps/mobile` est l’application publique pour les utilisateurs et les artistes. Elle ne contient plus le scanner ni la dépendance caméra.
- `apps/scan` est l’application professionnelle NOCTURNE Scan. Elle contient la connexion organisateur, la sélection de soirée, le compteur d’entrées et le contrôle des billets.

## Backend commun

Les quatre expériences utilisent le même projet Supabase. Les rôles et les politiques RLS restent la frontière d’autorisation. Le scanner appelle `validate_ticket_token_for_event` afin qu’un billet ne puisse être consommé que pour la soirée sélectionnée.

## Prochaine étape : mode hors connexion

NOCTURNE Scan recevra un manifeste signé des billets avant l’ouverture des portes, conservera localement les validations et synchronisera les check-ins au retour du réseau. Le fonctionnement avec plusieurs appareils devra prévoir une stratégie anti-double-scan entre terminaux hors ligne.

Les outils de bar, de caisse et de gestion opérationnelle de festival resteront hors de NOCTURNE Scan jusqu’à la création éventuelle d’un produit professionnel distinct.
