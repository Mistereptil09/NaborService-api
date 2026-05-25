# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Added
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

### Changed
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
