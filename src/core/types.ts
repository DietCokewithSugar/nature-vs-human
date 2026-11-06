export type EraId = 1 | 2 | 3 | 4;
export const ERA_IDS: readonly EraId[] = [1, 2, 3, 4];

export type CreatureId =
  | 'ant'
  | 'grasshopper'
  | 'wasp'
  | 'beetle'
  | 'mantis'
  | 'crab'
  | 'jellyfish'
  | 'eel'
  | 'octopus'
  | 'shark'
  | 'rat'
  | 'pigeon'
  | 'fox'
  | 'bear'
  | 'elephant'
  | 'raptor'
  | 'pteranodon'
  | 'triceratops'
  | 'brachiosaurus'
  | 'trex';

export type Effect =
  | { type: 'creatureMult'; creature: CreatureId; x: number }
  | { type: 'eraMult'; era: EraId; x: number }
  | { type: 'globalMult'; x: number }
  | { type: 'clickMult'; x: number }
  | { type: 'clickPct'; add: number }
  | { type: 'unlockEra'; era: EraId }
  | { type: 'unlockBreeding' }
  | { type: 'breedMult'; x: number }
  | { type: 'unlockTide' }
  | { type: 'tideAmp'; add: number }
  | { type: 'surgeDuration'; add: number }
  | { type: 'surgeCooldownMult'; x: number }
  | { type: 'ending' };

export type Requirement =
  | { type: 'owned'; creature: CreatureId; n: number }
  | { type: 'era'; era: EraId }
  | { type: 'upgrade'; id: string }
  | { type: 'runEarned'; log10: number }
  | { type: 'notEnded' };

export type UpgradeKind = 'creature' | 'era' | 'global' | 'click' | 'breeding' | 'tide' | 'ending';

export interface UpgradeDef {
  id: string;
  name: string;
  kind: UpgradeKind;
  era: EraId;
  /** Cost as a plain number or a numeric string such as "1e40". */
  cost: number | string;
  effects: Effect[];
  req: Requirement[];
}

export type GeneEffect =
  | { type: 'clickMult'; x: number }
  | { type: 'startMoney'; amount: number }
  | { type: 'autobuy'; era: EraId }
  | { type: 'startQueens'; n: number }
  | { type: 'breedMult'; x: number }
  | { type: 'tideAmp'; add: number }
  | { type: 'autoSurge' }
  | { type: 'ticketDiscount'; x: number }
  | { type: 'genePower'; add: number }
  | { type: 'startEra'; era: EraId }
  | { type: 'globalMult'; x: number };

export interface GeneLevel {
  /** Cost in genes. */
  cost: number;
  effects: GeneEffect[];
}

export interface GeneUpgradeDef {
  id: string;
  name: string;
  levels: GeneLevel[];
  req?: { gene: string; level: number };
}
