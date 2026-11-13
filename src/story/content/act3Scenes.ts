import { CHARS } from '../chars';
import type { ActorDef, CutsceneDef, Line, Shot } from '../types';

const lk = (id: string): ActorDef['look'] => (id in CHARS ? { char: id as 'mack' } : { cast: id });
const A = (id: string, at: [number, number], face?: number | string, aim = false): ActorDef => ({ id, look: lk(id), at, face, aim });
const L = (who: string, text: string): Line => ({ who, text });
const wide = (lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [0.4, 1.9, -7], to: [-0.2, 1.75, -5.6], look: [0, 1.4, 0], fov: 48, lines, ...o });
const close = (x: number, lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [x * 0.45 + 0.7, 1.62, -2.6], to: [x * 0.45 + 0.55, 1.64, -2.2], look: [x, 1.6, 0], fov: 32, lines, ...o });
const low = (lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [1.2, 0.5, -4.4], to: [0.6, 0.7, -3.6], look: [0, 1.6, 0], fov: 46, lines, ...o });
const crew = (): ActorDef[] => [A('mack', [-2, 0], 'pruitt'), A('imani', [0, 0.2], 'pruitt'), A('teddy', [2, 0], 'pruitt'), A('pruitt', [0, 3.5], 'imani')];

/** Act III, "The Fall": the key scenes, the yacht heist and the three endings. */
export const ACT3_SCENES: Record<string, CutsceneDef> = {
  m28_rally: {
    id: 'm28_rally', anchor: 'tower.top', heading: 180, hour: 11,
    actors: [A('crane', [0, 0], 'brandt'), A('brandt', [1.8, 0.6], 'crane'), A('mack', [-6, -4], 'crane')],
    shots: [
      wide([L('crane', 'Friends. Neighbours. People who have worked here since before the glass went up. I am asking for your vote, and a little of your patience.'), L('brandt', 'Four points ahead after the broadcast, sir. The harbor story is already fading.')]),
      { from: [-9, 1.7, -7], to: [-8, 1.7, -6.2], look: [0, 1.6, 4], fov: 30, lines: [L('mack', 'Crane just smiled at a camera and told them to be patient.'), L('pruitt', 'Follow his car. I want to know where he goes when the cameras stop.')] },
    ],
  },
  m29_tomas: {
    id: 'm29_tomas', anchor: 'stash', heading: 0, hour: 18,
    actors: [A('imani', [-1.2, 0], 'tomas'), A('tomas', [1.2, 0.2], 'imani')],
    shots: [
      wide([L('tomas', 'My father kept the real books here. Not the ledgers Crane gave us: the ones with names, dates and who owed what.'), L('imani', 'Crane paid your family for forty years.')]),
      close(1.2, [L('tomas', 'Which means he has men watching. If we are going in, we go in fast.')]),
    ],
  },
  m30_dex: {
    id: 'm30_dex', anchor: 'depot', heading: 90, hour: 22,
    actors: [A('teddy', [-1.2, 0], 'dex'), A('dex', [1.2, 0.2], 'teddy')],
    shots: [
      wide([L('dex', 'Meridian\'s harbor tankers fill up here every night. If they stop moving, Crane\'s fleet stops moving.'), L('teddy', 'You are saying I should hit them.'), L('dex', 'I am saying a lot of them. Quickly.')]),
    ],
  },
  m33_debate: {
    id: 'm33_debate', anchor: 'newsroom', heading: 180, hour: 20,
    actors: [A('crane', [0, 0], 'marisol'), A('marisol', [3, 0.4], 'crane'), A('mack', [-4, -3], 'crane')],
    shots: [
      wide([L('marisol', 'Mr. Crane, the Valeria Savings ledger lists thirty-one payments to the Harbor Task Force. Can you explain them?'), L('crane', 'The ledger is a forgery and I am delighted to say so on live television.')]),
      close(0, [L('crane', 'A forgery produced by a person who, I am told, has a criminal driver in her... pocket.'), L('mack', 'That is the wrong thing to say on an open mic, Mr. Crane.')]),
    ],
  },
  m34_lola: {
    id: 'm34_lola', anchor: 'costa.cafe', heading: 0, hour: 22.5,
    actors: [A('lola', [-1.2, 0], 'mack'), A('mack', [1.2, 0.3], 'lola')],
    shots: [
      wide([L('lola', 'Dad, you came. To a night market. In Costa Merida. With actual people.'), L('mack', 'I am wearing a very nice shirt for this.')]),
      { from: [3, 1.6, -3], to: [2, 1.6, -2.2], look: [-1.2, 1.6, 0], fov: 38, lines: [L('lola', 'Dad, those men are staring at me.'), L('mack', 'Lola. Behind me. Now.')] },
    ],
  },
  m34_after: {
    id: 'm34_after', anchor: 'redline.yard', heading: 180, hour: 1,
    actors: [A('lola', [-1.2, 0], 'mack'), A('mack', [1.2, 0.3], 'lola'), A('carmen', [3, 1], 'mack')],
    shots: [
      wide([L('carmen', 'Marcus. Look at her. Look at what you did.'), L('lola', 'Mom. He is the reason I am here.')]),
      close(1.2, [L('mack', 'I will finish it. Whatever it takes. I promise.'), L('lola', 'Not whatever it takes. Just finish it.')]),
    ],
  },
  m35_crown: {
    id: 'm35_crown', anchor: 'tower.top', heading: 180, hour: 4,
    actors: crew(),
    shots: [
      wide([L('pruitt', 'The Crown. Crane\'s tower, his offices, his private lift to the harbor. Everything he built is in this building.'), L('imani', 'And everything he still has is guarding it.')]),
      close(2, [L('teddy', 'Three of us, one tower. I like the odds.'), L('mack', 'You like every odds, Teddy.')]),
    ],
  },
  m36_crane: {
    id: 'm36_crane', anchor: 'harbor', heading: 90, hour: 5.5,
    actors: [A('crane', [0, 0], 'brandt'), A('brandt', [1.8, 0.6], 'crane')],
    shots: [
      wide([L('brandt', 'Sir, the tower is lost. They are four floors from the lift.'), L('crane', 'Then we leave. The Aurelia has fuel for eleven days and a crew that is paid not to ask.')]),
      low([L('crane', 'I built that tower out of other people\'s patience, Ines. I can build another out of theirs.'), L('brandt', 'Yes, sir. Of course.')]),
    ],
  },
  h6_board: {
    id: 'h6_board', anchor: 'home.mack', heading: -90,
    actors: crew(),
    shots: [
      wide([L('pruitt', 'The Aurelia is at the Dusk Harbor moorings until the tide turns. A vault in the stern, ten guards, and every ledger Crane has not burned yet.'), L('mack', 'We take the ledgers and the money.'), L('imani', 'Then Crane has nowhere to run.')], { look: [0, 1.4, 2] }),
    ],
  },
  h6_done: {
    id: 'h6_done', anchor: 'home.mack', heading: -90,
    actors: crew(),
    shots: [
      wide([L('pruitt', 'The ledgers are the last piece. Brandt has already called a lawyer. It is going to be a very short week.'), L('teddy', 'So what do we do now?'), L('mack', 'We decide what we are going to be afterwards.')], { look: [0, 1.4, 2] }),
    ],
  },
  h7_board: {
    id: 'h7_board', anchor: 'home.mack', heading: -90,
    actors: crew(),
    shots: [
      wide([L('pruitt', 'Pinecrest Savings & Loan. The payroll for every logging camp on the mountain sits in one small vault on a Friday morning.'), L('teddy', 'A small-town bank. What could go wrong?'), L('imani', 'Small town, one road out, and the state troopers own that road.')], { look: [0, 1.4, 2] }),
    ],
  },
  h7_done: {
    id: 'h7_done', anchor: 'home.mack', heading: -90,
    actors: crew(),
    shots: [
      wide([L('mack', 'Every trooper in the county came up that road.'), L('teddy', 'And every one of them went home with a story.'), L('pruitt', 'Pinecrest will remember you. Try to make sure nobody else does.')], { look: [0, 1.4, 2] }),
    ],
  },
  h8_board: {
    id: 'h8_board', anchor: 'home.mack', heading: -90,
    actors: crew(),
    shots: [
      wide([L('pruitt', 'Fort Halloran. Under the armory there is a bunker, and in the bunker is the gold the army seized from the Ortega cartel. Two hundred million, waiting on a judge.'), L('mack', 'You want us to rob the army.'), L('pruitt', 'I want you to rob a filing cabinet that happens to be guarded by the army.')], { look: [0, 1.4, 2] }),
    ],
  },
  h8_done: {
    id: 'h8_done', anchor: 'home.mack', heading: -90,
    actors: crew(),
    shots: [
      wide([L('imani', 'We robbed a military base. Out loud. With our faces.'), L('teddy', 'Masks. We had masks.'), L('pruitt', 'Somewhere a general is writing a very long report. Spend slowly.')], { look: [0, 1.4, 2] }),
    ],
  },
  m38_choice: {
    id: 'm38_choice', anchor: 'home.mack', heading: -90, hour: 21,
    actors: crew(),
    shots: [
      wide([L('pruitt', 'The warrants are signed. Crane is in custody, Brandt is on the run, and the ledgers are in the hands of someone I trust. It is over.'), L('mack', 'It is never over. It is only a choice.')]),
      close(-2, [L('mack', 'I could take the ledgers to the court myself. Tell it all. Keep my family.')], { look: [-2, 1.6, 0] }),
      close(0, [L('imani', 'Or I take the money, the airstrip and a plane, and I stop being a name in anybody\'s file.')], { look: [0, 1.6, 0.2] }),
      close(2, [L('teddy', 'Or somebody jumps something so big they put it on a poster.')], { look: [2, 1.6, 0] }),
    ],
  },
  m38_end1: {
    id: 'm38_end1', anchor: 'court', heading: 180, hour: 10,
    actors: [A('mack', [-1, 0], 'pruitt'), A('pruitt', [1, 0.2], 'mack'), A('carmen', [3.4, 1.4], 'mack'), A('lola', [4.4, 1.6], 'mack')],
    shots: [
      wide([L('pruitt', 'Marcus. You do not have to do this. I could make it all go away.'), L('mack', 'I know. That is exactly why I am doing it.')]),
      close(3.4, [L('carmen', 'Whatever they give you, we will be in the third row.'), L('lola', 'Dad. I put your name on a set list. The first track is "Valet".')]),
      low([L('mack', 'I spent twenty years driving away from things. This is the first time I have driven toward one. Clean Slate.')]),
    ],
  },
  m38_end2: {
    id: 'm38_end2', anchor: 'island.strip', heading: -90, hour: 7,
    actors: [A('imani', [0, 0], 'pilar'), A('pilar', [2.2, 0.4], 'imani')],
    shots: [
      wide([L('pilar', 'The strip, the hangar and a hundred and fifty thousand litres of fuel. Everything on paper says it is yours.'), L('imani', 'And Pilar? Thank you. For everything.')]),
      { from: [0, 2.2, -8], to: [0, 3.6, -14], look: [0, 1.5, 4], fov: 50, lines: [L('imani', 'Funny. The sky has never asked me what I did. Clear Skies.')] },
    ],
  },
  m38_end3: {
    id: 'm38_end3', anchor: 'ramp', heading: 90, hour: 17,
    actors: [A('teddy', [0, 0], 'dex'), A('dex', [2, 0.3], 'teddy'), A('mamajo', [3.6, 1], 'teddy')],
    shots: [
      wide([L('dex', 'Forty million viewers. Teddy, the sky is full of drones. There is a helicopter. There is a second helicopter.'), L('mamajo', 'And a blessing. I have blessed the car. Do not die.')]),
      low([L('teddy', 'Dex. If this goes wrong, tell the story right. If it goes right, do not let me do another. Big Finish.')]),
    ],
  },
  m38_credits: {
    id: 'm38_credits', anchor: 'home.mack', heading: -90, hour: 19,
    actors: [A('mack', [-2, 0], 'imani'), A('imani', [0, 0.2], 'teddy'), A('teddy', [2, 0], 'mack')],
    shots: [
      wide([L('mack', 'That is San Verano. The city keeps going. It always does.'), L('imani', 'It does not need us.'), L('teddy', 'It does not need anyone. That is why it is beautiful.')]),
      { from: [0, 3.6, -9], to: [0, 6.5, -14], look: [0, 1.5, 4], fov: 52, lines: [L('mack', 'Thank you for playing. The whole city is yours now: every job, every road. Go and find what is left.')] },
    ],
  },
};
