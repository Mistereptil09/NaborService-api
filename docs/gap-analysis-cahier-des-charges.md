# 🔍 Gap Analysis — API NaborService vs Cahier des charges

> **Date :** 2026-06-16  
> **Référence :** `cahier_des_charges_nabor.md` v1.1 (mis à jour pour refléter le codebase)  
> **Périmètre :** `services/api/src/` (NestJS)  
> **Dernière mise à jour :** 2026-06-17 — Gateways Socket.io + corrections PollsService  

---

## 📊 Vue d'ensemble

| Sévérité | Compteur | Détail |
|----------|----------|--------|
| 🔴 Module REST absent | **2** | Payments, Calls |
| 🟠 Gateway Socket.io absent | **1** | Calls signaling (inclus dans Calls) |
| 🟡 Route/auth incorrect | **0** | ✅ Résolu |
| 🔵 Déviation mineure | **0** | ✅ Résolu |
| ✅ Résolu | **11** | DSL, Categories, Quartiers, Documents, Polls/Presence/Notif GW, TOTP, Updates, Messages, Opt-out |

---

## 🔴 Modules entièrement absents

### 1. Paiements Stripe Connect — `/payments`

> **Aucun `PaymentsController`, `PaymentsModule`, `PaymentsService`.**

| # | Route | Méthode | Auth | Cahier § |
|---|-------|---------|------|----------|
| 1 | `/payments/listings/:listing_id/checkout` | POST | 🔒 | 4.4 |
| 2 | `/payments/events/:event_id/checkout` | POST | 🔒 | 4.4 |
| 3 | `/payments/stripe/webhook` | POST | 🔓 | 4.4 |
| 4 | `/payments/transactions/:transaction_id` | GET | 🔒 | 4.4 |
| 5 | `/payments/me/history` | GET | 🔒 | 4.4 |
| 6 | `/payments/connect/onboard` | POST | 🔒 | 4.4 |
| 7 | `/payments/connect/status` | GET | 🔒 | 4.4 |
| 8 | `/payments/connect` | DELETE | 🔒 | 4.4 |

**Impact UC :** UC-01 (échange de service payant) — pas de session Stripe Checkout, pas d'onboarding Connect.  
**Existant partiel :** Entités `ListingTransaction` + queue `bull:stripe-webhook` sont présentes.

---

### 2. Appels WebRTC — `/calls`

> **Aucun `CallsController`, `CallsService`, `CallsGateway`.**

| # | Route | Méthode | Auth | Cahier § |
|---|-------|---------|------|----------|
| 1 | `/calls/initiate` | POST | 🔒 | 4.7 |
| 2 | `/calls/:call_id/end` | POST | 🔒 | 4.7 |
| 3 | `/calls/:call_id/reject` | POST | 🔒 | 4.7 |
| 4 | `/calls/:call_id` | GET | 🔒 | 4.7 |
| 5 | `/calls/turn-credentials` | GET | 🔒 | 4.7 |

**Événements Socket.io manquants :** `call:incoming`, `call:ended`, `call:rejected`, `call:offer`, `call:answer`, `call:ice_candidate`  
**Impact :** Module fonctionnel 6.8 entier — pas d'appels audio/vidéo.

---

### 3. ~~DSL — `/dsl`~~ → ✅ Résolu le 2026-06-16

**Module créé :** `modules/dsl/` (DslModule, DslController, DslService, DslQuery entity)

| Route | Méthode | Auth | Statut |
|-------|---------|------|--------|
| `/dsl/query` | POST | 👑🛡️ | ✅ Proxy vers Python PLY |
| `/dsl/audit` | GET | 👑 | ✅ Historique paginé |

**Service Python corrigé :**
- Parser : 7 formes de requêtes (cahier BNF complet, +4 formes)
- Projection : `pdf.data` corrigé (était `pdf`)
- Collections whitelist : conforme cahier
- Messages d'erreur : français, conformes cahier
- LIMIT plafond : 500 (conforme)

---

### 4. ~~Catégories — `/categories`~~ → ✅ Résolu le 2026-06-16

**Module créé :** `modules/categories/` (CategoriesModule, CategoriesController, CategoriesService)

| Route | Méthode | Auth | Statut |
|-------|---------|------|--------|
| `/categories/listings` | GET | 🔓 | ✅ Arbre hiérarchique |
| `/categories/events` | GET | 🔓 | ✅ Arbre hiérarchique |
| `/categories/listings` | POST | 👑 | ✅ Avec validation parent |
| `/categories/events` | POST | 👑 | ✅ Avec validation parent |
| `/categories/listings/:id` | PATCH | 👑 | ✅ Anti self-reference |
| `/categories/listings/:id` | DELETE | 👑 | ✅ Cascade enfants |
| `/categories/events/:id` | PATCH | 👑 | ✅ |
| `/categories/events/:id` | DELETE | 👑 | ✅ Cascade enfants |

**Tests :** 14/14 ✅

---

### 5. ~~Quartiers publics — `/neighbourhoods`~~ → ✅ Résolu le 2026-06-16

**Fichier créé :** `modules/geo/neighbourhood.controller.ts`

| Route | Méthode | Auth | Statut |
|-------|---------|------|--------|
| `/neighbourhoods` | GET | 🔓 | ✅ Liste (id, name, city, zip) |
| `/neighbourhoods/nearby` | GET | 🔓 | ✅ Proximité GPS (défaut 2000m) |
| `/neighbourhoods/:id` | GET | 🔒 | ✅ Détail Neo4j |
| `/neighbourhoods/:id/members` | GET | 🔒 | ✅ Résidents |
| `/neighbourhoods/:id/adjacent` | GET | 🔒 | ✅ Quartiers adjacents |

**Ajouté à `NeighbourhoodService` :** `findAll()`, `findMembers()`  
**Tests :** 12/12 ✅

---

### 6. Documents archivés — `/documents`

> **Pas de contrôleur générique. Les contrats/reçus sont servis via `/listings/:id/contract` et `/listings/:id/receipt`.**

| # | Route | Méthode | Auth | Cahier § |
|---|-------|---------|------|----------|
| 1 | `/documents/:document_id` | GET | 🔒 | 4.8 |
| 2 | `/admin/documents/:document_id` | GET | 👑 | 4.8 |

---

## 🟠 Socket.io — Gateways absents

### 7. ~~Polls Gateway~~ → ✅ Résolu le 2026-06-17

**Fichier :** `modules/polls/polls.gateway.ts` (namespace `polls`)

| Événement | Direction | Statut |
|-----------|-----------|--------|
| `poll:updated` | ⚡ Serveur → Clients | ✅ Émis après vote/updateVote/deleteVote |
| `poll:closed` | ⚡ Serveur → Clients | ✅ Émis après closePoll |
| `poll:option_added` | ⚡ Serveur → Clients | ✅ Émis après addOption |

Intégré dans `PollsController` — émission après chaque mutation.

### 8. ~~Presence Gateway~~ → ✅ Résolu le 2026-06-17

**Fichier :** `modules/messaging/presence.gateway.ts` (namespace `/`)

| Événement | Direction | Statut |
|-----------|-----------|--------|
| `presence:online` | ⚡ Serveur → Tous | ✅ Émis à la connexion |
| `presence:offline` | ⚡ Serveur → Tous | ✅ Émis à la déconnexion |
| `presence:query` | 📤 Client → Serveur | ✅ Retourne online/offline par userId |

Redis `presence:<user_id>` mis à jour avec TTL 24h.

### 9. ~~Notifications Gateway~~ → ✅ Résolu le 2026-06-17

**Fichiers :** `messaging/notifications.gateway.ts` (namespace `notifications`), `notifications.service.ts`, `entities/notification.entity.ts`

| Événement | Direction | Statut |
|-----------|-----------|--------|
| `notification:new` | ⚡ Serveur → Client | ✅ Via `NotificationsService.create()` |
| `notification:read` | 📤 Client → Serveur | ✅ Marque comme lue |
| `notification:read_ack` | ⚡ Serveur → Client | ✅ Confirmé après lecture |

12 types de notifications : `new_message`, `new_event`, `new_listing_interest`, `listing_accepted`, `contract_pending`, `contract_signed`, `payment_confirmed`, `waitlist_place`, `new_follower`, `new_poll`, `incident_resolved`, `event_cancelled`.

### 10. ~~Calls Signaling~~ → Lié au module Calls (non implémenté)

| Événement | Direction | Cahier § |
|-----------|-----------|----------|
| `call:incoming` | ⚡ Serveur → Membres | 5.7 |
| `call:offer` | 📤 Client → Serveur | 5.7 |
| `call:answer` | 📤 Client → Serveur | 5.7 |
| `call:ice_candidate` | 📤 / ⚡ Bidirectionnel | 5.7 |
| `call:end` | 📤 Client → Serveur | 5.7 |
| `call:ended` | ⚡ Serveur → Clients | 5.7 |
| `call:reject` | 📤 Client → Serveur | 5.7 |
| `call:rejected` | ⚡ Serveur → Clients | 5.7 |

---

## 🟡 Routes mal positionnées ou avec un mauvais niveau d'auth

> ✅ **Résolu le 2026-06-16**

### ~~11. TOTP — mauvais préfixe de route~~ → Aligné

Les routes TOTP du codebase (`POST /auth/totp/setup`, `POST /auth/totp/confirm`, `POST /auth/totp/disable`) sont conservées telles quelles. Le cahier a été mis à jour pour refléter ces chemins réels. La désactivation admin est couverte par `DELETE /admin/users/:user_id/totp` (admin). **Aucun changement codebase nécessaire.**

### ~~12. Updates — auth level incorrect~~ → ✅ Résolu

| Route | Avant | Après |
|-------|-------|-------|
| `GET /updates/latest` | 👑🛡️ (moderator, admin) | 🔓 Public |
| `GET /updates/download` | 👑🛡️ (moderator, admin) | 🔓 Public |

**Fichier :** `updates.controller.ts` — retrait de `JwtAuthGuard`, `RolesGuard`, `@Roles`, `@ApiBearerAuth`.

### ~~13. `POST /incidents/sync` — route obsolète~~ → ✅ Résolu

| Route | Action |
|-------|--------|
| `POST /incidents/sync` | **Supprimée** — consolidée dans `POST /sync/updates` |

**Fichier :** `incidents.controller.ts` — retrait de la route, du `IncidentSyncService` injecté et des imports inutilisés.

---

## 🔵 Déviation mineures

### 14. Messages via REST (non prévu au cahier) → ✅ Résolu

| Route | Statut |
|-------|--------|
| `POST /chat/groups/:group_id/messages` | ❌ Supprimé — envoi = Socket.io `message:send` |
| `PATCH /chat/messages/:message_id` | ❌ Supprimé — édition = Socket.io `message:edit` |

> Envoi et édition de messages sont maintenant exclusivement via Socket.io, conformément au cahier (§5.1).

### 15. `DELETE /users/me/data-processing/opt-out` → ✅ Résolu

> Route ajoutée au cahier (§4.2) pour refléter le codebase.

---

## ✅ Modules conformes

| Module | Routes présentes | Conformité |
|--------|-----------------|------------|
| **Auth** (hors TOTP) | 16/16 | ✅ 100% |
| **Users** (hors TOTP) | 31/31 | ✅ 100% |
| **Listings** | 22/22 | ✅ 100% |
| **Events** | 24/24 | ✅ 100% |
| **Messaging** | 15/15 | ✅ 100% |
| **Polls** (routes REST) | 12/12 | ✅ 100% |
| **Incidents** | 7/7 | ✅ 100% |
| **Categories** | 8/8 | ✅ 100% |
| **Neighbourhoods** | 5/5 | ✅ 100% |
| **Geo** | 2/2 | ✅ 100% |
| **Health** | 2/2 | ✅ 100% |
| **i18n** | 1/1 | ✅ 100% |
| **Sync** | 3/3 | ✅ 100% |
| **Admin** | 17/17 | ✅ 100% |
| **Media** | 10/10 | ✅ (avec extras) |

---

## 📈 Résumé chiffré

| Catégorie | Restant | Résolu |
|-----------|---------|--------|
| Routes REST manquantes | **15** | ~~23~~ (DSL 2, Categories 8, Quartiers 5, corrections 8) |
| Événements Socket.io manquants | **8** (Calls signaling) | ~~9~~ (Polls 3, Presence 3, Notifications 3) ✅ |
| Routes/auth incorrectes | **0** | ~~6~~ ✅ |
| Routes obsolètes | **0** | ~~1~~ ✅ |
| Déviation cahier↔codebase | **0** | ~~3~~ ✅ |

---

## 🗺️ Ce qu'il reste à faire

### 🔴 Modules REST (15 routes restantes)

| # | Module | Routes | Effort | Débloque |
|---|--------|--------|--------|----------|
| 1 | **Paiements** | 8 | ~8h | UC-01 (échange payant), Stripe Connect |
| 2 | **Documents archivés** | 2 | ~1h | Accès générique contrats/reçus |
| 3 | **Appels WebRTC** | 5 | ~10h | Appels audio/vidéo, coturn |

### 🟠 Gateways Socket.io

| # | Gateway | Événements | Effort |
|---|---------|-----------|--------|
| 4 | **Calls signaling** | 8 | Inclus dans #3 |

### ✅ Déjà résolu

- ~~TOTP routes / cahier~~ → Cahier sync avec le codebase
- ~~Updates auth~~ → Routes rendues publiques + tests
- ~~`/incidents/sync`~~ → Route supprimée
- ~~Messages REST~~ → Supprimés, Socket.io uniquement
- ~~`DELETE /users/me/data-processing/opt-out`~~ → Ajouté au cahier
- ~~DSL~~ → Module NestJS + parser Python corrigé + 16 tests
- ~~Catégories~~ → 8 routes + arbre + 14 tests + e2e
- ~~Quartiers publics~~ → 5 routes + Neo4j + 12 tests + e2e
- ~~Polls Gateway~~ → 3 événements + intégré au contrôleur
- ~~Presence Gateway~~ → 3 événements + Redis TTL 24h
- ~~Notifications Gateway~~ → 3 événements + 12 types + Notification entity

---

*Document généré automatiquement — à mettre à jour après chaque implémentation.*
