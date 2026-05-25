export interface UpsertUserDto {
  pgId: string;
  neighbourhoodId?: string;
  visibility: 'public' | 'friends' | 'private';
  role: 'resident' | 'neighbourhood_rep' | 'moderator' | 'admin';
}

export interface UpsertListingDto {
  pgId: string;
  listingType: 'offer' | 'request';
  status: string;
  neighbourhoodId?: string;
  createdAt: Date;
}

export interface UpsertEventDto {
  pgId: string;
  status: string;
  neighbourhoodId?: string;
  startsAt: Date;
  costCents: number;
}

export interface UpsertCategoryDto {
  pgId: number;
  name: string;
  domain: 'listing' | 'event';
}
