import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Poll } from './entities/poll.entity';
import { PollOption } from './entities/poll-option.entity';
import { Vote } from './entities/vote.entity';
import { PollTypeEnum } from '../../common/enums';
import { CreatePollDto } from './dto/create-poll.dto';
import { UpdatePollDto } from './dto/update-poll.dto';

@Injectable()
export class PollsService {
  constructor(
    @InjectRepository(Poll) private readonly pollRepo: Repository<Poll>,
    @InjectRepository(PollOption) private readonly optionRepo: Repository<PollOption>,
    @InjectRepository(Vote) private readonly voteRepo: Repository<Vote>,
  ) {}

  // ── Polls CRUD ──────────────────────────────────────────

  async getActivePolls(neighbourhoodId?: string) {
    const where: any = { deletedAt: IsNull(), closedAt: IsNull() };
    if (neighbourhoodId) where.neighbourhoodId = neighbourhoodId;
    return this.pollRepo.find({
      where,
      order: { createdAt: 'DESC' },
      relations: ['options'],
    });
  }

  async createPoll(creatorId: string, dto: CreatePollDto) {
    const poll = this.pollRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      creatorId,
      neighbourhoodId: dto.neighbourhood_id ?? null,
      pollType: dto.poll_type ?? PollTypeEnum.SINGLE,
      startsAt: dto.starts_at ? new Date(dto.starts_at) : new Date(),
      endsAt: dto.ends_at ? new Date(dto.ends_at) : null,
      isAnonymous: dto.is_anonymous ?? false,
    });
    return this.pollRepo.save(poll);
  }

  async getPoll(pollId: string) {
    const poll = await this.pollRepo.findOne({
      where: { id: pollId, deletedAt: IsNull() },
      relations: ['options'],
    });
    if (!poll) throw new NotFoundException('Sondage introuvable');

    // Snapshot results
    const votes = await this.voteRepo.find({
      where: { option: { pollId } },
      relations: ['option'],
    });
    const results = poll.options.map((opt) => ({
      option_id: opt.id,
      label: opt.label,
      vote_count: votes.filter((v) => v.optionId === opt.id).reduce((s, v) => s + v.weight, 0),
    }));

    return { ...poll, results };
  }

  async updatePoll(pollId: string, userId: string, dto: UpdatePollDto) {
    const poll = await this.getPollOwned(pollId, userId);
    const hasVotes = await this.voteRepo.count({ where: { option: { pollId } } });
    if (hasVotes > 0) throw new ForbiddenException('Impossible de modifier après le premier vote');

    if (dto.title !== undefined) poll.title = dto.title;
    if (dto.description !== undefined) poll.description = dto.description;
    return this.pollRepo.save(poll);
  }

  async softDeletePoll(pollId: string, userId: string) {
    const poll = await this.getPollOwned(pollId, userId);
    poll.deletedAt = new Date();
    return this.pollRepo.save(poll);
  }

  async closePoll(pollId: string, userId: string) {
    const poll = await this.getPollOwned(pollId, userId);
    if (poll.closedAt) throw new ForbiddenException('Sondage déjà clôturé');
    poll.closedAt = new Date();
    poll.closedBy = userId;
    return this.pollRepo.save(poll);
  }

  // ── Options ─────────────────────────────────────────────

  async addOption(pollId: string, userId: string, label: string) {
    const poll = await this.getPollOwned(pollId, userId);
    if (poll.closedAt) throw new ForbiddenException('Sondage clôturé');
    const hasVotes = await this.voteRepo.count({ where: { option: { pollId } } });
    if (hasVotes > 0) throw new ForbiddenException('Impossible d\'ajouter une option après le premier vote');

    const option = this.optionRepo.create({ pollId, label });
    return this.optionRepo.save(option);
  }

  async deleteOption(pollId: string, optionId: string, userId: string) {
    await this.getPollOwned(pollId, userId);
    const option = await this.optionRepo.findOne({ where: { id: optionId, pollId } });
    if (!option) throw new NotFoundException('Option introuvable');
    const hasVotes = await this.voteRepo.count({ where: { optionId } });
    if (hasVotes > 0) throw new ForbiddenException('Impossible de supprimer une option avec des votes');
    return this.optionRepo.remove(option);
  }

  // ── Voting ──────────────────────────────────────────────

  async getMyVote(pollId: string, userId: string) {
    const poll = await this.getPoll(pollId);
    const votes = await this.voteRepo.find({
      where: { userId, option: { pollId } },
      relations: ['option'],
    });
    return { poll_id: pollId, votes };
  }

  async vote(pollId: string, userId: string, optionId: string, weight = 1) {
    const poll = await this.getPoll(pollId);
    if (poll.closedAt) throw new ForbiddenException('Sondage clôturé');
    if (poll.endsAt && poll.endsAt < new Date()) throw new ForbiddenException('Sondage terminé');

    const option = await this.optionRepo.findOne({ where: { id: optionId, pollId } });
    if (!option) throw new NotFoundException('Option introuvable');

    // Check existing votes — for SINGLE polls, remove prior votes
    if (poll.pollType === PollTypeEnum.SINGLE) {
      await this.voteRepo
        .createQueryBuilder()
        .delete()
        .where('user_id = :userId', { userId })
        .andWhere('option_id IN (SELECT o.id FROM poll_options o WHERE o.poll_id = :pollId)', { pollId })
        .execute();
    }

    const existing = await this.voteRepo.findOne({ where: { userId, optionId } });
    if (existing) {
      existing.weight = weight;
      existing.updatedAt = new Date();
      return this.voteRepo.save(existing);
    }

    return this.voteRepo.save(
      this.voteRepo.create({ userId, optionId, weight }),
    );
  }

  async updateVote(pollId: string, userId: string, optionId: string, weight?: number) {
    const vote = await this.voteRepo.findOne({
      where: { userId, optionId },
      relations: ['option'],
    });
    if (!vote || vote.option.pollId !== pollId)
      throw new NotFoundException('Vote introuvable');

    if (weight !== undefined) vote.weight = weight;
    vote.updatedAt = new Date();
    return this.voteRepo.save(vote);
  }

  async deleteVote(pollId: string, userId: string, optionId?: string) {
    const poll = await this.getPoll(pollId);
    if (poll.closedAt) throw new ForbiddenException('Sondage clôturé');

    const qb = this.voteRepo.createQueryBuilder().delete().where('user_id = :userId', { userId });

    if (optionId) {
      // Remove a specific vote (MULTIPLE/WEIGHTED — keep other votes)
      qb.andWhere('option_id = :optionId', { optionId });
    } else {
      // Remove all votes on this poll (SINGLE — or full reset)
      qb.andWhere('option_id IN (SELECT o.id FROM poll_options o WHERE o.poll_id = :pollId)', { pollId });
    }

    await qb.execute();
    return { deleted: true };
  }

  // ── Helpers ─────────────────────────────────────────────

  private async getPollOwned(pollId: string, userId: string): Promise<Poll> {
    const poll = await this.pollRepo.findOne({
      where: { id: pollId, deletedAt: IsNull() },
    });
    if (!poll) throw new NotFoundException('Sondage introuvable');
    if (poll.creatorId !== userId)
      throw new ForbiddenException('Seul le créateur peut modifier ce sondage');
    return poll;
  }
}
