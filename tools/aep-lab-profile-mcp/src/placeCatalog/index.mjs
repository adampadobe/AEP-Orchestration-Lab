/**
 * ESM entry for the shared place catalog. place-catalog.cjs and
 * place-catalog-data.json are byte-identical copies of
 * web/profile-viewer/place-catalog.js and place-catalog-data.json
 * (regenerate with `npm run build:place-catalog`; never edit the copies).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const catalog = require('./place-catalog.cjs');

export const {
  CATALOG_VERSION,
  PLACE_MODES,
  DEFAULT_K,
  DEFAULT_CLUSTER_SIZE,
  FEATURED_AREAS,
  FEATURED_AREA_KEYS,
  globalPlaceCount,
  resolveArea,
  samplePlace,
  planClusteredPlaces,
  seedNeighborhoods,
  nearestNeighborhood,
  distanceKm,
} = catalog;

export default catalog;
