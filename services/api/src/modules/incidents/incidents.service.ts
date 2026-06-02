import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from './entities/incident.entity';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
  ) {}

  // --- CRUD basique ---

  async findAll() {
    return this.incidentRepository.find();
  }

  async findOne(id: string) {
    return this.incidentRepository.findOne({ where: { id } });
  }
}
