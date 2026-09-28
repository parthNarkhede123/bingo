// Client-side display constants for Ironhold. These MIRROR the balance data in
// backend/src/game/constants.js for labels/colors only — the server remains the
// sole authority on game logic. Keep this small and purely presentational.

export const MATERIALS = [
  'ironwood', 'skysteel', 'saltpeter', 'emberglass', 'frosthide',
  'sungrain', 'shadowsilk', 'stormsalt', 'bloodstone', 'moonclay',
];

// A stable color per material so the map and inventories read at a glance.
export const MATERIAL_COLOR = {
  ironwood: '#b5844e', skysteel: '#5aa9e6', saltpeter: '#cfd8dc', emberglass: '#ff7043',
  frosthide: '#8fd3ff', sungrain: '#ffd166', shadowsilk: '#9a7bd6', stormsalt: '#4dd0c4',
  bloodstone: '#e5484d', moonclay: '#c9b6ff',
};

export const materialColor = (m) => MATERIAL_COLOR[m] || '#9aa0c0';

// Stances (attack / defence / farming / moving) with friendly labels + icons.
export const STANCES = ['assault', 'bulwark', 'harvest', 'march'];
export const STANCE_META = {
  assault: { label: 'Assault', icon: '⚔️', blurb: 'Attack power' },
  bulwark: { label: 'Bulwark', icon: '🛡️', blurb: 'Home defence' },
  harvest: { label: 'Harvest', icon: '🌾', blurb: 'Faster gathering' },
  march: { label: 'March', icon: '🐎', blurb: 'Faster travel' },
};

export const TIERS = ['wood', 'iron', 'gold', 'royal'];
export const TIER_COLOR = { wood: '#b5844e', iron: '#c0c6d4', gold: '#ffd166', royal: '#c9b6ff' };
export const TIER_POWER = { wood: 0.03, iron: 0.07, gold: 0.14, royal: 0.25 };

export const CHEST_GRADES = ['wood', 'iron', 'gold', 'royal'];

export const SKILL_META = {
  assault: { label: 'Assault', max: 5, blurb: '+4% attack / rank' },
  bulwark: { label: 'Bulwark', max: 5, blurb: '+4% defence / rank' },
  harvest: { label: 'Harvest', max: 5, blurb: '+5% gather rate / rank' },
  march: { label: 'March', max: 5, blurb: '-5% travel time / rank' },
  gemfind: { label: 'Gemfind', max: 3, blurb: '+10% ad gems / rank' },
  chestluck: { label: 'Chest Luck', max: 3, blurb: 'Better chest tiers' },
};

export const COMMANDERS = {
  durgan: {
    name: 'Durgan Stonesworn', cost: 60, icon: '⛏️',
    blurb: 'Dwarf warlord. Auto-manages your stance by the situation (attack / defend / march / harvest).',
  },
  wren: {
    name: 'Wren Nightglass', cost: 40, icon: '🔭',
    blurb: 'Master scout. Reveals a rival Hold\'s troops, stance and defences. 5 charges per recruit.',
  },
};

export const AD_REWARD_GEMS = 5;

// Conquest Points per source (for the "how you score" help text).
export const CP = { winBattle: 25, defend: 15, quest: 15, trade: 5, upgrade: 30, mine: 10, levelUp: 10 };

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
