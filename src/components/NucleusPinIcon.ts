// Nucleus pin coloured by the nucleus's milestone stage (M0–M3), in the
// same palette as the neighbourhood overlay. Same teardrop shape and
// anchor as Leaflet's default pin, so popups open where they used to.
import L from 'leaflet';
import { MILESTONE_COLOR, type MilestoneLevel } from '../lib/milestoneColors';

const cache = new Map<MilestoneLevel, any>();

export function nucleusPinIcon(stage: MilestoneLevel): any {
  let icon = cache.get(stage);
  if (!icon) {
    const color = MILESTONE_COLOR[stage];
    icon = L.divIcon({
      className: 'nucleus-pin',
      html: `
        <svg width="26" height="40" viewBox="0 0 26 40" xmlns="http://www.w3.org/2000/svg"
             style="filter:drop-shadow(0 2px 2px rgba(0,0,0,0.35))">
          <path d="M13 1C6.4 1 1 6.3 1 12.9c0 8.9 12 26.1 12 26.1s12-17.2 12-26.1C25 6.3 19.6 1 13 1z"
                fill="${color}" stroke="#ffffff" stroke-width="2"/>
          <circle cx="13" cy="13" r="4.5" fill="#ffffff"/>
        </svg>`,
      iconSize: [26, 40],
      iconAnchor: [13, 39],
      popupAnchor: [0, -34],
    });
    cache.set(stage, icon);
  }
  return icon;
}
