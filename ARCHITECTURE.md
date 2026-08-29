# Architecture des produits NOCTURNE

## Produits actuels

- `apps/web` sert le site public sur ordinateur et l’espace organisateur sous `/organizer`. Ils partagent le même déploiement Next.js et le même backend, mais constituent deux expériences distinctes. Deux domaines pourront pointer vers ce déploiement lors de la mise en production.
- `apps/mobile` est l’application publique pour les utilisateurs et les artistes. Elle ne contient plus le scanner ni la dépendance caméra.
- `apps/scan` est l’application professionnelle NOCTURNE Scan. Elle contient la connexion organisateur, la sélection de soirée, le compteur d’entrées et le contrôle des billets.
- `/admin` est un site interne distinct réservé aux comptes de l’équipe NOCTURNE. Il gère la validation des organisations, leurs commissions et la modération. Un compte administrateur n’accède pas à l’espace organisateur et un compte organisateur n’accède pas à l’administration.

## Backend commun

Les quatre expériences utilisent le même projet Supabase. Les rôles et les politiques RLS restent la frontière d’autorisation. Le scanner valide les billets dans une session de scan avec `validate_ticket_token_for_session` et `validate_ticket_public_code_for_session`, afin qu’un billet ne puisse être consommé que pour la soirée et le poste sélectionnés.

## Mode hors connexion

NOCTURNE Scan prépare automatiquement le manifeste des billets à partir de T−3 h, au démarrage, au retour au premier plan, à la reconnexion et périodiquement. Les validations hors ligne sont conservées localement avec leur session puis synchronisées au retour du réseau. Les synchronisations concurrentes sont regroupées sur chaque terminal ; côté serveur, le verrouillage des billets et l’unicité de `check_ins.ticket_id` arbitrent les doubles scans entre terminaux.

Deux appareils complètement hors ligne peuvent accepter temporairement le même billet. À la resynchronisation, la première validation serveur est acceptée et la suivante remonte comme conflit ; aucune garantie distribuée plus forte n’est possible sans communication entre les terminaux.

### Validation différée

Le scénario réel avec deux téléphones reste à exécuter lorsqu’un second appareil sera disponible : préparer le même événement, couper le réseau sur les deux appareils, scanner le même billet, reconnecter successivement les appareils et vérifier qu’un scan est synchronisé tandis que l’autre remonte comme conflit. Ce test matériel n’est pas bloquant pour la suite du développement.

Les outils de bar, de caisse et de gestion opérationnelle de festival resteront hors de NOCTURNE Scan jusqu’à la création éventuelle d’un produit professionnel distinct.

## Revente et transfert de billets

Les organisateurs encaissent les ventes avec leur compte Stripe Connect. Un participant peut remettre un billet valide en vente exclusivement au prix facial de sa catégorie. Une phase « Entrée avant minuit » ferme ses ventes et sa revente à 23 h ; les phases ordinaires ferment à 3 h du matin. NOCTURNE priorise les billets remis en vente lors du prochain achat de la même catégorie.

Quand une catégorie est complète, l’utilisateur choisit sur cette soirée et cette catégorie une quantité exacte ainsi qu’un mode : notification seule ou notification avec achat automatique. Le lot n’est réservé que lorsque toute la quantité demandée est disponible simultanément. En mode notification, l’utilisateur dispose d’une réservation temporaire pour payer le lot entier. En mode automatique, la carte préalablement autorisée est débitée hors session pour le lot entier ; si Stripe exige une authentification supplémentaire, le lot reste temporairement réservé et l’utilisateur est averti pour terminer le paiement.

À la fermeture d’une phase, son stock invendu peut être reporté atomiquement vers une phase ultérieure configurée par l’organisateur. La capacité de la phase source est ramenée à son volume vendu et le reliquat exact est ajouté à la phase cible, sans changer la capacité globale de l’événement. Chaque report est journalisé et revérifié au moment d’un achat.

Après le nouveau paiement, le billet change atomiquement de propriétaire et reçoit un nouveau QR code ainsi qu’un nouveau numéro public. L’ancien QR devient inutilisable. Par défaut, le vendeur est remboursé sur la carte du paiement d’origine à hauteur de 90 % du prix et NOCTURNE conserve 10 % de commission. Un vendeur peut aussi générer un lien privé à usage unique pour transférer le billet à une personne connue selon le même mécanisme de paiement et de remboursement.

Les commissions sont configurées par organisation dans l’administration NOCTURNE, avec 3,5 % par défaut et un minimum de 0,49 € par billet sur les ventes initiales, puis 10 % plafonnés à 15 € par billet sur les reventes. Les organisations ne peuvent pas modifier elles-mêmes ces taux.
