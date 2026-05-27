# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Fixed
- **Sécurité et Authentification** :
  - Sécurisation du serveur WebSocket `ListingsGateway` en remplaçant l'authentification par simple paramètre d'URL `userId` par une validation JWT obligatoire depuis `socket.handshake.auth.token`.
  - Ajout de validations strictes (`@IsEmail`, `@IsString`, `@IsNotEmpty`, `@MaxLength`) sur `LoginDto` pour interdire les payloads invalides à la connexion.
  - Remplacement des vérifications manuelles de rôles dans `ListingsController` par un garde et décorateur unifié `@Roles('moderator', 'admin')` avec un `RolesGuard`.
  - Augmentation de la durée d'expiration du token SSO Desktop de 30 jours à 90 jours conformément aux spécifications CDC pour les sessions Java Desktop.
- **Robustesse et Intégrité Fonctionnelle** :
  - Résolution d'un leak dans `ListingsGateway` en restreignant l'événement de changement de statut d'annonce aux seules salles concernées (`listing:${listingId}`) au lieu d'une diffusion globale.
  - Résolution de la création de transactions dupliquées en vérifiant l'existence d'une transaction active pour l'annonce via `expressInterest` (lève un `ConflictException`).
  - Propagation correcte des erreurs de base de données dans `UsersService.exportJson` au lieu d'un retour silencieux de tableau vide, assurant une information précise en cas d'échec.
  - Modification de la route `DELETE /users/me/data-processing/opt-out` pour recevoir le paramètre `processingType` via query parameters au lieu de request body.
- **Modifications d'Infrastructure et Configuration** :
  - Activation globale de `ValidationPipe` (avec `whitelist`, `forbidNonWhitelisted`, `transform`) dans `src/main.ts` pour appliquer systématiquement les validations de DTO.
  - Configuration du préfixe d'API global `/v1/` dans `src/main.ts` pour toutes les routes.
  - Intégration du middleware `cookie-parser` dans `src/main.ts` et bascule des contrôleurs d'authentification/utilisateurs vers `req.cookies` au lieu d'un parsing manuel fragile.
  - Création de la route d'administration `DELETE /admin/users/:user_id/totp` permettant de réinitialiser le TOTP d'un utilisateur en tant qu'administrateur.
- **Consolidation Structurelle et Nettoyage** :
  - Consolidation des entités dupliquées conflictuelles `UserSession` et `UserNotificationPreferences` dans `src/common/entities/`, suppression des doublons obsolètes dans `auth/entities` et `users/entities`, et mise à jour de tous les imports associés.
  - Correction de l'ordre d'importation de `ListingsController` dans `ListingsModule` pour prévenir les dépendances circulaires à l'initialisation.
  - Ajout du décorateur `@ApiTags('Listings')` sur `ListingsController` pour corriger le regroupement Swagger/OpenAPI.
- **Documentation et Améliorations** :
  - Ajout de commentaires explicatifs (TODO/deviations) documentant les choix techniques et évolutions (intégration BullMQ e-mail, SSO Desktop Device Authorization QR-code, déviation du routage TOTP).
  - Création de tests de propriétés `fast-check` robustes dans `api-module-fixes.property.spec.ts` pour valider la robustesse de ces corrections, avec 541 tests passants à 100%.

### Added
- **Spec listings-routes-cdc** : création complète de la spécification (requirements.md, design.md, tasks.md) pour le module Annonces & Services (25 requirements, 13 propriétés de correction, 18 tâches d'implémentation).
- Implémentation complète et migration vers le système de stockage média découpé GridFS sous `src/modules/media/` :
  - **`GridFSService`** : Intégration bas niveau avec le pilote natif MongoDB pour fragmenter les flux binaires en chunks de 255 Ko, avec suppression atomique (chunks + fichiers) et verrous transactionnels assurant un nettoyage complet en cas d'échec d'écriture.
  - **`UploadPipeline`** : Pipeline d'optimisation unifié validant les mimetypes et tailles limites, convertissant automatiquement les images (JPEG/PNG/GIF) au format WebP (qualité 80) via `sharp`, compressant les vidéos à un maximum de 1080p via `fluent-ffmpeg`, et transcodant les fichiers audios au format Opus (128 kbps).
  - **`MediaService`** : Service d'orchestration stockant les métadonnées dans la collection Mongoose `media_files` et mettant à jour atomiquement les clés PostgreSQL associées. Gère les singletons d'avatars/bannières de profil, prévient les contrats en doublon par empreinte SHA-256, applique les limites quantitatives (8 photos max par annonce, 3 par message) et recalcule dynamiquement l'ordre contigu (indices `0` à `N-1`) lors des suppressions.
  - **`MediaController`** : Endpoints de téléversement sécurisés pour toutes les entités propriétaires (utilisateurs, annonces, événements, messages, incidents, contrats) et point d'accès de streaming supportant pleinement les requêtes de plages de bytes HTTP (**`206 Partial Content`** et **`416 Range Not Satisfiable`**) avec mise en cache optimisée (`Cache-Control: max-age=31536000, immutable`).
  - **Nettoyage des entités et schémas existants** : Simplification des schémas de base MongoDB (`user_media`, `listing_documents`) en retirant les buffers binaires internes obsolètes au profit de la délégation des validations au pipeline NestJS.
  - **Robustesse des tests et passage à 100%** : Ajout de **17 tests de propriétés fast-check rigoureux** couvrant l'ensemble du module média (contenant le streaming de plages, les invariants de contiguïté, la détection de doublons, les singletons d'avatars, et les rollbacks d'écriture), et mise à jour corrective complète de l'ensemble de la suite de tests (soit un total de **532 tests Jest et fast-check passants à 100%**).
- Configuration et enrichissement complet de la documentation Swagger/OpenAPI pour les modules `auth`, `users` et `listings` :
  - **Nettoyage et rationalisation des DTO** : Intégration du plugin CLI `@nestjs/swagger` et migration de tous les DTOs vers l'usage exclusif de `@ApiProperty()` et `@ApiPropertyOptional()` avec descriptions et exemples explicites.
  - **Enrichissement des contrôleurs** : Ajout exhaustif des décorateurs Swagger d'opérations (`@ApiOperation()`) et de réponses HTTP (`@ApiOkResponse()`, `@ApiCreatedResponse()`, `@ApiBadRequestResponse()`, `@ApiUnauthorizedResponse()`, `@ApiForbiddenResponse()`, `@ApiNotFoundResponse()`) documentant l'ensemble des cas d'utilisation et codes d'erreur de chaque route.
  - **Résolution d'erreurs d'initialisation** : Correction d'une erreur `ReferenceError` d'initialisation à l'exécution dans `listings.module.ts` en déplaçant l'importation de `ListingsController` en haut du fichier.
  - **Facilitation du développement local** : Création des fichiers `.env` locaux et racine pour connecter l'API hôte aux ports exposés par les bases de données dans Docker.
- Implémentation et intégration complète du module d'Annonces et Services (Listings) sous `src/modules/listings/` :
  - **`ListingsService` & `ListingContentService`** : CRUD complet de listings PostgreSQL et de contenu MongoDB associé (description HTML enrichie et tags).
  - **`ListingMediaService`** : gestion robuste de téléchargement/suppression d'images WebP (Sharp) avec limite stricte à 8 photos (5 Mo max) et réorganisation contiguë automatique des ordres d'images (0..N-1) lors des suppressions.
  - **`ListingStateMachineService`** : gestion résiliente des transitions d'états d'annonces (`open` -> `pending` -> `in_progress` -> `closed` | `cancelled`) via optimistic locking.
  - **`ListingSignatureService` & Gateway / Workers** : signature électronique simple eIDAS (Canvas base64 + TOTP validation), immutabilité stricte des documents signés, validation d'intégrité SHA-256 bidirectionnelle, génération PDF asynchrone (BullMQ `pdf-generation`), expiration automatique (24h de TTL) via `contract-expiration` delayed job, et notifications WebSocket en temps réel via `ListingsGateway`.
  - **`ListingReportService` & `ListingModerationService`** : flux de modération complet (resolution de signalements, avertissements aux créateurs, suspension gracieuse de transaction) et routage admin/modérateur sécurisé.
  - **Résolution des erreurs de compilation TypeScript** : typage précis pour les queries TypeORM avec `IsNull()`, fallback de date pour le socket gateway, import correct du décorateur `@Inject()`, et assertions de non-nullité pour les documents Mongo.
  - **Tests robustes de correction `fast-check`** : refactorisation complète de la suite de tests de propriétés (`listings.properties.spec.ts`) pour utiliser les promesses asynchrones `fc.asyncProperty` d'une manière type-safe. Les **13 propriétés de correction** mathématiques et les unit/integration tests (soit **135 tests** au total) passent désormais à 100% avec le build NestJS compilé sans aucune erreur.
- Implémentation complète des routes utilisateurs (32 endpoints REST) conformes aux spécifications du CDC sous `src/modules/users/` :
  - **`UsersController`** : 32 endpoints REST complets couvrant le CRUD de profil, les soft-deletes avec TOTP, la révocation de sessions, la gestion des bannières/avatars (Sharp WebP), la réinitialisation de mot de passe (Redis TTL + rate limiting), la gestion des préférences de notifications et langues, les droits RGPD (rectification, limitation de traitement, oppositions), et le graphe social complet (follows, friendships, blocks, signalements, swipes, discovery scores Neo4j).
  - **Correction d'infrastructures** : adaptation de l'import `sharp` en import par défaut standard ES dans `UserMediaService` pour la robustesse du mocking Jest, et correction d'une référence de fonction non-existante dans `deleteMedia`.
  - **Tests robustes Jest et Fast-Check** : suite de tests unitaires d'edge cases complète sous Jest pour les 6 sous-services, et tests de propriétés `fast-check` couvrant **les 20 propriétés de correction** (100 runs chacun) définies dans la spécification technique.
- Implémentation du système de préférences RGPD (`user_data_processing`) sous `src/modules/users/` :
  - **`UserDataProcessing` (entité)** : table dédiée avec relation `OneToOne` vers `User` et `onDelete: 'CASCADE'`, stockant les types d'opposition (`opt_outs` TEXT[]) et la limitation globale (`is_restricted` BOOLEAN).
  - **`DataProcessingService`** : service injectable exposant des méthodes unifiées de vérification de statut d'opposition (`isOptedOut`, `getEffectiveOptOuts`) et de modification de configuration (`setOptOuts`, `setRestricted`, `createDefault`).
  - **Création atomique à l'inscription** : intégration dans `AuthService.register()` d'une insertion transactionnelle par défaut pour garantir la conformité dès la création du compte.
  - **Spécifications techniques** : mise à jour de la section 3.1 du `cahier_des_charges_nabor.md` documentant le schéma SQL et les règles de conformité RGPD.
  - **Tests robustes Jest et Fast-Check** : suite de tests unitaires d'edge cases et tests de propriétés fast-check (100 runs chacun) prouvant mathématiquement le respect des opt-outs par les services consommateurs (projections d'interactions Neo4j, emails non essentiels, flux de découverte).
- Implémentation de la couche d'infrastructure et des services graphiques Neo4j sous `src/database/neo4j/` conformes aux spécifications CDC :
  - **`Neo4jService`** : service générique d'exécution de requêtes Cypher résilient avec gestion automatique de fermeture des sessions et mécanisme de retry exponentiel (délais `[1000, 5000, 30000]` ms) en cas d'erreurs transitoires.
  - **`Neo4jInitService`** : initialisation automatique de 10 index de base de données (8 RANGE, 2 RANGE composites, 1 index POINT spatial sur le centroid) avec gestion gracieuse des index existants (skip) et fail-fast au démarrage.
  - **`Neo4jSyncService`** : service d'alimentation et synchronisation idempotente PostgreSQL → Neo4j (MERGE sur nœuds `User`, `Listing`, `Event`, `Category`, et 14 projections relationnelles comme `[:LIVES_IN]`, `[:FOLLOWS]`, `[:FRIENDS_WITH]`, etc.).
  - **`NeighbourhoodService`** : service de gestion géographique des quartiers comme source de vérité exclusive (mapping de points WGS-84 natifs, requêtes spatiales de proximité par distance, suppression sécurisée avec barrière de résidents actifs, et modification atomique d'adjacences en transaction).
- Implémentation des 7 schémas MongoDB Mongoose (`user_media`, `listing_documents`, `contracts`, `messages`, `event_documents`, `event_tickets`, `incident_documents`) sous `src/database/mongo-schemas/` conformes aux spécifications CDC.
- Validations de tailles Mongoose par fichier individuel (photos ≤ 1,5 Mo, pièces jointes ≤ 4,5 Mo, avatars ≤ 2 Mo, bannières ≤ 4 Mo).
- Pre-save hooks Mongoose validant la taille BSON cumulée (ex. photos ≤ 12 Mo, pièces jointes ≤ 13,5 Mo, événements ≤ 13,5 Mo) avec propagation d'erreurs ValidationError détaillées.
- Module global `MongoSchemasModule` enregistrant et exportant tous les modèles pour injection.
- Tests unitaires Jest complets et tests de propriétés `fast-check` robustes pour la conformité et la sécurité des schémas.
- Module d'authentification NestJS :
  - **`TokenService`** : émission de JWT HS256 (15 min) et tokens de rafraîchissement opaques de 64 caractères (base64url) stockés dans Redis.
  - **`SessionService`** : gestion et audit des sessions actives (`UserSession`) dans PostgreSQL avec support de révocation unitaire/globale.
  - **`RateLimitService` & `RateLimitGuard`** : rate limiting glissant Redis (`INCR` + `EXPIRE`) par IP (login : 10/15min) et par utilisateur (refresh : 10/1min).
  - **`TotpService`** : chiffrement AES-256-GCM des secrets TOTP à l'aide d'une clé maîtresse, flux de challenge en deux étapes avec challenge_token opaque, flux de setup/confirmation et blocage temporaire de brute-force (15 min).
- Tests unitaires et tests de propriétés robustes (`fast-check`) validant 15 propriétés de correction critiques (format de tokens, non-divulgation d'identifiants, cycle de vie de session, Argon2id, invalidation sur changement de mot de passe/suppression, rate limiting).
- Fichier `.dockerignore` dans `services/api` pour optimiser le build Docker en ignorant `node_modules` et `dist`.

### Changed
- **Infrastructure de connexion aux bases de données** :
  - Création de `src/database/database.utils.ts` avec utilitaires partagés : `requireEnv()` (validation d'env vars avec message clair par service), `connectWithRetry()` (retry générique avec logging uniforme), et `DB_RETRY_CONFIG` (5 tentatives, 3s de délai).
  - Refactorisation de `postgres.config.ts` : utilisation de `connectWithRetry` via `dataSourceFactory` pour un retry contrôlé à l'initialisation TypeORM.
  - Extraction de `mongo.config.ts` depuis `app.module.ts` : configuration Mongoose isolée avec `connectWithRetry` pour vérifier la connectivité avant de retourner l'URI.
  - Refactorisation de `redis.module.ts` : désactivation du retry interne ioredis (`retryStrategy: () => null`, `lazyConnect: true`), suppression du spam `[ioredis] Unhandled error event`, retry géré exclusivement par `connectWithRetry`.
  - Refactorisation de `neo4j.module.ts` : `verifyConnectivity()` encapsulé dans `connectWithRetry` (bloquant au démarrage).
  - Comportement uniforme : si un service est injoignable après 5 tentatives, le processus crash proprement (exit code 1) pour permettre un restart Docker.
- **Docker Compose** : ajout de `env_file: .env` sur le service API pour injecter les variables d'environnement depuis le fichier `.env` racine (pattern standard en production).
- **`.env.example`** : ajout de toutes les variables manquantes (`DATABASE_URL`, `MONGODB_URI`, `NEO4J_URI`, `NEO4J_USER`, `REDIS_HOST`, `DSL_SERVICE_URL`) avec valeurs par défaut fonctionnelles pour Docker.
- **`app.module.ts`** : nettoyage — suppression de la config Mongoose inline, import de `mongoConfig` depuis `database/mongo.config.ts`.
- Optimisation des paramètres du test de propriétés `Argon2id` (`numRuns: 30`, `memoryCost: 16384`, `timeCost: 2`) accélérant le passage complet de la suite de tests de **24s à 5,6s** (gain de 4,2x).
- Inscription (`register`) : sécurisation par Argon2id avec sel cryptographique aléatoire de 16 octets, et création atomique transactionnelle des préférences de notification (`UserNotificationPreferences`) par défaut.
- Connexion (`login`) : protection contre les attaques temporelles par vérification uniforme (dummy verification) en cas de compte inexistant ou supprimé.
- Stratégie JWT : invalidation des tokens actifs si le mot de passe est modifié après émission ou si le compte est supprimé (`deleted_at IS NOT NULL`).
- Configuration Jest : ajout de `transformIgnorePatterns` dans `package.json` pour compiler les dépendances ESM (`@scure`, `@noble`, `otplib`).
- 24 entités TypeORM PostgreSQL conformes au CDC section 3.1 (users, social, messaging, listings, events, polls, incidents)
- 16 types ENUM PostgreSQL centralisés dans `src/common/enums.ts`
- 7 modules NestJS domaine (SocialModule, MessagingModule, ListingsModule, EventsModule, PollsModule, IncidentsModule)
- Configuration TypeORM extraite dans `src/database/postgres.config.ts` avec `autoLoadEntities: true`
- Tests unitaires de métadonnées TypeORM vérifiant la conformité schéma (colonnes, types, index, CHECK, relations)
- Cahier des charges technique (`cahier_des_charges_nabor.md`) ajouté au repo
- Spec Kiro complète pour les entités PostgreSQL (`.kiro/specs/postgresql-entities/`)
- Structure monorepo : `services/api/` (NestJS) et `services/dsl/` (FastAPI + PLY)
- Docker multi-service : `compose.yml`, `compose.dev.yml`, `compose.prod.yml`
- Dockerfiles dédiés : `docker/api/`, `docker/dsl/`, `docker/postgres/`
- Extension `pg_uuidv7` pour PostgreSQL 17 (UUID v7 ordonnés chronologiquement)
- Micro-service DSL Python (lexer, parser, query_builder) pour requêtes MongoDB admin en lecture seule
- `.dockerignore` pour optimiser les builds Docker
- Restructuration `src/` : modules métier dans `src/modules/`, configs DB dans `src/database/`, enums dans `src/common/`
- Entité User mise à jour : suppression colonnes obsolètes, ajout index CDC, import enums centralisés
- `auth.service.ts` : migration bcrypt → argon2 (conformité CDC), correction null check TOTP
- Dockerfile API : fallback `npm install` quand `package-lock.json` absent
- PostgreSQL 16 → 17 (support pg_uuidv7)
- `docker-compose.yml` renommé en `compose.yml` (convention Docker Compose v2)

### Removed
- `docker-compose.yml` (remplacé par `compose.yml`)
- `test-chat.html` (fichier de test temporaire)
- Module `chat/` (remplacé par `MessagingModule` avec entités CDC)
- Anciens répertoires `src/auth/`, `src/users/`, `src/neo4j/`, `src/redis/` (déplacés vers nouvelle structure)

---

## [0.0.1] - 2026-03-19

### Added
- Projet NestJS initial avec auth (JWT + TOTP), users, quartiers, chat WebSocket
- Connexions PostgreSQL (TypeORM), MongoDB (Mongoose), Neo4j (Bolt), Redis (ioredis)
- Swagger/OpenAPI auto-généré
- Docker Compose basique (PostgreSQL 16, MongoDB 7, Neo4j 5, Redis 7)

# not forget :
MongoDB schemas — Les 7 collections Mongoose (user_media, listing_documents, contracts, messages, event_documents, event_tickets, incident_documents) # done
Neo4j initialization — Index, contraintes, et service de base pour les requêtes Cypher # currently doing
Users module — Profil complet (GET/PATCH /users/me, avatar/banner upload, RGPD export, discover)
Social module — Follow, friendships, blocks, swipes
Qu'est-ce que tu veux attaquer ensuite ?