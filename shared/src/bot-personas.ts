/**
 * Shared bot persona metadata — used by both server (AI logic) and client (menu UI).
 * The full BotPersona interface with tuning weights lives server-side only.
 */

export interface BotPersonaMeta {
  /** Internal key (matches server persona) */
  id: string;
  /** Display name shown in-game */
  name: string;
  /** Short description for menu UI */
  description: string;
  /** Preferred character index from CHARACTER_DEFS */
  characterIndex: number;
}

export const BOT_PERSONA_METAS: BotPersonaMeta[] = [
  { id: "rusher",    name: "Rusher Rick",     description: "Aggressive melee charger", characterIndex: 4 },
  { id: "sniper",    name: "Sniper Sam",      description: "Long-range precision",     characterIndex: 5 },
  { id: "looter",    name: "Looter Larry",     description: "Prioritizes looting",      characterIndex: 6 },
  { id: "survivor",  name: "Survivor Sue",     description: "Cautious and defensive",   characterIndex: 7 },
  { id: "berserker", name: "Berserker Bob",    description: "All-in melee brawler",     characterIndex: 8 },
];

/** Get persona meta by id */
export function getPersonaMeta(id: string): BotPersonaMeta | undefined {
  return BOT_PERSONA_METAS.find(p => p.id === id);
}
