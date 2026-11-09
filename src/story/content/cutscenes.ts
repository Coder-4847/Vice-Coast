import { CHARS } from '../chars';
import type { ActorDef, CutsceneDef, Line, Shot } from '../types';

// ----------------------------------------------------------------------------------------------- helpers

const lk = (id: string): ActorDef['look'] => (id in CHARS ? { char: id as 'mack' } : { cast: id });
/** An actor. `at` is [right, forward] from the scene anchor. */
const A = (id: string, at: [number, number], face?: number | string, aim = false): ActorDef => ({ id, look: lk(id), at, face, aim });
const L = (who: string, text: string): Line => ({ who, text });

/** A wide shot of the whole scene, easing in. */
const wide = (lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [0.4, 1.9, -7], to: [-0.2, 1.75, -5.6], look: [0, 1.4, 0], fov: 48, lines, ...o });
/** Over-the-shoulder style close shot on whoever stands at scene x. */
const close = (x: number, lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [x * 0.45 + 0.7, 1.62, -2.6], to: [x * 0.45 + 0.55, 1.64, -2.2], look: [x, 1.6, 0], fov: 32, lines, ...o });
/** Low heroic angle. */
const low = (lines: Line[], o: Partial<Shot> = {}): Shot => ({ from: [1.2, 0.5, -4.4], to: [0.6, 0.7, -3.6], look: [0, 1.6, 0], fov: 46, lines, ...o });

export const CUTSCENES: Record<string, CutsceneDef> = {
  // ---------------------------------------------------------------------------------------------- opening
  intro: {
    id: 'intro', anchor: 'home.mack', heading: -90, hour: 18.2,
    actors: [A('mack', [0, 0], 0)],
    shots: [
      { from: [1.5, 1.8, -3.5], to: [-0.8, 1.7, -2.2], look: [0, 1.7, 8], fov: 48, lines: [L('mack', 'Port Valeria. Seven in the evening, and the whole coast smells like money and fried dough.')] },
      { from: [-2.2, 1.2, 2.6], to: [-1.4, 1.5, 2.0], look: [0, 1.65, 0], fov: 36, lines: [L('mack', 'Twenty years I drove for people who thought that smell was an invitation.'), L('mack', 'Now I park their cars for tips and I go home early. Honest work. Boring work. Mine.')] },
      { from: [0, 3.6, -9], to: [0, 6.5, -14], look: [0, 1.5, 4], fov: 52, lines: [L('mack', 'Funny thing about boring. It only lasts until somebody remembers your name.')] },
    ],
  },

  // ---------------------------------------------------------------------------------------------- M01 Valet
  m01_gala: {
    id: 'm01_gala', anchor: 'gala', heading: 180, hour: 19.5,
    actors: [A('mack', [-1.4, 0], 'crane'), A('crane', [1.4, 0.2], 'mack'), A('brandt', [3.0, 1.2], 'mack'), A('pruitt', [-5, 4], 'crane')],
    shots: [
      wide([L('crane', 'Marcus, isn\'t it? They tell me you\'re the one man in this city who can park a car without leaving a mark on it.'), L('mack', 'Mr. Crane. I\'ve parked worse for less.')]),
      close(1.4, [L('crane', 'Bring the Ridgeback around from the Motors lot. Captain Brandt and I have a dinner to be late for.')]),
      close(3.0, [L('brandt', 'Quickly, valet. The Captain does not wait.'), L('mack', 'It\'s the Captain\'s city. She can do what she likes.')], { look: [3.0, 1.6, 1.2], from: [2.4, 1.6, -1.6], to: [2.6, 1.62, -1.2] }),
    ],
  },
  m01_dropoff: {
    id: 'm01_dropoff', anchor: 'gala', heading: 180,
    actors: [A('mack', [-1.2, 0], 'crane'), A('crane', [1.2, 0.2], 'mack'), A('pruitt', [-4.5, 3.5], 'mack')],
    shots: [
      wide([L('crane', 'Not a scratch. Steady hands, Marcus. I remember that kind of thing.'), L('mack', 'Enjoy your dinner, sir.')]),
      { from: [-6, 1.7, -2], to: [-5.2, 1.7, -1.4], look: [-4.5, 1.6, 3.5], fov: 34, lines: [L('pruitt', 'Mr. Delgado. Walk with me. You parked that car like a man who used to do something more exciting.')] },
      close(-1.2, [L('mack', 'I don\'t know you.'), L('pruitt', 'Walter Pruitt. State Bureau of Investigation. I know Port Costa, 2011. I know the three jobs after it. I know you were never charged.')]),
      close(-4.5, [L('pruitt', 'I can make that file thick or I can make it vanish. All I need is a driver\'s eyes tonight. Follow Mr. Crane\'s car. See where a candidate for governor spends his evening.'), L('mack', 'And if I say no?'), L('pruitt', 'Then you keep parking cars. For a while.')], { look: [-4.5, 1.6, 3.5], from: [-3.2, 1.62, -2.4], to: [-3.4, 1.64, -2.0] }),
    ],
  },
  m01_harbor: {
    id: 'm01_harbor', anchor: 'harbor', heading: 90,
    actors: [A('crane', [0, 0], 'brandt'), A('brandt', [1.4, 0.4], 'crane'), A('guard', [-3, 5], 'crane'), A('guard2', [4, 5], 90)],
    shots: [
      { from: [18, 3.5, -26], to: [14, 3.2, -22], look: [0, 1.5, 0], fov: 28, lines: [L('pruitt', 'You see them? Tell me you see them.'), L('mack', 'Crane. The Captain. And half the Harbor Task Force with their hands out.')] },
      { from: [10, 2.0, -12], to: [8, 1.9, -10], look: [0.5, 1.5, 0.2], fov: 30, lines: [L('brandt', 'The dockhands pay by Friday, or we find their paperwork is wrong.'), L('crane', 'No theatrics, Ines. Just the usual. The harbor will be gone in a year anyway.')] },
      { from: [-5, 3, -14], to: [-4, 2.5, -12], look: [0.5, 1.5, 0.2], fov: 30, lines: [L('mack', 'That is not an evening out. That is a collection.'), L('pruitt', 'Now you understand why I need you. Be ready for my call.')] },
    ],
  },

  // ---------------------------------------------------------------------------------------------- M02 Old Debts
  m02_redline: {
    id: 'm02_redline', anchor: 'redline', heading: 0,
    actors: [A('benny', [0, 0], 'mateo'), A('mateo', [0, 2.4], 'benny', false), A('mack', [-4, -4], 'benny')],
    shots: [
      wide([L('mateo', 'Rosa wants her money, Benny. All of it. By midnight.'), L('benny', 'I\'m a mechanic, I don\'t have a vault! Give me till Friday!')], { from: [-3, 2.2, -9], to: [-1.4, 1.9, -7] }),
      { from: [2.8, 1.6, -1.4], to: [2.3, 1.65, -1.0], look: [0, 1.6, 2.4], fov: 32, lines: [L('mateo', 'Friday is not a day Rosa knows.')] },
      close(0, [L('mack', 'Hey. Mateo, is it? He said Friday.'), L('mateo', 'Who asked you?')], { from: [-2.2, 1.62, -6], to: [-1.9, 1.64, -5.2], look: [-4, 1.6, -4], fov: 30 }),
      low([L('mateo', 'Boys, show the old man what happens to people who talk.')], { look: [0, 1.6, 2.4], from: [3, 0.6, -2], to: [2.4, 0.9, -1.2] }),
    ],
  },
  m02_after: {
    id: 'm02_after', anchor: 'redline', heading: 0,
    actors: [A('benny', [0.8, 0], 'mack'), A('mack', [-0.8, 0], 'benny')],
    shots: [
      wide([L('benny', 'Marcus, I owe Rosa Lazaro forty grand and you just made it forty and a war.'), L('mack', 'You called me, Benny. You said one more favor.')]),
      close(0.8, [L('benny', 'She sends a courier down the Port Road every night with a case. The ledger pages for the Costa casino. Without them Rosa cannot prove a cent to anybody.'), L('benny', 'Take the case and we have something to bargain with.')]),
      close(-0.8, [L('mack', 'I\'m done with this life.'), L('benny', 'Nobody is ever done, my friend. They only get quiet for a while.')]),
    ],
  },

  // ---------------------------------------------------------------------------------------------- M03 Slipstream
  m03_case: {
    id: 'm03_case', anchor: 'player', heading: 0,
    actors: [A('mack', [0, 0], 180)],
    shots: [
      { from: [1.2, 1.8, -3.2], to: [0.6, 1.7, -2.4], look: [0, 1.5, 0], fov: 40, lines: [L('mack', 'Ledger pages. Rows of numbers, and one name over and over: Meridian.'), L('mack', 'Crane isn\'t just friends with the Lazaros. He\'s their bank.')] },
      { from: [-1.8, 1.4, 2.4], to: [-1.3, 1.5, 1.8], look: [0, 1.6, 0], fov: 34, lines: [L('pruitt', 'You have it? Good. Keep it somewhere that isn\'t your apartment. There are other people who want to know about Mr. Crane, and they don\'t knock.')] },
    ],
  },

  // ---------------------------------------------------------------------------------------------- M04 Charter
  m04_pilar: {
    id: 'm04_pilar', anchor: 'home.imani', heading: 0,
    actors: [A('imani', [-1, 0], 'pilar'), A('pilar', [1.1, 0.2], 'imani')],
    shots: [
      wide([L('pilar', 'Charter to Isla Rojo. One case, sealed, no questions. Eight thousand.'), L('imani', 'I never ask questions. I ask for a fuel surcharge.')]),
      close(1.1, [L('pilar', 'The client pays double if you land before nine and don\'t look inside.'), L('pilar', 'And Imani? Somebody asked about you today. Very polite. Very well dressed.')]),
      close(-1, [L('imani', 'They always are. Fuel up the Skylark. I\'m off the ground in ten.')]),
    ],
  },
  m04_arrive: {
    id: 'm04_arrive', anchor: 'island.strip', heading: 0,
    actors: [A('imani', [-1, 0], 'mateo'), A('mateo', [1.2, 1.4], 'imani'), A('guard', [3.5, 2.5], 'imani', true), A('guard2', [-3.5, 2.5], 'imani', true)],
    shots: [
      wide([L('mateo', 'Right on time. You\'re the pilot? I expected someone older.'), L('imani', 'I get that a lot. The case. Your money.')]),
      close(1.2, [L('mateo', 'About that. Mr. Crane wants you to see something first.')]),
      low([L('imani', 'That is not what we agreed.'), L('mateo', 'Plans change. Open the case, Miss Cole.')], { look: [-1, 1.6, 0] }),
    ],
  },

  // ---------------------------------------------------------------------------------------------- M05 Overwatch
  m05_buyer: {
    id: 'm05_buyer', anchor: 'island.strip', heading: 0,
    actors: [A('imani', [0, 0], 0)],
    shots: [
      { from: [-1.4, 1.7, -3], to: [-0.8, 1.7, -2.3], look: [0, 1.6, 0], fov: 36, lines: [L('imani', 'No buyer. No case. Just a firing line waiting for a pilot nobody will miss.')] },
      { from: [0, 0.9, 3], to: [0, 1.1, 2.4], look: [0, 1.6, 0], fov: 38, lines: [L('imani', 'Fine. Ridge. High ground. Let them come to me.')] },
    ],
  },
  m05_after: {
    id: 'm05_after', anchor: 'player', heading: 0,
    actors: [A('imani', [0, 0], 180)],
    shots: [
      { from: [1.3, 1.7, -3.4], to: [0.8, 1.7, -2.6], look: [0, 1.5, 0], fov: 38, lines: [L('imani', 'The case. Paper, in a binder. Names, dates, wire transfers. Crane\'s signature on every sheet.'), L('imani', 'I did not just fly a delivery. I flew a bomb, and somebody wanted me holding it when it went off.')] },
    ],
  },

  // ---------------------------------------------------------------------------------------------- M06 Dead Drop
  m06_marisol: {
    id: 'm06_marisol', anchor: 'newsroom', heading: 0,
    actors: [A('imani', [-1.1, 0], 'marisol'), A('marisol', [1.1, 0], 'imani')],
    shots: [
      wide([L('marisol', 'Pilar said you\'d bring something. I\'m Marisol Vega. I write what other people are too nervous to print.'), L('imani', 'Then you\'ll love this. Don\'t read it here.')]),
      close(1.1, [L('marisol', 'Meridian wire transfers. Task Force payroll. Oh, this is... this is the whole machine.'), L('marisol', 'They will kill for this. You know that.')]),
      close(-1.1, [L('imani', 'They tried this afternoon. I\'m still here. Print it, and give me a head start.')]),
    ],
  },

  // ---------------------------------------------------------------------------------------------- M07 Followers
  m07_teddy: {
    id: 'm07_teddy', anchor: 'home.teddy', heading: 0,
    actors: [A('teddy', [-1.2, 0], 'dex'), A('dex', [1.2, 1.5], 'teddy')],
    shots: [
      wide([L('teddy', 'Dex! Dex, are we live? Say we\'re live.'), L('dex', 'We\'re live. Four thousand people. Three of them are your mom.')]),
      close(-1.2, [L('teddy', 'Hello, children of the internet! Today I jump Dead Man\'s Gap in a car I do not own!')]),
      close(1.2, [L('dex', 'Please say it\'s a car you got permission for.'), L('teddy', 'Permission is a state of mind, Dexter.')]),
    ],
  },
  m07_jump: {
    id: 'm07_jump', anchor: 'player', heading: 0,
    actors: [A('teddy', [0, 0], 180), A('dex', [1.6, 0.8], 180)],
    shots: [
      { from: [0.8, 1.6, -3.4], to: [0.4, 1.7, -2.6], look: [0, 1.5, 0], fov: 38, lines: [L('dex', 'Two hundred thousand views already! You\'re famous!'), L('teddy', 'Dex. Did the drone drift left just now?')] },
      { from: [-1.8, 1.4, 2.2], to: [-1.2, 1.5, 1.8], look: [0, 1.5, 0], fov: 36, lines: [L('dex', 'It caught something at the stash house by the canyon. Men with crates. Men with guns.'), L('teddy', 'Oh. Oh no. Oh, I love it.')] },
    ],
  },

  // ---------------------------------------------------------------------------------------------- M08 Stash House
  m08_boom: {
    id: 'm08_boom', anchor: 'player', heading: 0,
    actors: [A('teddy', [0, 0], 180)],
    shots: [
      { from: [1.2, 1.2, -3.2], to: [0.6, 1.5, -2.4], look: [0, 1.5, 0], fov: 40, lines: [L('teddy', 'And that, ladies and gentlemen, is why you never leave a pile of explosives next to a pile of cash.'), L('dex', 'Teddy, they can all see your face!')] },
    ],
  },

  // ---------------------------------------------------------------------------------------------- M09 Dust Up
  m09_mamajo: {
    id: 'm09_mamajo', anchor: 'taqueria', heading: 90,
    actors: [A('mamajo', [-1, 0], 'teddy'), A('teddy', [1.1, 0.6], 'mamajo'), A('dex', [2.8, 1.8], 'mamajo')],
    shots: [
      wide([L('mamajo', 'Theodore Vance. I just watched you blow up half a canyon on a screen the size of my hand.'), L('teddy', 'Mama Jo! Hi! It was a quarter of a canyon.')]),
      close(-1, [L('mamajo', 'You come in here, bring that poor boy half dead, and you want tacos.'), L('teddy', 'And a place to sleep. And... a plan?')]),
      close(1.1, [L('mamajo', 'My cousin runs the radio. The man who owns those crates is Mateo Lazaro. He will find you by morning.'), L('dex', 'So, uh, let\'s not be here by morning.')]),
    ],
  },

  // ---------------------------------------------------------------------------------------------- M10 Three Roads
  m10_meeting: {
    id: 'm10_meeting', anchor: 'home.mack', heading: -90,
    actors: [A('mack', [-2.2, 0], 'pruitt'), A('imani', [0, 0.4], 'pruitt'), A('teddy', [2.2, 0], 'pruitt'), A('pruitt', [0, 3.8], 'imani')],
    shots: [
      wide([L('pruitt', 'Thank you all for coming to Mr. Delgado\'s tasteful studio flat.'), L('mack', 'I didn\'t invite you.'), L('imani', 'I didn\'t invite me either. Who is the kid?'), L('teddy', 'Kid! I am thirty-one! I have a verified account!')], { look: [0, 1.4, 2] }),
      close(0, [L('pruitt', 'You three have something in common. Mr. Crane would very much like all of you silenced.'), L('imani', 'That is not a coincidence.'), L('pruitt', 'It rarely is. He has money in four places that matter. I want to empty them. You three do the emptying.')], { look: [0, 1.6, 3.8], from: [0, 1.7, 0.4], to: [0.1, 1.68, 0.8] }),
      wide([L('mack', 'You want us to rob him.'), L('pruitt', 'I want you to steal what he stole. The Bureau will find it very hard to ask where it came from.'), L('teddy', 'Can I film it?'), L('mack', 'No.')], { look: [0, 1.4, 2] }),
    ],
  },

  // ---------------------------------------------------------------------------------------------- M11 Switch
  m11_plan: {
    id: 'm11_plan', anchor: 'depot', heading: 0,
    actors: [A('mack', [-1.6, 0], 'imani'), A('imani', [0, 0], 'teddy'), A('teddy', [1.6, 0], 'mack')],
    shots: [
      wide([L('mack', 'Evidence van. Task Force marked, six guards, one driver. It leaves the depot at midnight for the Harbor lockup.'), L('imani', 'I take the rooftop. I\'ll keep their heads down.')]),
      close(1.6, [L('teddy', 'And I\'m the surprise!'), L('mack', 'You are the surprise on the ground. Mack drives, Imani covers, Teddy hits it. Swap with the Z key when I say go.')]),
    ],
  },

  // ---------------------------------------------------------------------------------------------- M12 Dead Ringers
  m12_end: {
    id: 'm12_end', anchor: 'home.mack', heading: -90,
    actors: [A('mack', [-2, 0], 'pruitt'), A('imani', [0, 0.2], 'pruitt'), A('teddy', [2, 0], 'pruitt'), A('pruitt', [0, 3.5], 'imani')],
    shots: [
      wide([L('pruitt', 'The van. Burned. The Task Force is going to be extremely embarrassed.'), L('teddy', 'I got it all on stream!'), L('imani', 'You\'re deleting that. Tonight.')], { look: [0, 1.4, 2] }),
      close(0, [L('pruitt', 'Crane keeps part of his money as stones. Marlowe Row, a jeweller called Calloway & Daughters. Quiet, loud or clever, it\'s your call.'), L('mack', 'Show us the floor plan.')], { look: [0, 1.6, 3.5], from: [0, 1.7, 0.2], to: [0.1, 1.68, 0.7] }),
      wide([L('mack', 'We do this properly. Three of us, one plan.'), L('teddy', 'And snacks.'), L('imani', 'And snacks.')], { look: [0, 1.4, 2] }),
    ],
  },

  // ---------------------------------------------------------------------------------------------- Heist: jeweller
  h1_board: {
    id: 'h1_board', anchor: 'home.mack', heading: -90,
    actors: [A('mack', [-2, 0], 'pruitt'), A('imani', [0, 0.2], 'pruitt'), A('teddy', [2, 0], 'pruitt'), A('pruitt', [0, 3.5], 'imani')],
    shots: [
      wide([L('pruitt', 'Calloway & Daughters. Crane\'s diamonds sit in the back vault, behind two pretty glass cases and a very expensive alarm.'), L('imani', 'Cameras?'), L('pruitt', 'Six. Plus a sleepy guard with an excellent pension.')], { look: [0, 1.4, 2] }),
    ],
  },
  h1_done: {
    id: 'h1_done', anchor: 'home.mack', heading: -90,
    actors: [A('mack', [-2, 0], 'imani'), A('imani', [0, 0.2], 'teddy'), A('teddy', [2, 0], 'mack')],
    shots: [
      wide([L('teddy', 'Are those real? Is that one real?'), L('imani', 'Put it down, Teddy.'), L('mack', 'One down. Pruitt says the bank is next.')], { look: [0, 1.4, 0] }),
    ],
  },

  // ---------------------------------------------------------------------------------------------- Heist: bank
  h2_board: {
    id: 'h2_board', anchor: 'home.mack', heading: -90,
    actors: [A('mack', [-2, 0], 'pruitt'), A('imani', [0, 0.2], 'pruitt'), A('teddy', [2, 0], 'pruitt'), A('pruitt', [0, 3.5], 'imani')],
    shots: [
      wide([L('pruitt', 'Valeria Savings, Central Branch. Meridian\'s slush fund lives in a vault under the teller line.'), L('mack', 'Time lock?'), L('pruitt', 'Ninety seconds to open, and every second of it is on a police radio.')], { look: [0, 1.4, 2] }),
    ],
  },
  h2_done: {
    id: 'h2_done', anchor: 'home.mack', heading: -90,
    actors: [A('mack', [-2, 0], 'imani'), A('imani', [0, 0.2], 'teddy'), A('teddy', [2, 0], 'mack'), A('pruitt', [0, 3.5], 'imani')],
    shots: [
      wide([L('pruitt', 'Two for two. Crane is going to notice.'), L('mack', 'Let him. We\'re just getting started.'), L('imani', 'The convoy next?'), L('pruitt', 'Soon. Rest. For once, all of you.')], { look: [0, 1.4, 2] }),
    ],
  },
};
