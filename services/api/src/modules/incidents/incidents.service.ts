import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from './entities/incident.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../messaging/notifications.service';
import {
  IncidentSeverityEnum,
  IncidentStatusEnum,
  UserRoleEnum,
} from '../../common/enums';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { ListIncidentsDto } from './dto/list-incidents.dto';

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(userId: string, filters: ListIncidentsDto) {
    let neighbourhoodId = filters.neighbourhood_id;
    if (!neighbourhoodId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      neighbourhoodId = user?.neighbourhoodId ?? undefined;
    }

    const where: any = {};
    if (neighbourhoodId) where.neighbourhoodId = neighbourhoodId;
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;

    const [data, total] = await this.incidentRepository.findAndCount({
      where,
      relations: ['reporter', 'assignee'],
      skip: filters.offset ?? 0,
      take: filters.limit ?? 20,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      meta: { total, offset: filters.offset ?? 0, limit: filters.limit ?? 20 },
    };
  }

  async findOne(id: string) {
    const incident = await this.incidentRepository.findOne({
      where: { id },
      relations: ['reporter', 'assignee'],
    });
    if (!incident) {
      throw new NotFoundException('Incident introuvable');
    }
    return incident;
  }

  async create(userId: string, dto: CreateIncidentDto): Promise<Incident> {
    const incident = this.incidentRepository.create({
      reporterId: userId,
      title: dto.title,
      description: dto.description ?? null,
      neighbourhoodId: dto.neighbourhood_id ?? null,
      severity: dto.severity ?? IncidentSeverityEnum.MEDIUM,
      status: IncidentStatusEnum.OPEN,
    } as Partial<Incident>);
    return this.incidentRepository.save(incident);
  }

  async update(
    incidentId: string,
    userId: string,
    dto: UpdateIncidentDto,
    userRole: UserRoleEnum,
  ): Promise<Incident> {
    const incident = await this.findOne(incidentId);
    this.assertCanEdit(incident, userId, userRole);

    if (dto.title !== undefined) incident.title = dto.title;
    if (dto.description !== undefined) incident.description = dto.description;
    if (dto.severity !== undefined) incident.severity = dto.severity;
    incident.updatedAt = new Date();

    return this.incidentRepository.save(incident);
  }

  async assign(
    incidentId: string,
    moderatorId: string,
    assigneeId?: string,
  ): Promise<Incident> {
    const incident = await this.findOne(incidentId);
    const targetId = assigneeId ?? moderatorId;

    const assignee = await this.userRepository.findOne({
      where: { id: targetId },
    });
    if (!assignee) {
      throw new NotFoundException('Assigné introuvable');
    }

    incident.assignedTo = targetId;
    incident.assignedAt = new Date();
    if (incident.status === IncidentStatusEnum.OPEN) {
      incident.status = IncidentStatusEnum.IN_PROGRESS;
    }
    incident.updatedAt = new Date();

    return this.incidentRepository.save(incident);
  }

  async resolve(incidentId: string): Promise<Incident> {
    const incident = await this.findOne(incidentId);
    incident.status = IncidentStatusEnum.RESOLVED;
    incident.resolvedAt = new Date();
    incident.updatedAt = new Date();
    const saved = await this.incidentRepository.save(incident);

    if (saved.reporterId) {
      try {
        await this.notificationsService.create({
          userId: saved.reporterId,
          type: 'incident_resolved',
          payload: { incidentId: saved.id, title: saved.title },
        });
      } catch (error: any) {
        this.logger.warn(
          `incident_resolved notification failed for ${saved.reporterId}: ${error?.message ?? error}`,
        );
      }
    }

    return saved;
  }

  async delete(
    incidentId: string,
    userId: string,
    userRole: UserRoleEnum,
  ): Promise<void> {
    const incident = await this.findOne(incidentId);

    const isModeratorOrAdmin =
      userRole === UserRoleEnum.MODERATOR || userRole === UserRoleEnum.ADMIN;
    const isReporter = incident.reporterId === userId;

    if (!isReporter && !isModeratorOrAdmin) {
      throw new ForbiddenException(
        'Seul le signalant ou un modérateur peut supprimer cet incident',
      );
    }

    await this.incidentRepository.delete(incidentId);
  }

  private assertCanEdit(
    incident: Incident,
    userId: string,
    userRole: UserRoleEnum,
  ): void {
    const isReporter = incident.reporterId === userId;
    const isAssignee = incident.assignedTo === userId;
    const isModeratorOrAdmin =
      userRole === UserRoleEnum.MODERATOR || userRole === UserRoleEnum.ADMIN;

    if (!isReporter && !isAssignee && !isModeratorOrAdmin) {
      throw new ForbiddenException(
        "Seul le signalant, l'assigné, ou un modérateur peut modifier cet incident",
      );
    }
  }
}
