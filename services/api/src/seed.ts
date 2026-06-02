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
    const tableNames = entities.map((entity) => `"${entity.tableName}"`).join(', ');
    if (tableNames.length > 0) {
      await dataSource.query(`TRUNCATE TABLE ${tableNames} CASCADE;`);
    }

    console.log('Cleaning Neo4j database...');
    await neo4jService.run('MATCH (n) DETACH DELETE n');

    console.log('Cleaning MongoDB collections...');
    const mongoModels = [
      UserMedia.name,
      ListingDocument.name,
      Contract.name,
      Message.name,
      EventDocument.name,
      EventTicket.name,
      IncidentDocument.name,
    ];
    for (const modelName of mongoModels) {
      const model = app.get<Model<any>>(getModelToken(modelName));
      await model.deleteMany({});
    }

    // ==========================================
    // STEP 2: SEED CATEGORIES (POSTGRES)
    // ==========================================
    console.log('Seeding listing and event categories...');
    const listingCatRepo = app.get<Repository<ListingCategory>>(getRepositoryToken(ListingCategory));
    const eventCatRepo = app.get<Repository<EvenementsCategory>>(getRepositoryToken(EvenementsCategory));

    const toolsCat = await listingCatRepo.save(listingCatRepo.create({ categoryName: 'Bricolage & Outils' }));
    const gardenCat = await listingCatRepo.save(
      listingCatRepo.create({ categoryName: 'Jardinage', parentCategoryId: toolsCat.id }),
    );
    const furnitureCat = await listingCatRepo.save(listingCatRepo.create({ categoryName: 'Mobilier' }));
    const servicesCat = await listingCatRepo.save(listingCatRepo.create({ categoryName: 'Services & Aide' }));

    const socialEventCat = await eventCatRepo.save(eventCatRepo.create({ categoryName: 'Social & Fêtes' }));
    const sportsEventCat = await eventCatRepo.save(eventCatRepo.create({ categoryName: 'Sports' }));
    const cleanUpEventCat = await eventCatRepo.save(eventCatRepo.create({ categoryName: 'Écologie & Nettoyage' }));
    const workshopEventCat = await eventCatRepo.save(eventCatRepo.create({ categoryName: 'Ateliers & Apprentissage' }));

    // ==========================================
    // STEP 3: SEED NEIGHBOURHOODS (NEO4J)
    // ==========================================
    console.log('Seeding neighbourhoods in Neo4j...');
    const geoService = app.get(Neo4jGeoService);

    const downtownPolygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [2.340, 48.850],
          [2.350, 48.850],
          [2.350, 48.860],
          [2.340, 48.860],
          [2.340, 48.850],
        ],
      ],
    };

    const maraisPolygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [2.350, 48.850],
          [2.360, 48.850],
          [2.360, 48.860],
          [2.350, 48.860],
          [2.350, 48.850],
        ],
      ],
    };

    const villettePolygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [2.350, 48.860],
          [2.360, 48.860],
          [2.360, 48.870],
          [2.350, 48.870],
          [2.350, 48.860],
        ],
      ],
    };

    const nb1 = await geoService.createNeighbourhood(downtownPolygon, {
      pg_id: 'nb-downtown',
      name: 'Downtown Paris',
      city: 'Paris',
      zip_code: '75001',
      country: 'France',
    });

    const nb2 = await geoService.createNeighbourhood(maraisPolygon, {
      pg_id: 'nb-marais',
      name: 'Marais District',
      city: 'Paris',
      zip_code: '75004',
      country: 'France',
    });

    const nb3 = await geoService.createNeighbourhood(villettePolygon, {
      pg_id: 'nb-villette',
      name: 'La Villette',
      city: 'Paris',
      zip_code: '75019',
      country: 'France',
    });

    console.log(`Neighbourhoods created. Adjacencies: nb-downtown has ${nb1.adjacent_pg_ids.length} adjacencies.`);

    // ==========================================
    // STEP 4: SEED USERS (AUTH & USER SERVICE)
    // ==========================================
    console.log('Registering mock users via AuthService...');
    const authService = app.get(AuthService);
    const usersService = app.get(UsersService);
    const userRepo = app.get<Repository<User>>(getRepositoryToken(User));

    const mockUsers = [
      { email: 'resident1@nabor.fr', firstName: 'Alice', lastName: 'Martin', password: 'Password123!', nbId: 'nb-downtown', role: UserRoleEnum.RESIDENT },
      { email: 'resident2@nabor.fr', firstName: 'Bob', lastName: 'Bernard', password: 'Password123!', nbId: 'nb-marais', role: UserRoleEnum.RESIDENT },
      { email: 'mod1@nabor.fr', firstName: 'Charlie', lastName: 'Dubois', password: 'Password123!', nbId: 'nb-downtown', role: UserRoleEnum.MODERATOR },
      { email: 'admin1@nabor.fr', firstName: 'David', lastName: 'Leroy', password: 'Password123!', nbId: 'nb-villette', role: UserRoleEnum.ADMIN },
    ];

    const seededUsers: User[] = [];

    for (const u of mockUsers) {
      await authService.register({
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        password: u.password,
      });

      // Retrieve registered user
      const dbUser = await userRepo.findOneOrFail({ where: { email: u.email } });

      // Assign to neighbourhood via UsersService.updateProfile (so that lives_in is synced with Neo4j)
      await usersService.updateProfile(dbUser.id, { neighbourhoodId: u.nbId });

      // Update role directly in PostgreSQL
      dbUser.role = u.role;
      await userRepo.save(dbUser);

      // Sync role and user to Neo4j
      await neo4jSyncService.upsertUser({
        pgId: dbUser.id,
        role: dbUser.role,
        visibility: dbUser.visibility,
        neighbourhoodId: u.nbId,
      });

      seededUsers.push(dbUser);
      console.log(`Registered user ${dbUser.firstName} (${dbUser.email}) with role ${dbUser.role}`);
    }

    const [uAlice, uBob, uCharlie, uDavid] = seededUsers;

    // ==========================================
    // STEP 5: SEED SOCIAL RELATIONSHIPS
    // ==========================================
    console.log('Seeding social graph...');
    const socialService = app.get(UserSocialService);

    // Mutual follow (Alice <-> Bob) -> creates Friendship and Direct Message ChatGroup
    await socialService.follow(uAlice.id, uBob.id);
    await socialService.follow(uBob.id, uAlice.id);

    // One-way follow (Charlie -> Alice)
    await socialService.follow(uCharlie.id, uAlice.id);

    // Block relationship (Alice blocks David)
    await socialService.block(uAlice.id, uDavid.id);

    console.log('Social relationships established.');

    // ==========================================
    // STEP 6: SEED LISTINGS (LISTINGS SERVICE)
    // ==========================================
    console.log('Seeding listings...');
    const listingsService = app.get(ListingsService);
    const listingContentService = app.get(ListingContentService);
    const transactionService = app.get(ListingTransactionService);

    // Listing 1: Lawn mower offer from Alice
    const listing1 = await listingsService.create(uAlice.id, {
      title: 'Tondeuse à gazon performante',
      description: 'Je prête ma tondeuse à gazon pour le week-end.',
      listing_type: ListingTypeEnum.OFFER,
      price_cents: 0,
      category_id: gardenCat.id,
      neighbourhood_id: 'nb-downtown',
    });

    await listingContentService.updateContent(uAlice.id, listing1.id, {
      body_html: '<p>Tondeuse thermique de marque Honda. À venir chercher sur place.</p>',
      tags: ['jardin', 'outil', 'gratuit'],
    });

    // Listing 2: Sofa help request from Bob
    const listing2 = await listingsService.create(uBob.id, {
      title: 'Aide déménagement canapé',
      description: 'Besoin de deux bras pour descendre un canapé du 3ème étage.',
      listing_type: ListingTypeEnum.REQUEST,
      price_cents: 1500, // 15.00 EUR
      category_id: servicesCat.id,
      neighbourhood_id: 'nb-marais',
    });

    await listingContentService.updateContent(uBob.id, listing2.id, {
      body_html: '<p>Le canapé est lourd. Prévu samedi après-midi. Bières offertes en prime !</p>',
      tags: ['déménagement', 'canapé', 'aide'],
    });

    // Listing Transaction: Alice requests Bob\'s help listing
    const tx1 = await transactionService.create(listing2.id, uBob.id, uAlice.id, 1500, 150);

    console.log(`Listings seeded. Transaction created for Bob's listing: status ${tx1.status}`);

    // ==========================================
    // STEP 7: SEED EVENTS (EVENTS MODULE)
    // ==========================================
    console.log('Seeding events...');
    const eventsService = app.get(EventsService);
    const eventContentService = app.get(EventContentService);
    const stateMachineService = app.get(EventStateMachineService);

    // Event 1: Downtown BBQ
    const event1 = await eventsService.create(uAlice.id, {
      title: 'Barbecue du quartier',
      description: 'Apportez vos grillades et votre bonne humeur !',
      cost_cents: 0,
      max_participants: 20,
      refund_deadline_hours: 24,
      category_id: socialEventCat.id,
      neighbourhood_id: 'nb-downtown',
      starts_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // in 5 days
      ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
    });

    await eventContentService.updateContent(uAlice.id, event1.id, {
      body_html: '<h3>BBQ Communautaire</h3><p>Rendez-vous dans le parc central avec de quoi partager.</p>',
      location: {
        address: 'Square du centre ville, Paris',
        geocode: '48.855,2.345',
      },
    });

    // Publish and open registrations
    await stateMachineService.publish(event1.id, uAlice.id);
    await stateMachineService.open(event1.id, uAlice.id);

    // Bob registers to Alice\'s event
    await eventsService.register(event1.id, uBob.id);
    // Bob likes (swipes) the event
    await eventsService.swipe(uBob.id, event1.id, 'like');

    console.log('Events seeded.');

    // ==========================================
    // STEP 8: SEED INCIDENTS
    // ==========================================
    console.log('Seeding incidents...');
    const incidentRepo = app.get<Repository<Incident>>(getRepositoryToken(Incident));
    const incidentDocModel = app.get<Model<any>>(getModelToken(IncidentDocument.name));

    const incident1 = await incidentRepo.save(
      incidentRepo.create({
        reporterId: uAlice.id,
        assignedTo: uDavid.id,
        neighbourhoodId: 'nb-downtown',
        title: 'Nid de poule béant',
        description: 'Un énorme trou s\'est formé sur la chaussée principale.',
        severity: IncidentSeverityEnum.HIGH,
        status: IncidentStatusEnum.IN_PROGRESS,
        assignedAt: new Date(),
      }),
    );

    await new incidentDocModel({
      pg_incident_id: incident1.id,
      body: 'Le nid de poule mesure environ 50cm de large et 15cm de profondeur. Risque de crevaison.',
      photos: [],
      location_hint: 'En face du numéro 12 de la rue principale',
      created_at: new Date(),
      updated_at: new Date(),
      synced_at: new Date(),
    }).save();

    console.log('Incidents seeded.');

    // ==========================================
    // STEP 9: SEED POLLS (MISSING SERVICE - DIRECT INSERT WITH TODO)
    // ==========================================
    console.log('Seeding polls (direct DB inserts)...');
    /*
     * TODO: When a dedicated PollsController and PollsService are implemented,
     * refactor this block to call the business service methods to ensure all
     * business rules, Redis metrics, and events are processed properly.
     */
    const pollRepo = app.get<Repository<Poll>>(getRepositoryToken(Poll));
    const pollOptRepo = app.get<Repository<PollOption>>(getRepositoryToken(PollOption));
    const voteRepo = app.get<Repository<Vote>>(getRepositoryToken(Vote));

    const poll1 = await pollRepo.save(
      pollRepo.create({
        title: 'Choix de la couleur des bancs publics',
        description: 'Quelle couleur préférez-vous pour les nouveaux bancs du parc ?',
        creatorId: uCharlie.id,
        neighbourhoodId: 'nb-downtown',
        pollType: PollTypeEnum.SINGLE,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isAnonymous: false,
      }),
    );

    const optVert = await pollOptRepo.save(pollOptRepo.create({ pollId: poll1.id, label: 'Vert forêt' }));
    const optBleu = await pollOptRepo.save(pollOptRepo.create({ pollId: poll1.id, label: 'Bleu océan' }));
    const optGris = await pollOptRepo.save(pollOptRepo.create({ pollId: poll1.id, label: 'Gris anthracite' }));

    // Alice votes for Vert forêt
    await voteRepo.save(voteRepo.create({ userId: uAlice.id, optionId: optVert.id, weight: 1 }));
    // Bob votes for Bleu océan
    await voteRepo.save(voteRepo.create({ userId: uBob.id, optionId: optBleu.id, weight: 1 }));

    console.log('Polls seeded.');

    // ==========================================
    // STEP 10: SEED MESSAGES (MISSING SERVICE - DIRECT INSERT WITH TODO)
    // ==========================================
    console.log('Seeding chat messages (direct DB inserts)...');
    /*
     * TODO: When a dedicated MessagingController and MessagingService are implemented,
     * refactor this block to call the business service methods to handle encryption (Argon2id / AES),
     * message read receipts, Socket.io presence events, and notification pushes.
     */
    const chatGroupRepo = app.get<Repository<ChatGroup>>(getRepositoryToken(ChatGroup));
    const uigRepo = app.get<Repository<UsersInGroup>>(getRepositoryToken(UsersInGroup));
    const msgMetaRepo = app.get<Repository<MessageMetadata>>(getRepositoryToken(MessageMetadata));
    const msgMongoModel = app.get<Model<any>>(getModelToken(Message.name));

    // Create a group chat for Downtown residents
    const groupChat = await chatGroupRepo.save(
      chatGroupRepo.create({
        name: 'Discussion générale - Downtown',
        description: 'Le canal de discussion principal des résidents de Downtown.',
        createdBy: uCharlie.id,
        type: ChatGroupTypeEnum.GROUP_CHAT,
      }),
    );

    // Add members
    await uigRepo.save([
      uigRepo.create({ userId: uAlice.id, groupId: groupChat.id, roleInGroup: GroupRoleEnum.MESSAGE }),
      uigRepo.create({ userId: uCharlie.id, groupId: groupChat.id, roleInGroup: GroupRoleEnum.ADMIN }),
    ]);

    // Add a chat message
    const msgId = '018fca64-9abc-7def-8901-234567890123'; // valid uuidv7-like format
    await msgMetaRepo.save(
      msgMetaRepo.create({
        id: msgId,
        mongoMessageId: msgId, // same for convenience
        groupId: groupChat.id,
        senderId: uCharlie.id,
        sentAt: new Date(),
        isDeleted: false,
      }),
    );

    await new msgMongoModel({
      pg_message_id: msgId,
      pg_group_id: groupChat.id,
      pg_sender_id: uCharlie.id,
      content_encrypted: 'bW9jay1lbmNyeXB0ZWQtY29udGVudC1mb3Itc2VlZA==', // base64
      iv: '313233343536373839303132',
      auth_tag: '31323334353637383930313233343536',
      type: 'text',
      attachments: [],
      reactions: [],
      sent_at: new Date(),
    }).save();

    console.log('Messages seeded.');

    // ==========================================
    // STEP 11: AWAIT QUEUE DRAINING
    // ==========================================
    console.log('Waiting for BullMQ worker queues to process pending sync and registration jobs...');
    const queueNames = [
      'neo4j-sync',
      'email',
      'pdf-generation',
      'stripe-webhook',
      'waitlist-promote',
      'rgpd-anonymise',
      'crypto-rotation',
      'event-register',
      'contract-expiration',
    ];

    for (const qName of queueNames) {
      try {
        const queue = app.get<Queue>(getQueueToken(qName), { strict: false });
        if (queue) {
          let counts = await queue.getJobCounts('active', 'waiting', 'delayed');
          let total = counts.active + counts.waiting;
          if (total > 0) {
            console.log(`Queue "${qName}" has ${total} pending jobs. Draining...`);
            while (total > 0) {
              await new Promise((r) => setTimeout(r, 1000));
              counts = await queue.getJobCounts('active', 'waiting');
              total = counts.active + counts.waiting;
            }
            console.log(`Queue "${qName}" is fully drained.`);
          }
        }
      } catch (err: any) {
        // queue not loaded/present in module context
      }
    }

    console.log('=== Database Seeding Complete ===');
  } catch (error) {
    console.error('Error during database seeding:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
