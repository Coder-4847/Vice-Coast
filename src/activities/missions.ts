import type { MissionDef } from '../story/Missions';
import { RACES } from './courses';
import { raceMission } from './Race';
import { JOB_MISSIONS } from './jobs';

/** Every repeatable side activity that runs on the mission engine. */
export const ACT_MISSIONS: MissionDef[] = [...RACES.map(raceMission), ...JOB_MISSIONS];
