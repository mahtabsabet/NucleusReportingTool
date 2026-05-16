// Small, neutral household marker — visually distinct from the
// colourful engagement-bucket nucleus pins so it's clear the LSA
// view is a different layer. Square-ish chip, single muted tone.
import L from 'leaflet';

export const householdMarkerIcon = L.divIcon({
  className: 'lsa-household-marker',
  html: `
    <span style="
      display:inline-block;
      width:14px;height:14px;
      background:#475569;
      border:2px solid #ffffff;
      border-radius:3px;
      box-shadow:0 1px 3px rgba(0,0,0,0.35);
    "></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export const householdMarkerArchivedIcon = L.divIcon({
  className: 'lsa-household-marker-archived',
  html: `
    <span style="
      display:inline-block;
      width:14px;height:14px;
      background:#cbd5e1;
      border:2px solid #ffffff;
      border-radius:3px;
      box-shadow:0 1px 2px rgba(0,0,0,0.2);
      opacity:0.7;
    "></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
