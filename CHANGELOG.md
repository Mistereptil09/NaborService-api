# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Added
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
