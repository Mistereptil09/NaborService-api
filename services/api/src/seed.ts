import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getModelToken } from '@nestjs/mongoose';
import { DataSource, Repository } from 'typeorm';
import { Model } from 'mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';

// Services
import { AuthService } from './modules/auth/auth.service';
import { UsersService } from './modules/users/users.service';
import { UserSocialService } from './modules/users/user-social.service';
import { ListingsService } from './modules/listings/listings.service';
import { ListingContentService } from './modules/listings/listing-content.service';
import { ListingTransactionService } from './modules/listings/listing-transaction.service';
import { ListingReportService } from './modules/listings/listing-report.service';
import { EventsService } from './modules/events/events.service';
import { EventContentService } from './modules/events/event-content.service';
import { EventStateMachineService } from './modules/events/event-state-machine.service';
import { EventReportService } from './modules/events/event-report.service';
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
  SwipeDirectionEnum,
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
  const app = await NestFactory.create(AppModule);
  await app.listen(0); // random port — needed for WebSocket server init

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
      { email: 'alice@nabor.fr',   firstName: 'Alice',   lastName: 'Martin',   password: 'Password123!', nbId: 'nb-downtown', role: UserRoleEnum.RESIDENT },
      { email: 'bob@nabor.fr',     firstName: 'Bob',     lastName: 'Bernard',  password: 'Password123!', nbId: 'nb-marais',   role: UserRoleEnum.RESIDENT },
      { email: 'charlie@nabor.fr', firstName: 'Charlie', lastName: 'Dubois',   password: 'Password123!', nbId: 'nb-downtown', role: UserRoleEnum.MODERATOR },
      { email: 'david@nabor.fr',   firstName: 'David',   lastName: 'Leroy',    password: 'Password123!', nbId: 'nb-villette', role: UserRoleEnum.ADMIN },
      { email: 'emma@nabor.fr',    firstName: 'Emma',    lastName: 'Petit',    password: 'Password123!', nbId: 'nb-downtown', role: UserRoleEnum.NEIGHBOURHOOD_REP },
      { email: 'felix@nabor.fr',   firstName: 'Félix',   lastName: 'Moreau',   password: 'Password123!', nbId: 'nb-marais',   role: UserRoleEnum.RESIDENT },
      { email: 'gabriel@nabor.fr', firstName: 'Gabriel', lastName: 'Roux',     password: 'Password123!', nbId: 'nb-villette', role: UserRoleEnum.RESIDENT },
      { email: 'helene@nabor.fr',  firstName: 'Hélène',  lastName: 'Fournier', password: 'Password123!', nbId: 'nb-downtown', role: UserRoleEnum.RESIDENT },
      { email: 'ismael@nabor.fr',  firstName: 'Ismaël',  lastName: 'Girard',   password: 'Password123!', nbId: 'nb-marais',   role: UserRoleEnum.RESIDENT },
      { email: 'julie@nabor.fr',   firstName: 'Julie',   lastName: 'Bonnet',   password: 'Password123!', nbId: 'nb-villette', role: UserRoleEnum.RESIDENT },
      { email: 'karim@nabor.fr',   firstName: 'Karim',   lastName: 'Faure',    password: 'Password123!', nbId: 'nb-downtown', role: UserRoleEnum.RESIDENT },
      { email: 'lea@nabor.fr',     firstName: 'Léa',     lastName: 'Mercier',  password: 'Password123!', nbId: 'nb-marais',   role: UserRoleEnum.RESIDENT },
      { email: 'mathis@nabor.fr',  firstName: 'Mathis',  lastName: 'Blanc',    password: 'Password123!', nbId: 'nb-villette', role: UserRoleEnum.RESIDENT },
      { email: 'nora@nabor.fr',    firstName: 'Nora',    lastName: 'Perrin',   password: 'Password123!', nbId: 'nb-downtown', role: UserRoleEnum.RESIDENT },
      { email: 'oscar@nabor.fr',   firstName: 'Oscar',   lastName: 'Simon',    password: 'Password123!', nbId: 'nb-marais',   role: UserRoleEnum.RESIDENT },
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

    const [
      uAlice, uBob, uCharlie, uDavid, uEmma, uFelix,
      uGabriel, uHelene, uIsmael, uJulie, uKarim, uLea, uMathis, uNora, uOscar,
    ] = seededUsers;

    // ==========================================
    // STEP 5: SEED SOCIAL RELATIONSHIPS
    // ==========================================
    console.log('Seeding social graph...');
    const socialService = app.get(UserSocialService);
    const friendshipRepo = app.get<Repository<Friendship>>(getRepositoryToken(Friendship));

    // Mutual-follow ring: user[i] <-> user[i+1] (wrapping) — guarantees every
    // seeded user has at least one friend (and a DM group + messages, seeded
    // in STEP 12), regardless of how many users are in the list.
    for (let i = 0; i < seededUsers.length; i++) {
      const a = seededUsers[i];
      const b = seededUsers[(i + 1) % seededUsers.length];
      await socialService.follow(a.id, b.id);
      await socialService.follow(b.id, a.id);
    }

    // Extra one-way follows for a less uniform-looking social graph
    await socialService.follow(uCharlie.id, uAlice.id);
    await socialService.follow(uEmma.id, uAlice.id);
    await socialService.follow(uFelix.id, uBob.id);
    await socialService.follow(uKarim.id, uEmma.id);
    await socialService.follow(uNora.id, uHelene.id);
    await socialService.follow(uOscar.id, uIsmael.id);

    // Blocks
    await socialService.block(uAlice.id, uDavid.id);

    // Swipes (discovery data)
    const swipeRepo = app.get<Repository<UserSwipe>>(getRepositoryToken(UserSwipe));
    await swipeRepo.save([
      swipeRepo.create({ swiperId: uAlice.id, swipedId: uFelix.id, direction: SwipeDirectionEnum.LIKE }),
      swipeRepo.create({ swiperId: uEmma.id, swipedId: uAlice.id, direction: SwipeDirectionEnum.LIKE }),
      swipeRepo.create({ swiperId: uBob.id, swipedId: uEmma.id, direction: SwipeDirectionEnum.LIKE }),
      swipeRepo.create({ swiperId: uKarim.id, swipedId: uNora.id, direction: SwipeDirectionEnum.LIKE }),
      swipeRepo.create({ swiperId: uJulie.id, swipedId: uMathis.id, direction: SwipeDirectionEnum.LIKE }),
      swipeRepo.create({ swiperId: uOscar.id, swipedId: uLea.id, direction: SwipeDirectionEnum.DISLIKE }),
    ]);

    console.log(`Social graph seeded (${seededUsers.length} users, ${seededUsers.length} mutual friendships via ring, extra follows, 1 block, 6 swipes).`);

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

    // Listing 5: Gabriel offers bike repair
    const l5 = await listingsService.create(uGabriel.id, {
      title: 'Réparation de vélos à domicile',
      description: 'Crevaison, freins, dérailleur : je passe chez vous.',
      listing_type: ListingTypeEnum.OFFER, price_cents: 1000,
      category_id: toolsCat.id, neighbourhood_id: 'nb-villette',
    });
    await listingContentService.updateContent(uGabriel.id, l5.id, {
      body_html: '<p>Mécanicien amateur, outillage complet. Devis avant intervention.</p>',
      tags: ['vélo', 'réparation', 'mobilité'],
    });

    // Listing 6: Hélène requests babysitting
    const l6 = await listingsService.create(uHelene.id, {
      title: 'Recherche baby-sitter le mercredi',
      description: 'Deux enfants (6 et 9 ans), mercredi après-midi.',
      listing_type: ListingTypeEnum.REQUEST, price_cents: 1200,
      category_id: kidsCat.id, neighbourhood_id: 'nb-downtown',
    });
    await listingContentService.updateContent(uHelene.id, l6.id, {
      body_html: '<p>De 13h à 18h. Expérience et références appréciées.</p>',
      tags: ['baby-sitting', 'enfants', 'mercredi'],
    });

    // Listing 7: Ismaël offers language lessons
    const l7 = await listingsService.create(uIsmael.id, {
      title: 'Cours d\'arabe pour débutants',
      description: 'Cours particuliers ou en petit groupe, tous niveaux.',
      listing_type: ListingTypeEnum.OFFER, price_cents: 1800,
      category_id: servicesCat.id, neighbourhood_id: 'nb-marais',
    });
    await listingContentService.updateContent(uIsmael.id, l7.id, {
      body_html: '<p>Approche conversationnelle, supports fournis.</p>',
      tags: ['langue', 'arabe', 'cours'],
    });

    // Listing 8: Julie offers a dining table + chairs
    const l8 = await listingsService.create(uJulie.id, {
      title: 'Table à manger + 4 chaises',
      description: 'Bon état, à venir démonter/récupérer sur place.',
      listing_type: ListingTypeEnum.OFFER, price_cents: 4000,
      category_id: furnitureCat.id, neighbourhood_id: 'nb-villette',
    });
    await listingContentService.updateContent(uJulie.id, l8.id, {
      body_html: '<p>Bois massif, quelques traces d\'usage. Dimensions sur demande.</p>',
      tags: ['mobilier', 'table', 'chaises'],
    });

    // Listing 9: Karim offers spare storage space
    const l9 = await listingsService.create(uKarim.id, {
      title: 'Cartons de déménagement à donner',
      description: 'Une trentaine de cartons, tailles variées, pliés à plat.',
      listing_type: ListingTypeEnum.OFFER, price_cents: 0,
      category_id: servicesCat.id, neighbourhood_id: 'nb-downtown',
    });
    await listingContentService.updateContent(uKarim.id, l9.id, {
      body_html: '<p>Récupérés lors de mon propre déménagement, en bon état.</p>',
      tags: ['cartons', 'déménagement', 'gratuit'],
    });

    // Listing 10: Léa offers cooking classes
    const l10 = await listingsService.create(uLea.id, {
      title: 'Ateliers cuisine du monde',
      description: 'Deux heures pour apprendre 2-3 recettes de saison.',
      listing_type: ListingTypeEnum.OFFER, price_cents: 2500,
      category_id: servicesCat.id, neighbourhood_id: 'nb-marais',
    });
    await listingContentService.updateContent(uLea.id, l10.id, {
      body_html: '<p>Chez moi ou chez vous, ingrédients à partager.</p>',
      tags: ['cuisine', 'atelier', 'convivial'],
    });

    // Listing 11: Nora offers pet-sitting
    const l11 = await listingsService.create(uNora.id, {
      title: 'Garde de chats et chiens',
      description: 'Disponible week-ends et vacances scolaires.',
      listing_type: ListingTypeEnum.OFFER, price_cents: 1500,
      category_id: servicesCat.id, neighbourhood_id: 'nb-downtown',
    });
    await listingContentService.updateContent(uNora.id, l11.id, {
      body_html: '<p>Amoureuse des animaux, plusieurs années d\'expérience.</p>',
      tags: ['animaux', 'garde', 'week-end'],
    });

    // Listing 12: Oscar offers computer setup help
    const l12 = await listingsService.create(uOscar.id, {
      title: 'Installation et configuration PC/imprimante',
      description: 'Installation, mises à jour, Wi-Fi, imprimante.',
      listing_type: ListingTypeEnum.OFFER, price_cents: 2000,
      category_id: techCat.id, neighbourhood_id: 'nb-marais',
    });
    await listingContentService.updateContent(uOscar.id, l12.id, {
      body_html: '<p>Intervention à domicile, explication pas à pas.</p>',
      tags: ['informatique', 'installation', 'aide'],
    });

    // Transaction: Alice requests Bob's moving help
    const tx1 = await transactionService.create(l2.id, uBob.id, uAlice.id, 1500, 150);

    // Transaction + contract: Félix requests Emma's tutoring
    const tx2 = await transactionService.create(l3.id, uEmma.id, uFelix.id, 2000, 200);

    // Transaction: Nora requests Julie's dining table
    const tx3 = await transactionService.create(l8.id, uJulie.id, uNora.id, 4000, 400);

    // Listing reports (moderation queue data)
    const listingReportService = app.get(ListingReportService);
    await listingReportService.createReport(uOscar.id, l6.id, 'Annonce suspecte, demande des informations personnelles avant tout échange.');
    await listingReportService.createReport(uMathis.id, l9.id, 'Annonce en doublon, déjà publiée dans un autre groupe.');
    await listingReportService.createReport(uGabriel.id, l11.id, 'Prix annoncé ne correspond pas à la description du service.');

    console.log(`12 listings seeded. 3 transactions created. 3 listing reports created.`);

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

    await new contractModel({
      pg_transaction_id: tx3.id,
      type: 'contract',
      sha256_hash: 'b5d4045c3f466fa91fe2cc6abe79232a1a57cdf104f7a26e716e0a1917894e00',
      pdf: { gridfs_file_id: 'gridfs-seed-contract-3', mimetype: 'application/pdf', size_bytes: 19800 },
      parties: {
        provider: { pg_user_id: uJulie.id, full_name: 'Julie Bonnet', email: 'julie@nabor.fr' },
        requester: { pg_user_id: uNora.id, full_name: 'Nora Perrin', email: 'nora@nabor.fr' },
      },
      listing_snapshot: { title: 'Table à manger + 4 chaises', price_cents: 4000, listing_type: 'offer', neighbourhood_name: 'La Villette' },
      signature: { canvas_b64: null, totp_verified_at: new Date(), signed_ip: '127.0.0.1', user_agent: 'Seed Script' },
      signed_at: new Date(), created_at: new Date(),
    }).save();

    console.log('3 contracts seeded.');

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

    // Event 4: Bike repair workshop (Villette)
    const e4 = await eventsService.create(uGabriel.id, {
      title: 'Atelier réparation de vélos',
      description: 'Apportez votre vélo, on répare ensemble.',
      cost_cents: 0, max_participants: 12, refund_deadline_hours: 24,
      category_id: workshopEventCat.id, neighbourhood_id: 'nb-villette',
      starts_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      ends_at: new Date(Date.now() + 7 * 86400000 + 3 * 3600000).toISOString(),
    });
    await eventContentService.updateContent(uGabriel.id, e4.id, {
      body_html: '<p>Outillage fourni. Chacun repart avec son vélo réparé.</p>',
      location: { address: 'Place de la Villette, Paris', geocode: '48.866,2.356' },
    });
    await stateMachineService.publish(e4.id, uGabriel.id);
    await stateMachineService.open(e4.id, uGabriel.id);
    await eventsService.register(e4.id, uJulie.id);
    await eventsService.register(e4.id, uMathis.id);

    // Event 5: Pétanque tournament (Downtown)
    const e5 = await eventsService.create(uKarim.id, {
      title: 'Tournoi de pétanque amical',
      description: 'Équipes de 2, inscriptions sur place.',
      cost_cents: 300, max_participants: 24, refund_deadline_hours: 24,
      category_id: sportsEventCat.id, neighbourhood_id: 'nb-downtown',
      starts_at: new Date(Date.now() + 8 * 86400000).toISOString(),
      ends_at: new Date(Date.now() + 8 * 86400000 + 4 * 3600000).toISOString(),
    });
    await eventContentService.updateContent(uKarim.id, e5.id, {
      body_html: '<p>Boules prêtées sur place. Buvette associative.</p>',
      location: { address: 'Square Karim, Paris', geocode: '48.856,2.347' },
    });
    await stateMachineService.publish(e5.id, uKarim.id);
    await stateMachineService.open(e5.id, uKarim.id);
    await eventsService.register(e5.id, uAlice.id);
    await eventsService.register(e5.id, uHelene.id);
    await eventsService.register(e5.id, uNora.id);

    // Event 6: Language exchange meetup (Marais)
    const e6 = await eventsService.create(uLea.id, {
      title: 'Soirée échange linguistique',
      description: 'Français, arabe, anglais... venez pratiquer !',
      cost_cents: 0, max_participants: 20, refund_deadline_hours: 24,
      category_id: cultureEventCat.id, neighbourhood_id: 'nb-marais',
      starts_at: new Date(Date.now() + 12 * 86400000).toISOString(),
      ends_at: new Date(Date.now() + 12 * 86400000 + 3 * 3600000).toISOString(),
    });
    await eventContentService.updateContent(uLea.id, e6.id, {
      body_html: '<p>Ambiance décontractée, boissons chacun apporte quelque chose.</p>',
      location: { address: 'Café associatif, Paris', geocode: '48.859,2.362' },
    });
    await stateMachineService.publish(e6.id, uLea.id);
    await stateMachineService.open(e6.id, uLea.id);
    await eventsService.register(e6.id, uBob.id);
    await eventsService.register(e6.id, uIsmael.id);
    await eventsService.register(e6.id, uOscar.id);

    // Event reports (moderation queue data)
    const eventReportService = app.get(EventReportService);
    await eventReportService.createReport(uJulie.id, e5.id, 'Lieu indiqué inexact, l\'adresse ne correspond à aucun square.');
    await eventReportService.createReport(uNora.id, e6.id, 'Contenu à caractère commercial déguisé en événement communautaire.');

    console.log('6 events seeded. 2 event reports created.');

    // ==========================================
    // STEP 9: SEED EVENT TICKETS (MONGODB)
    // ==========================================
    console.log('Seeding event tickets...');
    const ticketModel = app.get<Model<any>>(getModelToken(EventTicket.name));
    const crypto = require('crypto');

    for (const [eventId, userId, firstName] of [
      [e1.id, uBob.id, 'Bob'],
      [e2.id, uAlice.id, 'Alice'],
      [e2.id, uFelix.id, 'Félix'],
      [e3.id, uAlice.id, 'Alice'],
      [e4.id, uJulie.id, 'Julie'],
      [e4.id, uMathis.id, 'Mathis'],
      [e5.id, uAlice.id, 'Alice'],
      [e5.id, uHelene.id, 'Hélène'],
      [e6.id, uBob.id, 'Bob'],
      [e6.id, uIsmael.id, 'Ismaël'],
    ]) {
      const hmac = crypto.createHmac('sha256', 'seed-secret').update(`${eventId}:${userId}`).digest('hex');
      await new ticketModel({
        pg_event_id: eventId, pg_user_id: userId,
        qr_payload: { event_id: eventId, user_id: userId, first_name: firstName, custom_value: null, hmac_sha256: hmac },
        qr_png: Buffer.from(`mock-qr-${eventId}-${userId}`),
        issued_at: new Date(),
      }).save();
    }

    console.log('10 event tickets seeded.');

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
      { reporterId: uJulie.id, assignedTo: uDavid.id, nbId: 'nb-villette', title: 'Banc public cassé', description: 'Planche fendue, risque de blessure.', severity: IncidentSeverityEnum.LOW, status: IncidentStatusEnum.OPEN, body: 'Assise fendue sur toute la longueur.', hint: 'Allée centrale du parc de la Villette' },
      { reporterId: uKarim.id, assignedTo: uCharlie.id, nbId: 'nb-downtown', title: 'Tags sur la façade de l\'école', description: 'Graffitis apparus dans la nuit.', severity: IncidentSeverityEnum.MEDIUM, status: IncidentStatusEnum.IN_PROGRESS, body: 'Mur entier côté cour recouvert.', hint: 'École primaire, rue des Tilleuls' },
      { reporterId: uOscar.id, assignedTo: null, nbId: 'nb-marais', title: 'Nuisances sonores nocturnes', description: 'Bruit récurrent après 23h depuis un chantier.', severity: IncidentSeverityEnum.LOW, status: IncidentStatusEnum.OPEN, body: 'Plusieurs riverains concernés, tous les soirs cette semaine.', hint: 'Chantier rue de la Poterne' },
      { reporterId: uGabriel.id, assignedTo: uDavid.id, nbId: 'nb-villette', title: 'Fuite d\'eau importante', description: 'Eau qui ruisselle en continu depuis un regard.', severity: IncidentSeverityEnum.HIGH, status: IncidentStatusEnum.IN_PROGRESS, body: 'Chaussée glissante, risque de chute. Signalé à la mairie.', hint: 'Angle quai de la Loire / rue de Crimée' },
      { reporterId: uHelene.id, assignedTo: uCharlie.id, nbId: 'nb-downtown', title: 'Jeux d\'enfants endommagés', description: 'Toboggan fissuré au square principal.', severity: IncidentSeverityEnum.MEDIUM, status: IncidentStatusEnum.RESOLVED, body: 'Pièce remplacée par les services techniques.', hint: 'Square du centre ville, aire de jeux' },
      { reporterId: uIsmael.id, assignedTo: uDavid.id, nbId: 'nb-marais', title: 'Odeur de gaz suspecte', description: 'Forte odeur près d\'un immeuble résidentiel.', severity: IncidentSeverityEnum.CRITICAL, status: IncidentStatusEnum.IN_PROGRESS, body: 'Pompiers et GRDF prévenus, immeuble évacué par précaution.', hint: '8 rue des Archives' },
      { reporterId: uMathis.id, assignedTo: uDavid.id, nbId: 'nb-villette', title: 'Arbre tombé sur le trottoir', description: 'Grosse branche bloque le passage piéton.', severity: IncidentSeverityEnum.MEDIUM, status: IncidentStatusEnum.RESOLVED, body: 'Évacuée par les espaces verts le lendemain matin.', hint: 'Avenue Jean Jaurès, hauteur n°40' },
      { reporterId: uLea.id, assignedTo: null, nbId: 'nb-marais', title: 'Fuite d\'eau en cave commune', description: 'Infiltration visible au sous-sol de l\'immeuble.', severity: IncidentSeverityEnum.HIGH, status: IncidentStatusEnum.OPEN, body: 'Odeur d\'humidité, murs qui noircissent.', hint: '22 rue Vieille du Temple, sous-sol' },
      { reporterId: uNora.id, assignedTo: uCharlie.id, nbId: 'nb-downtown', title: 'Balançoire cassée', description: 'Chaîne rompue sur une balançoire du square.', severity: IncidentSeverityEnum.LOW, status: IncidentStatusEnum.RESOLVED, body: 'Remplacée lors de la maintenance mensuelle.', hint: 'Square du centre ville, aire de jeux' },
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

    console.log(`${incidents.length} incidents seeded.`);

    // ==========================================
    // STEP 11: SEED POLLS
    // ==========================================
    console.log('Seeding polls...');
    const pollRepo = app.get<Repository<Poll>>(getRepositoryToken(Poll));
    const pollOptRepo = app.get<Repository<PollOption>>(getRepositoryToken(PollOption));
    const voteRepo = app.get<Repository<Vote>>(getRepositoryToken(Vote));

    // Poll 1: Single choice — bench color (Downtown)
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

    // Poll 2: Multiple choice — activities (Downtown)
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

    // Poll 3: Single choice — market square layout (Marais)
    const p3 = await pollRepo.save(pollRepo.create({
      title: 'Aménagement de la place du marché', description: 'Quel équipement ajouter en priorité ?',
      creatorId: uIsmael.id, neighbourhoodId: 'nb-marais', pollType: PollTypeEnum.SINGLE,
      startsAt: new Date(), endsAt: new Date(Date.now() + 10 * 86400000), isAnonymous: false,
    }));
    const oKiosque = await pollOptRepo.save(pollOptRepo.create({ pollId: p3.id, label: 'Kiosque à journaux' }));
    const oFontaine = await pollOptRepo.save(pollOptRepo.create({ pollId: p3.id, label: 'Fontaine à eau' }));
    const oBoiteLivres = await pollOptRepo.save(pollOptRepo.create({ pollId: p3.id, label: 'Boîte à livres' }));
    await voteRepo.save(voteRepo.create({ userId: uBob.id, optionId: oFontaine.id, weight: 1 }));
    await voteRepo.save(voteRepo.create({ userId: uFelix.id, optionId: oBoiteLivres.id, weight: 1 }));
    await voteRepo.save(voteRepo.create({ userId: uLea.id, optionId: oFontaine.id, weight: 1 }));

    // Poll 4: Multiple choice — neighbourhood party theme (Villette)
    const p4 = await pollRepo.save(pollRepo.create({
      title: 'Thème de la fête de quartier', description: 'Plusieurs choix possibles.',
      creatorId: uJulie.id, neighbourhoodId: 'nb-villette', pollType: PollTypeEnum.MULTIPLE,
      startsAt: new Date(), endsAt: new Date(Date.now() + 21 * 86400000), isAnonymous: true,
    }));
    const oRetro = await pollOptRepo.save(pollOptRepo.create({ pollId: p4.id, label: 'Décennies rétro' }));
    const oCarnaval = await pollOptRepo.save(pollOptRepo.create({ pollId: p4.id, label: 'Carnaval' }));
    const oGuinguette = await pollOptRepo.save(pollOptRepo.create({ pollId: p4.id, label: 'Guinguette' }));
    await voteRepo.save(voteRepo.create({ userId: uDavid.id, optionId: oGuinguette.id, weight: 1 }));
    await voteRepo.save(voteRepo.create({ userId: uGabriel.id, optionId: oRetro.id, weight: 1 }));
    await voteRepo.save(voteRepo.create({ userId: uGabriel.id, optionId: oCarnaval.id, weight: 1 }));
    await voteRepo.save(voteRepo.create({ userId: uMathis.id, optionId: oCarnaval.id, weight: 1 }));

    console.log('4 polls seeded (2 single, 2 multiple, 13 votes).');

    // ==========================================
    // STEP 12: SEED GROUP CHATS + MESSAGES
    // ==========================================
    console.log('Seeding group chats and messages...');
    const chatGroupRepo = app.get<Repository<ChatGroup>>(getRepositoryToken(ChatGroup));
    const uigRepo = app.get<Repository<UsersInGroup>>(getRepositoryToken(UsersInGroup));
    const msgMetaRepo = app.get<Repository<MessageMetadata>>(getRepositoryToken(MessageMetadata));
    const msgMongoModel = app.get<Model<any>>(getModelToken(Message.name));

    // ── AES-256-GCM helpers (mirrors chat-message.service.ts) ──
    const AES_ALGO = 'aes-256-gcm';
    const IV_LENGTH = 12; // 96 bits
    const masterKey = Buffer.from(process.env.AES_MASTER_KEY!, 'hex');

    function encryptGroupKey(rawKey: Buffer): string {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(AES_ALGO, masterKey, iv);
      const encrypted = Buffer.concat([cipher.update(rawKey), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
    }

    function encryptMessage(plaintext: string, groupKey: Buffer): { encrypted: string; iv: string; authTag: string } {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(AES_ALGO, groupKey, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return {
        encrypted: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
      };
    }

    async function sendMessage(groupId: string, groupKey: Buffer, sender: User, content: string, atMs: number) {
      const msgId = crypto.randomUUID();
      const enc = encryptMessage(content, groupKey);
      await msgMetaRepo.save(msgMetaRepo.create({
        id: msgId, mongoMessageId: msgId, groupId,
        senderId: sender.id, sentAt: new Date(atMs), isDeleted: false,
      }));
      await new msgMongoModel({
        pg_message_id: msgId, pg_group_id: groupId, pg_sender_id: sender.id,
        content_encrypted: enc.encrypted, iv: enc.iv, auth_tag: enc.authTag,
        type: 'text', attachments: [], reactions: [], sent_at: new Date(atMs),
      }).save();
    }

    // ── Multi-person neighbourhood group chats ──
    const neighbourhoodGroups: {
      name: string; description: string; nbId: string; admin: User; members: User[];
      messages: { sender: User; content: string }[];
    }[] = [
      {
        name: 'Discussion générale - Downtown', description: 'Canal principal des résidents de Downtown.',
        nbId: 'nb-downtown', admin: uEmma,
        members: [uAlice, uCharlie, uEmma, uHelene, uKarim, uNora],
        messages: [
          { sender: uEmma, content: 'Bienvenue à tous dans le groupe Downtown !' },
          { sender: uAlice, content: 'Merci Emma ! Qui est dispo pour le BBQ samedi prochain ?' },
          { sender: uCharlie, content: 'Je viendrai avec une salade et des boissons.' },
          { sender: uHelene, content: 'Je peux amener des chaises pliantes si besoin.' },
          { sender: uKarim, content: 'Et moi le tournoi de pétanque du week-end d\'après, qui est chaud ?' },
          { sender: uEmma, content: 'Super ! Je m\'occupe du matériel de cuisson pour le BBQ.' },
        ],
      },
      {
        name: 'Discussion générale - Marais', description: 'Canal principal des résidents du Marais.',
        nbId: 'nb-marais', admin: uBob,
        members: [uBob, uFelix, uIsmael, uLea, uOscar],
        messages: [
          { sender: uBob, content: 'Salut le Marais, bienvenue dans le canal !' },
          { sender: uFelix, content: 'Hello ! Quelqu\'un a des nouvelles du nettoyage de rue ?' },
          { sender: uIsmael, content: 'C\'est prévu le mois prochain je crois.' },
          { sender: uLea, content: 'Je peux relayer l\'info sur le tableau d\'affichage.' },
          { sender: uOscar, content: 'Merci Léa, tiens-nous au courant !' },
        ],
      },
      {
        name: 'Discussion générale - La Villette', description: 'Canal principal des résidents de La Villette.',
        nbId: 'nb-villette', admin: uDavid,
        members: [uDavid, uGabriel, uJulie, uMathis],
        messages: [
          { sender: uDavid, content: 'Bienvenue dans le canal de La Villette.' },
          { sender: uGabriel, content: 'Merci David, content d\'être là !' },
          { sender: uJulie, content: 'Quelqu\'un connaît un bon plombier dans le coin ?' },
          { sender: uMathis, content: 'Oui, je t\'envoie un contact en MP.' },
        ],
      },
    ];

    let totalGroupMessages = 0;
    for (const g of neighbourhoodGroups) {
      const groupKey = crypto.randomBytes(32);
      const group = await chatGroupRepo.save(chatGroupRepo.create({
        name: g.name, description: g.description,
        createdBy: g.admin.id, type: ChatGroupTypeEnum.GROUP_CHAT,
        encryptedGroupKey: encryptGroupKey(groupKey),
      }));
      await uigRepo.save(
        g.members.map((m) =>
          uigRepo.create({
            userId: m.id, groupId: group.id,
            roleInGroup: m.id === g.admin.id ? GroupRoleEnum.ADMIN : GroupRoleEnum.MESSAGE,
          }),
        ),
      );

      // Sequential (not parallel) so sentAt ordering matches array order and
      // Mongo writes don't race each other for the same group.
      const baseMs = Date.now() - 600000;
      for (let idx = 0; idx < g.messages.length; idx++) {
        const msg = g.messages[idx];
        await sendMessage(group.id, groupKey, msg.sender, msg.content, baseMs + idx * 120000);
      }
      totalGroupMessages += g.messages.length;
    }

    console.log(`${neighbourhoodGroups.length} neighbourhood group chats seeded (${totalGroupMessages} messages).`);

    // ── DM threads for every ring friendship (guarantees every seeded user
    // has at least one 1:1 conversation with messages) ──
    const dmTemplates: [string, string][] = [
      ['Salut ! Contente qu\'on soit voisins :)', 'Hello ! Oui, hâte de faire connaissance.'],
      ['Hey, tu connais un bon plombier dans le coin ?', 'Oui je peux te filer un contact !'],
      ['Merci encore pour hier, c\'était top.', 'Avec plaisir, on remet ça quand tu veux !'],
      ['Tu vas au marché ce week-end ?', 'Oui, dimanche matin normalement.'],
      ['J\'ai vu ton annonce, ça m\'intéresse !', 'Super, je t\'envoie les détails.'],
      ['Bienvenue dans le quartier !', 'Merci beaucoup, ça fait plaisir :)'],
      ['On se croise au parc parfois non ?', 'Ah oui je crois t\'avoir déjà vu !'],
      ['Dispo pour un café cette semaine ?', 'Avec plaisir, jeudi ça te va ?'],
    ];

    let dmCount = 0;
    for (let i = 0; i < seededUsers.length; i++) {
      const a = seededUsers[i];
      const b = seededUsers[(i + 1) % seededUsers.length];
      const fr = await friendshipRepo.findOne({
        where: [{ user1Id: a.id, user2Id: b.id }, { user1Id: b.id, user2Id: a.id }],
      });
      if (!fr?.groupId) continue;

      const dmGroupKey = crypto.randomBytes(32);
      await chatGroupRepo.update({ id: fr.groupId }, { encryptedGroupKey: encryptGroupKey(dmGroupKey) });

      const [msg1, msg2] = dmTemplates[i % dmTemplates.length];
      const baseMs = Date.now() - 600000;
      await sendMessage(fr.groupId, dmGroupKey, a, msg1, baseMs);
      await sendMessage(fr.groupId, dmGroupKey, b, msg2, baseMs + 180000);
      dmCount++;
    }

    console.log(`${dmCount} DM threads seeded (${dmCount * 2} messages) — every user has at least one friend + conversation.`);

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
      'event-register', 'contract-expiration', 'call-timeout',
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
