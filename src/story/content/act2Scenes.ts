import { CHARS } from '../chars';
import type { ActorDef, CutsceneDef, Line, Shot } from '../types';

const lk = (id: string): ActorDef['look'] => (id in CHARS ? { char: id as 'mack' } : { cast: id });
const A = (id: string, at: [number, number], face?: number | string, aim = false): ActorDef => ({ id, look: lk(id), at, face, aim });
const L = (who: string, text: string): Line => ({ who, text });
const wide = (lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [0.4, 1.9, -7], to: [-0.2, 1.75, -5.6], look: [0, 1.4, 0], fov: 48, lines, ...o });
const close = (x: number, lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [x * 0.45 + 0.7, 1.62, -2.6], to: [x * 0.45 + 0.55, 1.64, -2.2], look: [x, 1.6, 0], fov: 32, lines, ...o });
const low = (lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [1.2, 0.5, -4.4], to: [0.6, 0.7, -3.6], look: [0, 1.6, 0], fov: 46, lines, ...o });

/** Act II, "Crown of Glass": the key scenes. The rest of each mission is subtitled dialogue. */
export const ACT2_SCENES: Record<string, CutsceneDef> = {
  m13_brandt: {
    id: 'm13_brandt', anchor: 'redline.yard', heading: 180, hour: 16.5,
    actors: [A('benny', [-1.6, 0], 'brandt'), A('brandt', [1.2, 1.5], 'benny'), A('guard', [3.2, 2.5], 'mack'), A('guard2', [-3.4, 2.6], 'mack'), A('mack', [0, -4], 'brandt')],
    shots: [
      wide([L('brandt', 'Benjamin. A very nice shop. It would be a shame if it turned out to be built on seized land.'), L('benny', 'I have the deed. I have had the deed since 1998.')]),
      close(1.2, [L('brandt', 'Deeds are just paper. Law is what I say on a given Tuesday. Which is why I want a word with your friend Mr. Delgado.')], { look: [1.2, 1.6, 1.5] }),
      low([L('mack', 'Captain. You could have phoned.'), L('brandt', 'Someone cleaned out Calloway & Daughters last week. Every instinct I have says a driver was involved. Where is my evidence van, Marcus?')]),
      wide([L('mack', 'I parked cars at a party. That is my entire career.'), L('brandt', 'Then you will not mind a search. Boys. Take the shop apart.'), L('benny', 'Marcus. Run.')], { from: [-4, 2.2, -6], to: [-3, 2, -5] }),
    ],
  },
  m14_dinner: {
    id: 'm14_dinner', anchor: 'home.mack', heading: -90, hour: 19.5,
    actors: [A('mack', [-1.5, 0], 'carmen'), A('carmen', [0.4, 0.3], 'mack'), A('lola', [2.2, 0], 'mack')],
    shots: [
      wide([L('carmen', 'You cooked. You never cook. What did you do?'), L('mack', 'Nothing. I swear. I just wanted a dinner.')]),
      close(2.2, [L('lola', 'Dad. I got a slot at the Costa Merida night market. Real decks. Real crowd.'), L('mack', 'That is wonderful, mija. That is, uh, a long way from here.')]),
      close(0.4, [L('carmen', 'He thinks everything is a long way from here. He has been three streets away for twenty years.'), L('mack', 'I am trying, Carmen.')]),
      { from: [3, 1.6, -3], to: [2, 1.6, -2.4], look: [0, 1.6, 8], fov: 40, lines: [L('lola', 'Why are there men outside with guns?'), L('mack', 'Get down. Both of you. Get down, now.')] },
    ],
  },
  m14_safe: {
    id: 'm14_safe', anchor: 'redline.yard', heading: 180, hour: 21,
    actors: [A('mack', [-1, 0], 'carmen'), A('carmen', [1, 0.4], 'mack'), A('lola', [2.4, 0.6], 'mack'), A('benny', [-3, 1], 'mack')],
    shots: [
      wide([L('benny', 'Upstairs there is a bed, and a kettle, and a lock the Task Force has not broken yet.'), L('carmen', 'Marcus. Look at me. Who were they?')]),
      close(-1, [L('mack', 'People I told you I had stopped working for.'), L('carmen', 'You did not stop. You stopped telling me.')]),
      close(2.4, [L('lola', 'I am not scared, Dad. I am angry. Fix it.')]),
    ],
  },
  m15_silas: {
    id: 'm15_silas', anchor: 'marlowe', heading: 90, hour: 14,
    actors: [A('mack', [-1.2, 0], 'silas'), A('silas', [1.2, 0.2], 'mack')],
    shots: [
      wide([L('silas', 'You must be the driver. Pruitt says you are the only person he knows who has never been caught on a camera.'), L('mack', 'I have been caught plenty. Just by people who did not matter.')]),
      close(1.2, [L('silas', 'Task Force keeps its case files on a server in the depot. I can get in. I cannot get in from here. I need a body, a cable and about ten quiet seconds.'), L('mack', 'I can supply the body.')]),
      low([L('silas', 'Also, I do not carry a gun. If that is a problem, say so now.'), L('mack', 'It is not a problem. It is the first sensible thing anyone has said to me all week.')]),
    ],
  },
  m16_marisol: {
    id: 'm16_marisol', anchor: 'newsroom', heading: 180, hour: 11,
    actors: [A('imani', [-1.2, 0], 'marisol'), A('marisol', [1.2, 0.2], 'imani'), A('pilar', [3.5, 2.5], 'imani')],
    shots: [
      wide([L('marisol', 'The ledgers prove the money. They do not prove the man. I need Crane on his own island, with the people paying him, in a photograph.'), L('imani', 'You want me to fly a journalist to a private villa.')]),
      close(1.2, [L('marisol', 'I want you to fly yourself. I will have the camera. You will have the nerve.'), L('pilar', 'Imani, the Skylark is fuelled and I have told the tower you are doing a scenic. Please do not die on my watch.')]),
    ],
  },
  m16_villa: {
    id: 'm16_villa', anchor: 'island.villa', heading: 0, hour: 18.5,
    actors: [A('imani', [0, 0], 0)],
    shots: [
      { from: [3, 2.2, -4], to: [1.5, 2.0, -3.2], look: [0, 1.5, 6], fov: 40, lines: [L('imani', 'Crane. Brandt. The Lazaro boy. And an envelope the size of a Bible.'), L('imani', 'Marisol will want the faces. All of them.')] },
    ],
  },
  m17_dex: {
    id: 'm17_dex', anchor: 'cinder', heading: -90, hour: 16,
    actors: [A('teddy', [-1.4, 0], 'dex'), A('dex', [1.2, 0.3], 'teddy')],
    shots: [
      wide([L('dex', 'The Lazaro footage did four hundred thousand views overnight. Brands are emailing. A tyre company called me "a visionary".'), L('teddy', 'You are a cameraman, Dex.')]),
      close(1.2, [L('dex', 'I am a visionary with a cameraman\'s salary. Do the Hot Lap. Ninety seconds round the Flats, cameras on every dune.'), L('teddy', 'If I make it in ninety, do I get a tyre contract?'), L('dex', 'If you make it in ninety, I get a tyre contract.')]),
    ],
  },
  m18_viral: {
    id: 'm18_viral', anchor: 'taqueria', heading: 180, hour: 20,
    actors: [A('teddy', [-1.5, 0], 'dex'), A('dex', [0.2, 0.2], 'teddy'), A('mamajo', [2.2, 0.6], 'teddy')],
    shots: [
      wide([L('dex', 'Four million. Teddy. Four million, and counting.'), L('mamajo', 'And not one of them has ordered a taco. This is what is wrong with the internet.')]),
      close(-1.5, [L('teddy', 'Mama Jo, I jumped four cars on live television.'), L('mamajo', 'And on the third car, mijo, you said "oh no". I heard you. Eat.')]),
    ],
  },
  m19_brief: {
    id: 'm19_brief', anchor: 'airport.apron', heading: 0, hour: 21,
    actors: [A('imani', [-1.2, 0], 'pruitt'), A('pruitt', [1.2, 0.3], 'imani'), A('pilar', [3, 1.5], 'imani')],
    shots: [
      wide([L('pruitt', 'Crane sells the army his software. Fort Halloran keeps the only copy of the contract in a locked terminal at the motor pool.'), L('imani', 'You want me to walk into a military base.')]),
      close(1.2, [L('pruitt', 'I want you to walk out of one with a file. The sentries are not expecting anyone, which is the best protection we have.'), L('pilar', 'There is a Newsbird on the motor pool pad. Nobody will miss it for the first six minutes.')]),
    ],
  },
  m20_seats: {
    id: 'm20_seats', anchor: 'tower.top', heading: 180, hour: 17.5,
    actors: [A('teddy', [-1.2, 0], 'dex'), A('dex', [1, 0.2], 'teddy')],
    shots: [
      wide([L('dex', 'Crane for Governor. Three campaign vans parked on the plaza. A bunch of balloons, a stage and one thousand folding chairs.'), L('teddy', 'The cheap seats.')]),
      close(-1.2, [L('dex', 'The Task Force is guarding them. Heavily. Which is why the footage would be enormous.'), L('teddy', 'You always say that.'), L('dex', 'And I am always right. I just never say the second half: "and we will probably be arrested".')]),
    ],
  },
  m21_rosa: {
    id: 'm21_rosa', anchor: 'costa.cafe', heading: 0, hour: 13,
    actors: [A('mack', [-1.4, 0], 'rosa'), A('rosa', [1.2, 0.2], 'mack'), A('mateo', [3.4, 1.8], 'mack')],
    shots: [
      wide([L('rosa', 'Sit, Marcus. Coffee. I do not do business without it, and I do not do business with people who refuse it.'), L('mack', 'Coffee, then.')]),
      close(1.2, [L('rosa', 'You burned my stash house, you took my courier\'s case and you have a daughter with an excellent ear for music.'), L('mack', 'Is that a threat, Rosa?'), L('rosa', 'It is a list. I like to know who is at my table.')]),
      close(3.4, [L('mateo', 'Mama. Let me.'), L('rosa', 'Sit down, Mateo. We are talking.'), L('mateo', 'We have been talking for a week. Crane pays better than talk.')], { look: [3.4, 1.6, 1.8], from: [2.4, 1.6, -1.0], to: [2.7, 1.62, -0.7] }),
      wide([L('rosa', 'Tomas wants out. Crane will not let him out. You can have Tomas, and the ledger he has copied, if you bring him home alive.'), L('mack', 'And Mateo?'), L('rosa', 'Mateo, I am afraid, is a different conversation.')]),
    ],
  },
  m22_deals: {
    id: 'm22_deals', anchor: 'tower.top', heading: 180, hour: 19,
    actors: [A('imani', [-1.2, 0], 'crane'), A('crane', [1.2, 0.2], 'imani'), A('brandt', [3.4, 2], 'imani')],
    shots: [
      wide([L('crane', 'Ms. Cole. I find a woman who can fly an aircraft to a private island, photograph me and fly home again rather impressive.'), L('imani', 'Then you will not mind me saying the photographs are good.')]),
      close(1.2, [L('crane', 'Two million and an airline. Not a metaphor: an actual airline, six aircraft, a very comfortable office.'), L('imani', 'In exchange for?'), L('crane', 'Three colleagues. A name each. The rest is simply forgetting.')]),
      close(-1.2, [L('imani', 'I will think about it.'), L('crane', 'Do. I know where you sleep, which is a very nice hangar, by the way.')], { look: [-1.2, 1.6, 0] }),
    ],
  },
  m22_tomas: {
    id: 'm22_tomas', anchor: 'taqueria', heading: 0, hour: 22.5,
    actors: [A('imani', [-1.2, 0], 'tomas'), A('tomas', [1.2, 0.2], 'imani'), A('mamajo', [3.4, 1.4], 'tomas')],
    shots: [
      wide([L('tomas', 'My mother says you are the pilot. I have never trusted pilots. They are always above everything.'), L('imani', 'It is the job. Come inside, Tomas. You are safe here.')]),
      close(1.2, [L('tomas', 'I am a Lazaro. Nowhere is safe. But this is a taqueria, so I will take the table by the wall.')]),
    ],
  },
  m23_trade: {
    id: 'm23_trade', anchor: 'depot', heading: 90, hour: 23,
    actors: [A('mateo', [0, 0], 'mack'), A('tomas', [2.4, 1.5], 'mateo'), A('thug', [3.4, -0.6], 'mack', true), A('thug', [-3.6, 0.8], 'mack', true)],
    shots: [
      wide([L('mateo', 'Brother. Brother. You do not have to be afraid. It is only family.'), L('tomas', 'You are not family. You are Crane\'s dog.')]),
      close(0, [L('mateo', 'Crane keeps this family fed. You think Mama\'s coffee shop pays for those watches?')]),
      { from: [-8, 3, -10], to: [-6, 2.6, -8], look: [0, 1.5, 0], fov: 32, lines: [L('pruitt', 'All three of you. Now. This is the moment I have been working towards.')] },
    ],
  },
  m25_benny: {
    id: 'm25_benny', anchor: 'harbor', heading: 180, hour: 3,
    actors: [A('mack', [-1.2, 0], 'benny'), A('benny', [1.2, 0.2], 'mack')],
    shots: [
      wide([L('benny', 'They took the shop, Marcus. Fifty years and they put a tape across the door and called it evidence.'), L('mack', 'We will get it back.')]),
      close(1.2, [L('benny', 'Do you know what I thought, standing on that dock? I thought: the water is rising. We are all just parked at the wrong time.'), L('mack', 'Get in the car, Benny.')]),
    ],
  },
  m26_mamajo: {
    id: 'm26_mamajo', anchor: 'taqueria', heading: 180, hour: 1,
    actors: [A('teddy', [-1.4, 0], 'mamajo'), A('mamajo', [0.6, 0.2], 'teddy'), A('dex', [2.6, 0.8], 'teddy')],
    shots: [
      wide([L('mamajo', 'You think I do not hear things in my own kitchen? The whole street knows who you are and what they want.'), L('teddy', 'Mama Jo, we will go. Right now. We will not bring this to your door.')]),
      close(0.6, [L('mamajo', 'You are already at my door. Sit. Eat. And Teddy, when they come, do something large. I would like to watch.')]),
    ],
  },
  m26_after: {
    id: 'm26_after', anchor: 'taqueria', heading: 180, hour: 2.5,
    actors: [A('teddy', [-1.4, 0], 'mamajo'), A('mamajo', [0.6, 0.2], 'teddy'), A('dex', [2.6, 0.8], 'teddy')],
    shots: [
      wide([L('dex', 'Four of them. Four. And you did not even drop the taco.'), L('mamajo', 'There is a bullet in my menu. A bullet. In the menu.'), L('teddy', 'I will pay for the menu.')]),
    ],
  },
  m27_reveal: {
    id: 'm27_reveal', anchor: 'newsroom', heading: 180, hour: 6.5,
    actors: [A('marisol', [0, 0], 'mack'), A('mack', [-2.4, 0.6], 'marisol'), A('imani', [2.4, 0.6], 'marisol'), A('teddy', [4.4, 1.4], 'marisol'), A('pruitt', [-4.6, 1.6], 'marisol')],
    shots: [
      wide([L('marisol', 'Forty-one pages. Three ledgers. A video, thanks to Teddy\'s camera. And a photograph, thanks to Imani\'s nerve.'), L('pruitt', 'The Task Force will try to stop the broadcast. They have twenty minutes.')]),
      close(0, [L('marisol', 'Then we have twenty minutes. Nobody leaves until it airs.')]),
    ],
  },
  m27_end: {
    id: 'm27_end', anchor: 'tower.top', heading: 180, hour: 8,
    actors: [A('crane', [0, 0], 'brandt'), A('brandt', [1.8, 0.6], 'crane')],
    shots: [
      wide([L('crane', 'Ines. A poll, please. I would like to know how the city feels about a candidate who has been lied about by a nobody on television.'), L('brandt', 'Ahead by six, sir. Ahead by six.')]),
      low([L('crane', 'Good. Then I will not run for the Governor\'s office. I will run it. Open the harbor.'), L('brandt', 'Sir?'), L('crane', 'Open the harbor, Ines. Every container. Everything. This city is about to find out what a flood looks like.')]),
    ],
  },
};
