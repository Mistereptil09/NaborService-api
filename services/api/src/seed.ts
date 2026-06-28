import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getModelToken } from '@nestjs/mongoose';
import { DataSource, Repository } from 'typeorm';
import { Model } from 'mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

// Services
import { AuthService } from './modules/auth/auth.service';
import { UsersService } from './modules/users/users.service';
import { UserSocialService } from './modules/users/user-social.service';
import { ListingsService } from './modules/listings/listings.service';
import { ListingContentService } from './modules/listings/listing-content.service';
import { ListingTransactionService } from './modules/listings/listing-transaction.service';
import { EventsService } from './modules/events/events.service';
import { EventContentService } from './modules/events/event-content.service';
import { EventStateMachineService } from './modules/events/event-state-machine.service';
import { Neo4jGeoService } from './modules/geo/neo4j-geo.service';
import { Neo4jService } from './database/neo4j/neo4j.service';
import { Neo4jSyncService } from './database/neo4j/neo4j-sync.service';

// Enums
import {
  UserRoleEnum,
  VisibilityEnum,
  MessagePolicyEnum,
  ListingStatusEnum,
  ListingTypeEnum,
  TransactionStatusEnum,
  EventStatusEnum,
  ParticipantStatusEnum,
  PaymentStatusEnum,
  IncidentSeverityEnum,
  IncidentStatusEnum,
  PollTypeEnum,
  ChatGroupTypeEnum,
  GroupRoleEnum,
} from './common/enums';

// Postgres Entities
import { User } from './modules/users/entities/user.entity';
import { Listing } from './modules/listings/entities/listing.entity';
import { Evenement } from './modules/events/entities/evenement.entity';
import { Incident } from './modules/incidents/entities/incident.entity';
import { ListingCategory } from './modules/listings/entities/listing-category.entity';
import { EvenementsCategory } from './modules/events/entities/evenements-category.entity';
import { ListingTransaction } from './modules/listings/entities/listing-transaction.entity';
import { ChatGroup } from './modules/messaging/entities/chat-group.entity';
import { UsersInGroup } from './modules/messaging/entities/users-in-group.entity';
import { MessageMetadata } from './modules/messaging/entities/message-metadata.entity';
import { MessageReadReceipt } from './modules/messaging/entities/message-read-receipt.entity';
import { Poll } from './modules/polls/entities/poll.entity';
import { PollOption } from './modules/polls/entities/poll-option.entity';
import { Vote } from './modules/polls/entities/vote.entity';
import { Friendship } from './modules/social/entities/friendship.entity';
import { Follow } from './modules/social/entities/follow.entity';
import { UserBlock } from './modules/social/entities/user-block.entity';
import { UserSwipe } from './modules/social/entities/user-swipe.entity';

// MongoDB Schemas
import { UserMedia } from './database/mongo-schemas/schemas/user-media.schema';
import { ListingDocument } from './database/mongo-schemas/schemas/listing-document.schema';
import { Contract } from './database/mongo-schemas/schemas/contract.schema';
import { Message } from './database/mongo-schemas/schemas/message.schema';
import { EventDocument } from './database/mongo-schemas/schemas/event-document.schema';
import { EventTicket } from './database/mongo-schemas/schemas/event-ticket.schema';
import { IncidentDocument } from './database/mongo-schemas/schemas/incident-document.schema';

async function bootstrap() {
  console.log('=== Start Database Seeding ===');
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const dataSource = app.get(DataSource);
    const neo4jService = app.get(Neo4jService);
    const neo4jSyncService = app.get(Neo4jSyncService);

    // ==========================================
    // STEP 1: CLEANING DATABASES
    // ==========================================
    console.log('Cleaning PostgreSQL database...');
    const entities = dataSource.entityMetadatas;
    const tableNames = entities
      .map((entity) => `"${entity.tableName}"`)
      .join(', ');
    if (tableNames.length > 0) {
      await dataSource.query(`TRUNCATE TABLE ${tableNames} CASCADE;`);
    }

    console.log('Cleaning Neo4j database...');
    await neo4jService.run('MATCH (n) DETACH DELETE n');

    console.log('Cleaning MongoDB collections...');
    const mongoModels = [
      UserMedia.name, ListingDocument.name, Contract.name, Message.name,
      EventDocument.name, EventTicket.name, IncidentDocument.name,
    ];
    for (const modelName of mongoModels) {
      const model = app.get<Model<any>>(getModelToken(modelName));
      await model.deleteMany({});
    }

    // ==========================================
    // STEP 2: SEED CATEGORIES
    // ==========================================
    console.log('Seeding categories...');
    const listingCatRepo = app.get<Repository<ListingCategory>>(getRepositoryToken(ListingCategory));
    const eventCatRepo = app.get<Repository<EvenementsCategory>>(getRepositoryToken(EvenementsCategory));

    const toolsCat = await listingCatRepo.save(listingCatRepo.create({ categoryName: 'Bricolage & Outils' }));
    const gardenCat = await listingCatRepo.save(listingCatRepo.create({ categoryName: 'Jardinage', parentCategoryId: toolsCat.id }));
    const furnitureCat = await listingCatRepo.save(listingCatRepo.create({ categoryName: 'Mobilier' }));
    const servicesCat = await listingCatRepo.save(listingCatRepo.create({ categoryName: 'Services & Aide' }));
    const techCat = await listingCatRepo.save(listingCatRepo.create({ categoryName: 'Informatique & High-Tech' }));
    const kidsCat = await listingCatRepo.save(listingCatRepo.create({ categoryName: 'Enfants & Famille' }));

    const socialEventCat = await eventCatRepo.save(eventCatRepo.create({ categoryName: 'Social & Fêtes' }));
    const sportsEventCat = await eventCatRepo.save(eventCatRepo.create({ categoryName: 'Sports' }));
    const cleanUpEventCat = await eventCatRepo.save(eventCatRepo.create({ categoryName: 'Écologie & Nettoyage' }));
    const workshopEventCat = await eventCatRepo.save(eventCatRepo.create({ categoryName: 'Ateliers & Apprentissage' }));
    const cultureEventCat = await eventCatRepo.save(eventCatRepo.create({ categoryName: 'Culture & Sorties' }));

    // ==========================================
    // STEP 3: SEED NEIGHBOURHOODS (NEO4J)
    // ==========================================
    console.log('Seeding neighbourhoods in Neo4j...');
    const geoService = app.get(Neo4jGeoService);

    const downtownPolygon: GeoJSON.Polygon = {
      type: 'Polygon', coordinates: [[[2.34,48.85],[2.35,48.85],[2.35,48.86],[2.34,48.86],[2.34,48.85]]],
    };
    const maraisPolygon: GeoJSON.Polygon = {
      type: 'Polygon', coordinates: [[[2.35,48.85],[2.36,48.85],[2.36,48.86],[2.35,48.86],[2.35,48.85]]],
    };
    const villettePolygon: GeoJSON.Polygon = {
      type: 'Polygon', coordinates: [[[2.35,48.86],[2.36,48.86],[2.36,48.87],[2.35,48.87],[2.35,48.86]]],
    };

    const nb1 = await geoService.createNeighbourhood(downtownPolygon, {
      pg_id: 'nb-downtown', name: 'Downtown Paris', city: 'Paris', zip_code: '75001', country: 'France',
    });
    const nb2 = await geoService.createNeighbourhood(maraisPolygon, {
      pg_id: 'nb-marais', name: 'Marais District', city: 'Paris', zip_code: '75004', country: 'France',
    });
    const nb3 = await geoService.createNeighbourhood(villettePolygon, {
      pg_id: 'nb-villette', name: 'La Villette', city: 'Paris', zip_code: '75019', country: 'France',
    });

    console.log(`Neighbourhoods created. Downton adjacencies: ${nb1.adjacent_pg_ids.length}`);

    // ==========================================
    // STEP 4: SEED USERS
    // ==========================================
    console.log('Registering users via AuthService...');
    const authService = app.get(AuthService);
    const usersService = app.get(UsersService);
    const userRepo = app.get<Repository<User>>(getRepositoryToken(User));

    const mockUsers = [
      { email: 'alice@nabor.fr',   firstName: 'Alice',   lastName: 'Martin',  password: 'Password123!', nbId: 'nb-downtown', role: UserRoleEnum.RESIDENT },
      { email: 'bob@nabor.fr',     firstName: 'Bob',     lastName: 'Bernard', password: 'Password123!', nbId: 'nb-marais',   role: UserRoleEnum.RESIDENT },
      { email: 'charlie@nabor.fr', firstName: 'Charlie', lastName: 'Dubois',  password: 'Password123!', nbId: 'nb-downtown', role: UserRoleEnum.MODERATOR },
      { email: 'david@nabor.fr',   firstName: 'David',   lastName: 'Leroy',   password: 'Password123!', nbId: 'nb-villette', role: UserRoleEnum.ADMIN },
      { email: 'emma@nabor.fr',    firstName: 'Emma',    lastName: 'Petit',   password: 'Password123!', nbId: 'nb-downtown', role: UserRoleEnum.NEIGHBOURHOOD_REP },
      { email: 'felix@nabor.fr',   firstName: 'Félix',   lastName: 'Moreau',  password: 'Password123!', nbId: 'nb-marais',   role: UserRoleEnum.RESIDENT },
    ];

    const seededUsers: User[] = [];

    for (const u of mockUsers) {
      await authService.register({
        email: u.email, firstName: u.firstName, lastName: u.lastName, password: u.password,
      });

      const dbUser = await userRepo.findOneOrFail({ where: { email: u.email } });
      await usersService.updateProfile(dbUser.id, { neighbourhoodId: u.nbId });
      dbUser.role = u.role;
      await userRepo.save(dbUser);
      await neo4jSyncService.upsertUser({
        pgId: dbUser.id, role: dbUser.role, visibility: dbUser.visibility, neighbourhoodId: u.nbId,
      });

      seededUsers.push(dbUser);
      console.log(`  ${dbUser.firstName} (${u.role}) → ${u.nbId}`);
    }

    const [uAlice, uBob, uCharlie, uDavid, uEmma, uFelix] = seededUsers;

    // ==========================================
    // STEP 5: SEED SOCIAL RELATIONSHIPS
    // ==========================================
    console.log('Seeding social graph...');
    const socialService = app.get(UserSocialService);

    // Mutual follows → Friendship + DM group
    await socialService.follow(uAlice.id, uBob.id);
    await socialService.follow(uBob.id, uAlice.id);

    // One-way follows
    await socialService.follow(uCharlie.id, uAlice.id);
    await socialService.follow(uEmma.id, uAlice.id);
    await socialService.follow(uFelix.id, uBob.id);
    await socialService.follow(uAlice.id, uEmma.id);

    // Blocks
    await socialService.block(uAlice.id, uDavid.id);

    // Swipes (discovery data)
    const swipeRepo = app.get<Repository<UserSwipe>>(getRepositoryToken(UserSwipe));
    await swipeRepo.save([
      swipeRepo.create({ swiperId: uAlice.id, swipedId: uFelix.id, direction: 'like' }),
      swipeRepo.create({ swiperId: uEmma.id, swipedId: uAlice.id, direction: 'like' }),
      swipeRepo.create({ swiperId: uBob.id, swipedId: uEmma.id, direction: 'like' }),
    ]);

    console.log('Social graph seeded (follows, blocks, swipes).');

    // ==========================================
    // STEP 6: SEED LISTINGS
    // ==========================================
    console.log('Seeding listings...');
    const listingsService = app.get(ListingsService);
    const listingContentService = app.get(ListingContentService);
    const transactionService = app.get(ListingTransactionService);

    // Listing 1: Alice offers garden tools (free)
    const l1 = await listingsService.create(uAlice.id, {
      title: 'Tondeuse à gazon performante',
      description: 'Je prête ma tondeuse à gazon pour le week-end.',
      listing_type: ListingTypeEnum.OFFER, price_cents: 0,
      category_id: gardenCat.id, neighbourhood_id: 'nb-downtown',
    });
    await listingContentService.updateContent(uAlice.id, l1.id, {
      body_html: '<p>Tondeuse thermique Honda. À venir chercher sur place.</p>',
      tags: ['jardin', 'outil', 'gratuit'],
    });

    // Listing 2: Bob requests moving help (paid)
    const l2 = await listingsService.create(uBob.id, {
      title: 'Aide déménagement canapé',
      description: 'Besoin de deux bras pour descendre un canapé du 3ème.',
      listing_type: ListingTypeEnum.REQUEST, price_cents: 1500,
      category_id: servicesCat.id, neighbourhood_id: 'nb-marais',
    });
    await listingContentService.updateContent(uBob.id, l2.id, {
      body_html: '<p>Canapé lourd, 3ème étage sans ascenseur. Bières offertes !</p>',
      tags: ['déménagement', 'canapé', 'aide'],
    });

    // Listing 3: Emma offers tutoring
    const l3 = await listingsService.create(uEmma.id, {
      title: 'Cours de maths niveau collège',
      description: 'Professeure retraitée propose aide aux devoirs.',
      listing_type: ListingTypeEnum.OFFER, price_cents: 2000,
      category_id: kidsCat.id, neighbourhood_id: 'nb-downtown',
    });
    await listingContentService.updateContent(uEmma.id, l3.id, {
      body_html: '<p>Expérience 20 ans. Méthode pédagogique adaptée.</p>',
      tags: ['cours', 'maths', 'collège'],
    });

    // Listing 4: Félix offers laptop repair
    const l4 = await listingsService.create(uFelix.id, {
      title: 'Réparation PC et téléphones',
      description: 'Diagnostic gratuit, devis sous 24h.',
      listing_type: ListingTypeEnum.OFFER, price_cents: 3000,
      category_id: techCat.id, neighbourhood_id: 'nb-marais',
    });
    await listingContentService.updateContent(uFelix.id, l4.id, {
      body_html: '<p>Réparation écran, batterie, virus, upgrade RAM/SSD.</p>',
      tags: ['informatique', 'réparation', 'pc', 'téléphone'],
    });

    // Transaction: Alice requests Bob's moving help
    const tx1 = await transactionService.create(l2.id, uBob.id, uAlice.id, 1500, 150);

    // Transaction + contract: Félix requests Emma's tutoring
    const tx2 = await transactionService.create(l3.id, uEmma.id, uFelix.id, 2000, 200);

    console.log(`4 listings seeded. 2 transactions created.`);

    // ==========================================
    // STEP 7: SEED CONTRACTS (MONGODB)
    // ==========================================
    console.log('Seeding contracts in MongoDB...');
    const contractModel = app.get<Model<any>>(getModelToken(Contract.name));

    await new contractModel({
      pg_transaction_id: tx1.id,
      type: 'contract',
      sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      pdf: { gridfs_file_id: 'gridfs-seed-contract-1', mimetype: 'application/pdf', size_bytes: 28500 },
      parties: {
        provider: { pg_user_id: uBob.id, full_name: 'Bob Bernard', email: 'bob@nabor.fr' },
        requester: { pg_user_id: uAlice.id, full_name: 'Alice Martin', email: 'alice@nabor.fr' },
      },
      listing_snapshot: { title: 'Aide déménagement canapé', price_cents: 1500, listing_type: 'request', neighbourhood_name: 'Marais District' },
      signature: { canvas_b64: null, totp_verified_at: new Date(), signed_ip: '127.0.0.1', user_agent: 'Seed Script' },
      signed_at: new Date(), created_at: new Date(),
    }).save();

    await new contractModel({
      pg_transaction_id: tx2.id,
      type: 'contract',
      sha256_hash: 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
      pdf: { gridfs_file_id: 'gridfs-seed-contract-2', mimetype: 'application/pdf', size_bytes: 22100 },
      parties: {
        provider: { pg_user_id: uEmma.id, full_name: 'Emma Petit', email: 'emma@nabor.fr' },
        requester: { pg_user_id: uFelix.id, full_name: 'Félix Moreau', email: 'felix@nabor.fr' },
      },
      listing_snapshot: { title: 'Cours de maths niveau collège', price_cents: 2000, listing_type: 'offer', neighbourhood_name: 'Downtown Paris' },
      signature: { canvas_b64: null, totp_verified_at: new Date(), signed_ip: '127.0.0.1', user_agent: 'Seed Script' },
      signed_at: new Date(), created_at: new Date(),
    }).save();

    console.log('2 contracts seeded.');

    // ==========================================
    // STEP 8: SEED EVENTS
    // ==========================================
    console.log('Seeding events...');
    const eventsService = app.get(EventsService);
    const eventContentService = app.get(EventContentService);
    const stateMachineService = app.get(EventStateMachineService);

    // Event 1: Downtown BBQ (future, open)
    const e1 = await eventsService.create(uAlice.id, {
      title: 'Barbecue du quartier',
      description: 'Apportez vos grillades et votre bonne humeur !',
      cost_cents: 0, max_participants: 20, refund_deadline_hours: 24,
      category_id: socialEventCat.id, neighbourhood_id: 'nb-downtown',
      starts_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      ends_at: new Date(Date.now() + 5 * 86400000 + 4 * 3600000).toISOString(),
    });
    await eventContentService.updateContent(uAlice.id, e1.id, {
      body_html: '<h3>BBQ Communautaire</h3><p>Parc central. Apportez de quoi partager.</p>',
      location: { address: 'Square du centre ville, Paris', geocode: '48.855,2.345' },
    });
    await stateMachineService.publish(e1.id, uAlice.id);
    await stateMachineService.open(e1.id, uAlice.id);
    await eventsService.register(e1.id, uBob.id);
    await eventsService.swipe(uBob.id, e1.id, 'like');
    await eventsService.swipe(uEmma.id, e1.id, 'like');

    // Event 2: Park cleanup (future, paid)
    const e2 = await eventsService.create(uEmma.id, {
      title: 'Nettoyage du parc - opération écocitoyenne',
      description: 'Gants et sacs fournis. Goûter offert aux participants !',
      cost_cents: 500, max_participants: 15, refund_deadline_hours: 48,
      category_id: cleanUpEventCat.id, neighbourhood_id: 'nb-downtown',
      starts_at: new Date(Date.now() + 10 * 86400000).toISOString(),
      ends_at: new Date(Date.now() + 10 * 86400000 + 3 * 3600000).toISOString(),
    });
    await eventContentService.updateContent(uEmma.id, e2.id, {
      body_html: '<p>Rendez-vous à l\'entrée du parc à 9h. Gants et sacs fournis.</p>',
      location: { address: 'Parc municipal, Paris', geocode: '48.860,2.350' },
    });
    await stateMachineService.publish(e2.id, uEmma.id);
    await stateMachineService.open(e2.id, uEmma.id);
    await eventsService.register(e2.id, uAlice.id);
    await eventsService.register(e2.id, uFelix.id);

    // Event 3: Past yoga workshop
    const e3 = await eventsService.create(uCharlie.id, {
      title: 'Yoga au jardin (passé)',
      description: 'Session de yoga en plein air.',
      cost_cents: 0, max_participants: 10, refund_deadline_hours: 24,
      category_id: workshopEventCat.id, neighbourhood_id: 'nb-marais',
      starts_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      ends_at: new Date(Date.now() - 2 * 86400000 + 2 * 3600000).toISOString(),
    });
    await eventContentService.updateContent(uCharlie.id, e3.id, {
      body_html: '<p>Yoga Vinyasa, tous niveaux. Tapis non fournis.</p>',
      location: { address: 'Jardin public, Paris', geocode: '48.858,2.362' },
    });
    await stateMachineService.publish(e3.id, uCharlie.id);
    await stateMachineService.open(e3.id, uCharlie.id);
    await eventsService.register(e3.id, uAlice.id);

    console.log('3 events seeded.');

    // ==========================================
    // STEP 9: SEED EVENT TICKETS (MONGODB)
    // ==========================================
    console.log('Seeding event tickets...');
    const ticketModel = app.get<Model<any>>(getModelToken(EventTicket.name));
    const crypto = require('crypto');

    for (const [eventId, userId, firstName] of [
      [e1.id, uBob.id, 'Bob'], [e2.id, uAlice.id, 'Alice'], [e2.id, uFelix.id, 'Félix'], [e3.id, uAlice.id, 'Alice'],
    ]) {
      const hmac = crypto.createHmac('sha256', 'seed-secret').update(`${eventId}:${userId}`).digest('hex');
      await new ticketModel({
        pg_event_id: eventId, pg_user_id: userId,
        qr_payload: { event_id: eventId, user_id: userId, first_name: firstName, custom_value: null, hmac_sha256: hmac },
        qr_png: Buffer.from(`mock-qr-${eventId}-${userId}`),
        issued_at: new Date(),
      }).save();
    }

    console.log('4 event tickets seeded.');

    // ==========================================
    // STEP 10: SEED INCIDENTS
    // ==========================================
    console.log('Seeding incidents...');
    const incidentRepo = app.get<Repository<Incident>>(getRepositoryToken(Incident));
    const incidentDocModel = app.get<Model<any>>(getModelToken(IncidentDocument.name));

    const incidents = [
      { reporterId: uAlice.id, assignedTo: uDavid.id, nbId: 'nb-downtown', title: 'Nid de poule béant', description: 'Trou énorme chaussée principale.', severity: IncidentSeverityEnum.HIGH, status: IncidentStatusEnum.IN_PROGRESS, body: '~50cm large, 15cm profond. Risque crevaison.', hint: '12 rue principale' },
      { reporterId: uBob.id, assignedTo: uCharlie.id, nbId: 'nb-marais', title: 'Éclairage public défectueux', description: '3 lampadaires éteints rue des Lilas.', severity: IncidentSeverityEnum.MEDIUM, status: IncidentStatusEnum.OPEN, body: 'Depuis une semaine. Zone très sombre le soir.', hint: 'Rue des Lilas, entre n°5 et n°15' },
      { reporterId: uFelix.id, assignedTo: null, nbId: 'nb-marais', title: 'Dépôt sauvage', description: 'Déchets abandonnés au coin de la rue.', severity: IncidentSeverityEnum.LOW, status: IncidentStatusEnum.OPEN, body: 'Cartons, vieux meubles. Présent depuis 3 jours.', hint: 'Angle rue des Écoles / rue Pasteur' },
    ];

    for (const inc of incidents) {
      const saved = await incidentRepo.save(incidentRepo.create({
        reporterId: inc.reporterId, assignedTo: inc.assignedTo, neighbourhoodId: inc.nbId,
        title: inc.title, description: inc.description, severity: inc.severity, status: inc.status,
        assignedAt: inc.assignedTo ? new Date() : null,
      }));
      await new incidentDocModel({
        pg_incident_id: saved.id, body: inc.body, photos: [], location_hint: inc.hint,
        created_at: new Date(), updated_at: new Date(), synced_at: new Date(),
      }).save();
    }

    console.log('3 incidents seeded.');

    // ==========================================
    // STEP 11: SEED POLLS
    // ==========================================
    console.log('Seeding polls...');
    const pollRepo = app.get<Repository<Poll>>(getRepositoryToken(Poll));
    const pollOptRepo = app.get<Repository<PollOption>>(getRepositoryToken(PollOption));
    const voteRepo = app.get<Repository<Vote>>(getRepositoryToken(Vote));

    // Poll 1: Single choice — bench color
    const p1 = await pollRepo.save(pollRepo.create({
      title: 'Couleur des bancs publics', description: 'Quelle couleur pour les nouveaux bancs ?',
      creatorId: uEmma.id, neighbourhoodId: 'nb-downtown', pollType: PollTypeEnum.SINGLE,
      startsAt: new Date(), endsAt: new Date(Date.now() + 7 * 86400000), isAnonymous: false,
    }));
    const oVert = await pollOptRepo.save(pollOptRepo.create({ pollId: p1.id, label: 'Vert forêt' }));
    const oBleu = await pollOptRepo.save(pollOptRepo.create({ pollId: p1.id, label: 'Bleu océan' }));
    const oGris = await pollOptRepo.save(pollOptRepo.create({ pollId: p1.id, label: 'Gris anthracite' }));
    await voteRepo.save(voteRepo.create({ userId: uAlice.id, optionId: oVert.id, weight: 1 }));
    await voteRepo.save(voteRepo.create({ userId: uBob.id, optionId: oBleu.id, weight: 1 }));

    // Poll 2: Multiple choice — activities
    const p2 = await pollRepo.save(pollRepo.create({
      title: 'Activités à développer au centre social', description: 'Choisissez les activités qui vous intéressent.',
      creatorId: uCharlie.id, neighbourhoodId: 'nb-downtown', pollType: PollTypeEnum.MULTIPLE,
      startsAt: new Date(), endsAt: new Date(Date.now() + 14 * 86400000), isAnonymous: true,
    }));
    const oYoga = await pollOptRepo.save(pollOptRepo.create({ pollId: p2.id, label: 'Yoga / Méditation' }));
    const oTheatre = await pollOptRepo.save(pollOptRepo.create({ pollId: p2.id, label: 'Théâtre amateur' }));
    const oPotager = await pollOptRepo.save(pollOptRepo.create({ pollId: p2.id, label: 'Potager collectif' }));
    const oInformatique = await pollOptRepo.save(pollOptRepo.create({ pollId: p2.id, label: 'Atelier informatique' }));
    await voteRepo.save(voteRepo.create({ userId: uAlice.id, optionId: oYoga.id, weight: 1 }));
    await voteRepo.save(voteRepo.create({ userId: uAlice.id, optionId: oPotager.id, weight: 1 }));
    await voteRepo.save(voteRepo.create({ userId: uEmma.id, optionId: oInformatique.id, weight: 1 }));
    await voteRepo.save(voteRepo.create({ userId: uFelix.id, optionId: oInformatique.id, weight: 1 }));

    console.log('2 polls seeded (single + multiple, 6 votes).');

    // ==========================================
    // STEP 12: SEED MESSAGES
    // ==========================================
    console.log('Seeding messages...');
    const chatGroupRepo = app.get<Repository<ChatGroup>>(getRepositoryToken(ChatGroup));
    const uigRepo = app.get<Repository<UsersInGroup>>(getRepositoryToken(UsersInGroup));
    const msgMetaRepo = app.get<Repository<MessageMetadata>>(getRepositoryToken(MessageMetadata));
    const msgMongoModel = app.get<Model<any>>(getModelToken(Message.name));

    // Downtown group chat
    const groupChat = await chatGroupRepo.save(chatGroupRepo.create({
      name: 'Discussion générale - Downtown', description: 'Canal principal des résidents de Downtown.',
      createdBy: uEmma.id, type: ChatGroupTypeEnum.GROUP_CHAT,
    }));
    await uigRepo.save([
      uigRepo.create({ userId: uAlice.id, groupId: groupChat.id, roleInGroup: GroupRoleEnum.MESSAGE }),
      uigRepo.create({ userId: uEmma.id, groupId: groupChat.id, roleInGroup: GroupRoleEnum.ADMIN }),
      uigRepo.create({ userId: uCharlie.id, groupId: groupChat.id, roleInGroup: GroupRoleEnum.MESSAGE }),
    ]);

    // Messages in the group chat
    const messages = [
      { senderId: uEmma.id, content: 'Bienvenue à tous dans le groupe Downtown !', delay: 0 },
      { senderId: uAlice.id, content: 'Merci Emma ! Qui est dispo pour le BBQ samedi prochain ?', delay: 120000 },
      { senderId: uCharlie.id, content: 'Je viendrai avec une salade et des boissons.', delay: 240000 },
      { senderId: uEmma.id, content: 'Super ! Je m\'occupe du matériel de cuisson.', delay: 300000 },
    ];

    for (const msg of messages) {
      const msgId = crypto.randomUUID();
      await msgMetaRepo.save(msgMetaRepo.create({
        id: msgId, mongoMessageId: msgId, groupId: groupChat.id,
        senderId: msg.senderId, sentAt: new Date(Date.now() - 600000 + msg.delay), isDeleted: false,
      }));
      await new msgMongoModel({
        pg_message_id: msgId, pg_group_id: groupChat.id, pg_sender_id: msg.senderId,
        content_encrypted: Buffer.from(msg.content).toString('base64'),
        iv: '012345678901', auth_tag: '0123456789012345',
        type: 'text', attachments: [], reactions: [], sent_at: new Date(),
      }).save();
    }

    // DM chat group (from Alice ↔ Bob friendship — use the auto-created one if available)
    const friendship = await app.get<Repository<Friendship>>(getRepositoryToken(Friendship)).findOne({
      where: [{ user1Id: uAlice.id, user2Id: uBob.id }, { user1Id: uBob.id, user2Id: uAlice.id }],
    });

    if (friendship?.groupId) {
      const dmId = crypto.randomUUID();
      await msgMetaRepo.save(msgMetaRepo.create({
        id: dmId, mongoMessageId: dmId, groupId: friendship.groupId,
        senderId: uAlice.id, sentAt: new Date(), isDeleted: false,
      }));
      await new msgMongoModel({
        pg_message_id: dmId, pg_group_id: friendship.groupId, pg_sender_id: uAlice.id,
        content_encrypted: Buffer.from('Salut Bob, merci pour le coup de main !').toString('base64'),
        iv: '112233445566', auth_tag: 'aabbccddeeff0011',
        type: 'text', attachments: [], reactions: [], sent_at: new Date(),
      }).save();
      console.log('DM message seeded (Alice → Bob).');
    }

    console.log(`Group chat + ${messages.length} messages seeded.`);

    // ==========================================
    // STEP 13: SEED USER MEDIA (AVATARS)
    // ==========================================
    console.log('Seeding user avatars...');
    const userMediaModel = app.get<Model<any>>(getModelToken(UserMedia.name));

    await new userMediaModel({
      pg_user_id: uAlice.id, type: 'avatar', data: Buffer.from('mock-avatar-alice'),
      mimetype: 'image/webp', size_bytes: 1024, width_px: 200, height_px: 200, uploaded_at: new Date(),
    }).save();

    await new userMediaModel({
      pg_user_id: uEmma.id, type: 'avatar', data: Buffer.from('mock-avatar-emma'),
      mimetype: 'image/webp', size_bytes: 1536, width_px: 200, height_px: 200, uploaded_at: new Date(),
    }).save();

    console.log('2 user avatars seeded.');

    // ==========================================
    // STEP 14: AWAIT QUEUE DRAINING
    // ==========================================
    console.log('Waiting for BullMQ workers to drain pending jobs...');
    const queueNames = [
      'neo4j-sync', 'email', 'pdf-generation', 'stripe-webhook',
      'waitlist-promote', 'rgpd-anonymise', 'crypto-rotation',
      'event-register', 'contract-expiration',
    ];

    for (const qName of queueNames) {
      try {
        const queue = app.get<Queue>(getQueueToken(qName), { strict: false });
        if (queue) {
          let counts = await queue.getJobCounts('active', 'waiting', 'delayed');
          let total = counts.active + counts.waiting;
          if (total > 0) {
            console.log(`  Queue "${qName}" draining ${total} jobs...`);
            while (total > 0) {
              await new Promise((r) => setTimeout(r, 1000));
              counts = await queue.getJobCounts('active', 'waiting');
              total = counts.active + counts.waiting;
            }
          }
        }
      } catch {}
    }

    console.log('=== Database Seeding Complete ===');
  } catch (error) {
    console.error('Error during database seeding:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
