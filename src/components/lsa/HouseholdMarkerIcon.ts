// Household marker — distinct from the round engagement-coloured
// nucleus pins. Warm terracotta tone signals "household / place"
// and reads clearly on the carto-light basemap without competing
// with the community-building palette.
import L from 'leaflet';

// Warm terracotta — tailwind amber-800 / orange-800 region.
const HOUSEHOLD_COLOR = '#9a3412';
const HOUSEHOLD_ARCHIVED = '#d6d3d1';

export const householdMarkerIcon = L.divIcon({
  className: 'lsa-household-marker',
  html: `
    <span style="
      display:inline-block;
      width:16px;height:16px;
      background:${HOUSEHOLD_COLOR};
      border:2px solid #ffffff;
      border-radius:3px;
      box-shadow:0 1px 3px rgba(122,46,12,0.45);
    "></span>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

export const householdMarkerArchivedIcon = L.divIcon({
  className: 'lsa-household-marker-archived',
  html: `
    <span style="
      display:inline-block;
      width:14px;height:14px;
      background:${HOUSEHOLD_ARCHIVED};
      border:2px solid #ffffff;
      border-radius:3px;
      box-shadow:0 1px 2px rgba(0,0,0,0.2);
      opacity:0.75;
    "></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
