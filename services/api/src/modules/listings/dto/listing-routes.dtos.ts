import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class ListListingsDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset: number = 0;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsString()
  neighbourhood?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  category?: number;

  @IsOptional()
  @IsIn(['offer', 'request'])
  type?: string;

  @IsOptional()
  @IsIn(['open', 'pending', 'in_progress', 'closed', 'cancelled'])
  status?: string;
}

export class CreateListingDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsIn(['offer', 'request'])
  listing_type: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  category_id?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  price_cents?: number;

  @IsOptional()
  @IsString()
  neighbourhood_id?: string;
}

export class UpdateListingDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  category_id?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  price_cents?: number;

  @IsOptional()
  @IsString()
  neighbourhood_id?: string;
}

export class UpdateContentDto {
  @IsOptional()
  @IsString()
  body_html?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class CancelListingDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ReportListingDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ModerateListingDto {
  @IsIn(['cancelled', 'warned', 'restored'])
  action: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class SignDocumentDto {
  @IsString()
  @IsNotEmpty()
  canvas_b64: string;

  @IsString()
  @Length(6, 6)
  totp_code: string;
}
