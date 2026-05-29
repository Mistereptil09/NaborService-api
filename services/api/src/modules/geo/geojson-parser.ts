import { BanParseException } from './ban.service';

export interface ParsedFeature {
  latitude: number;
  longitude: number;
  score: number;
  label?: string;
}

export function validateFeatureCollection(raw: any): boolean {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.type !== 'FeatureCollection') return false;
  if (!Array.isArray(raw.features)) return false;
  return true;
}

export function parseFeatureCollection(raw: any): ParsedFeature[] {
  if (!validateFeatureCollection(raw)) {
    const rawString = typeof raw === 'string' ? raw : JSON.stringify(raw);
    throw new BanParseException(
      `Invalid GeoJSON FeatureCollection: ${String(rawString).substring(0, 500)}`
    );
  }

  const features = raw.features as any[];
  const parsedFeatures: ParsedFeature[] = [];

  for (const feature of features) {
    if (!feature || typeof feature !== 'object') continue;
    
    // Check geometry
    const geometry = feature.geometry;
    if (!geometry || geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) {
      continue;
    }

    const [lng, lat] = geometry.coordinates;

    // Validate coordinates are valid finite numbers
    if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      continue;
    }

    // Validate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      continue;
    }

    // Extract properties
    const properties = feature.properties || {};
    const score = typeof properties.score === 'number' ? properties.score : 0;
    const label = typeof properties.label === 'string' ? properties.label : undefined;

    parsedFeatures.push({
      latitude: lat,
      longitude: lng,
      score,
      label,
    });
  }

  // Sort by score descending
  parsedFeatures.sort((a, b) => b.score - a.score);

  return parsedFeatures;
}
