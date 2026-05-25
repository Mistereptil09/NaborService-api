export interface UpsertNeighbourhoodDto {
  pgId: string;
  name: string;
  city: string;
  zipCode: string;
  country: string;
  latitude: number;
  longitude: number;
  geometry: string; // GeoJSON string
  areaM2: number;
}

export interface NeighbourhoodWithAdjacencies {
  pgId: string;
  name: string;
  city: string;
  zipCode: string;
  country: string;
  centroid: { latitude: number; longitude: number };
  geometry: string;
  areaM2: number;
  createdAt: Date;
  updatedAt: Date;
  adjacentIds: string[];
}

export interface NearbyNeighbourhood {
  pgId: string;
  name: string;
  city: string;
  distanceMeters: number;
}
