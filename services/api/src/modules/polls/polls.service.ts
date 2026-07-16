import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isModeratorOrAdmin } from '../../common/ownership';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Poll } from './entities/poll.entity';
import { PollOption } from './entities/poll-option.entity';
import { Vote } from './entities/vote.entity';
import { PollTypeEnum } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { CreatePollDto } from './dto/create-poll.dto';
import { UpdatePollDto } from './dto/update-poll.dto';

@Injectable()
export class PollsService {
  constructor(
    @InjectRepository(Poll) private readonly pollRepo: Repository<Poll>,
    @InjectRepository(PollOption) private readonly optionRepo: Repository<PollOption>,
    @InjectRepository(Vote) private readonly voteRepo: Repository<Vote>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // ── Polls CRUD ──────────────────────────────────────────

  /**
   * Liste les sondages visibles d'un groupe / quartier. Seuls les sondages
   * supprimés sont masqués — les sondages clôturés (closedAt) restent affichés
   * en lecture seule (résultats figés, statut "clôturé" côté client), au lieu
   * de disparaître du fil dès la clôture.
   */
  async listPolls(neighbourhoodId?: string, groupId?: string) {
    const where: any = { deletedAt: IsNull() };
    if (groupId) where.groupId = groupId;
    else if (neighbourhoodId) where.neighbourhoodId = neighbourhoodId;
    const polls = await this.pollRepo.find({
      where,
      order: { createdAt: 'DESC' },
      relations: ['options'],
    });
    return this.attachResults(polls);
  }

  async createPoll(creatorId: string, dto: CreatePollDto) {
    const poll = this.pollRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      creatorId,
      // group_id est prioritaire : un sondage est rattaché à un groupe OU à un
      // quartier, jamais aux deux.
      groupId: dto.group_id ?? null,
      neighbourhoodId: dto.group_id ? null : (dto.neighbourhood_id ?? null),
      pollType: dto.poll_type ?? PollTypeEnum.SINGLE,
      startsAt: dto.starts_at ? new Date(dto.starts_at) : new Date(),
      endsAt: dto.ends_at ? new Date(dto.ends_at) : null,
      isAnonymous: dto.is_anonymous ?? false,
      isWeighted: dto.is_weighted ?? false,
    });
    return this.pollRepo.save(poll);
  }

  async getPoll(pollId: string) {
    const poll = await this.pollRepo.findOne({
      where: { id: pollId, deletedAt: IsNull() },
      relations: ['options', 'creator', 'closedByUser'],
    });
    if (!poll) throw new NotFoundException('Sondage introuvable');

    const [withResults] = await this.attachResults([poll]);
    // attachResults étale l'entité (`...poll`), donc `creator`/`closedByUser`
    // (relations User complètes) fuiteraient — on les retire et on ne renvoie
    // que des DTO d'identité (qui a créé / qui a clôturé le sondage).
    const { creator, closedByUser, ...rest } = withResults as typeof withResults & {
      creator?: User | null;
      closedByUser?: User | null;
    };
    const slim = (u?: User | null) =>
      u ? { id: u.id, first_name: u.firstName, last_name: u.lastName } : null;
    return {
      ...rest,
      creator: slim(poll.creator),
      closed_by_user: slim(poll.closedByUser),
    };
  }

  async updatePoll(pollId: string, userId: string, dto: UpdatePollDto, userRole?: string) {
    const poll = await this.getPollOwned(pollId, userId, userRole);
    const hasVotes = await this.voteRepo.count({ where: { option: { pollId } } });
    if (hasVotes > 0) throw new ForbiddenException('Impossible de modifier après le premier vote');

    if (dto.title !== undefined) poll.title = dto.title;
    if (dto.description !== undefined) poll.description = dto.description;
    return this.pollRepo.save(poll);
  }

  async softDeletePoll(pollId: string, userId: string, userRole?: string) {
    const poll = await this.getPollOwned(pollId, userId, userRole);
    poll.deletedAt = new Date();
    return this.pollRepo.save(poll);
  }

  async closePoll(pollId: string, userId: string, userRole?: string) {
    const poll = await this.getPollOwned(pollId, userId, userRole);
    if (poll.closedAt) throw new ForbiddenException('Sondage déjà clôturé');
    poll.closedAt = new Date();
    poll.closedBy = userId;
    return this.pollRepo.save(poll);
  }

  // ── Options ─────────────────────────────────────────────

  async addOption(pollId: string, userId: string, label: string, userRole?: string, weight?: number) {
    const poll = await this.getPollOwned(pollId, userId, userRole);
    if (poll.closedAt) throw new ForbiddenException('Sondage clôturé');
    const hasVotes = await this.voteRepo.count({ where: { option: { pollId } } });
    if (hasVotes > 0) throw new ForbiddenException('Impossible d\'ajouter une option après le premier vote');

    const option = this.optionRepo.create({ pollId, label, weight: weight ?? 1 });
    return this.optionRepo.save(option);
  }

  async deleteOption(pollId: string, optionId: string, userId: string, userRole?: string) {
    await this.getPollOwned(pollId, userId, userRole);
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

  async vote(pollId: string, userId: string, optionId: string) {
    const poll = await this.getPoll(pollId);
    if (poll.closedAt) throw new ForbiddenException('Sondage clôturé');
    if (poll.endsAt && poll.endsAt < new Date()) throw new ForbiddenException('Sondage terminé');

    const option = await this.optionRepo.findOne({ where: { id: optionId, pollId } });
    if (!option) throw new NotFoundException('Option introuvable');

    // SINGLE et WEIGHTED sont à choix unique : on retire tout vote antérieur
    // de cet utilisateur sur ce sondage avant d'enregistrer le nouveau.
    if (poll.pollType === PollTypeEnum.SINGLE || poll.pollType === PollTypeEnum.WEIGHTED) {
      const priorVotes = await this.voteRepo.find({
        where: { userId, option: { pollId } },
      });
      if (priorVotes.length > 0) {
        await this.voteRepo.remove(priorVotes);
      }
    }

    // Le poids du vote provient toujours de l'option (fixé par le créateur du
    // sondage), jamais du votant.
    const existing = await this.voteRepo.findOne({ where: { userId, optionId } });
    if (existing) {
      existing.weight = option.weight;
      existing.updatedAt = new Date();
      return this.voteRepo.save(existing);
    }

    return this.voteRepo.save(
      this.voteRepo.create({ userId, optionId, weight: option.weight }),
    );
  }

  async updateVote(pollId: string, userId: string, optionId: string) {
    const vote = await this.voteRepo.findOne({
      where: { userId, optionId },
      relations: ['option'],
    });
    if (!vote || vote.option.pollId !== pollId)
      throw new NotFoundException('Vote introuvable');

    vote.weight = vote.option.weight;
    vote.updatedAt = new Date();
    return this.voteRepo.save(vote);
  }

  async deleteVote(pollId: string, userId: string, optionId?: string) {
    const poll = await this.getPoll(pollId);
    if (poll.closedAt) throw new ForbiddenException('Sondage clôturé');

    if (optionId) {
      // Remove a specific vote
      const vote = await this.voteRepo.findOne({ where: { userId, optionId } });
      if (vote) await this.voteRepo.remove(vote);
    } else {
      // Remove all votes on this poll
      const votes = await this.voteRepo.find({
        where: { userId, option: { pollId } },
      });
      if (votes.length > 0) {
        await this.voteRepo.remove(votes);
      }
    }

    return { deleted: true };
  }

  // ── Helpers ─────────────────────────────────────────────

  /**
   * Calcule les résultats agrégés (et, pour les sondages non anonymes, les
   * votants par option) pour un lot de sondages — 2 requêtes au total quel
   * que soit le nombre de sondages, pas une par sondage (utilisé par
   * `listPolls` ET `getPoll`, pour ne jamais avoir la liste sans résultats).
   */
  private async attachResults(polls: Poll[]) {
    if (polls.length === 0) return [];
    const pollIds = polls.map((p) => p.id);
    const votes = await this.voteRepo.find({
      where: { option: { pollId: In(pollIds) } },
      relations: ['option'],
    });

    const anonymousPollIds = new Set(polls.filter((p) => p.isAnonymous).map((p) => p.id));
    const voterUserIds = [
      ...new Set(
        votes
          .filter((v) => !anonymousPollIds.has(v.option.pollId))
          .map((v) => v.userId),
      ),
    ];
    const voters = voterUserIds.length
      ? await this.userRepo.find({ where: { id: In(voterUserIds) } })
      : [];
    const votersMap = new Map(voters.map((u) => [u.id, u]));

    return polls.map((poll) => {
      const pollVotes = votes.filter((v) => v.option.pollId === poll.id);
      const includeVoters = !poll.isAnonymous && pollVotes.length > 0;
      const results = poll.options.map((opt) => {
        const optionVotes = pollVotes.filter((v) => v.optionId === opt.id);
        return {
          option_id: opt.id,
          label: opt.label,
          vote_count: optionVotes.reduce((s, v) => s + v.weight, 0),
          ...(includeVoters && {
            voters: optionVotes
              .map((v) => votersMap.get(v.userId))
              .filter((u): u is User => !!u)
              .map((u) => ({
                id: u.id,
                first_name: u.firstName,
                last_name: u.lastName,
                profile_picture_mongo_id: u.profilePictureMongoId,
              })),
          }),
        };
      });
      return { ...poll, results };
    });
  }

  private async getPollOwned(pollId: string, userId: string, userRole?: string): Promise<Poll> {
    const poll = await this.pollRepo.findOne({
      where: { id: pollId, deletedAt: IsNull() },
    });
    if (!poll) throw new NotFoundException('Sondage introuvable');
    if (poll.creatorId !== userId && !isModeratorOrAdmin(userRole))
      throw new ForbiddenException('Seul le créateur peut modifier ce sondage');
    return poll;
  }
}
