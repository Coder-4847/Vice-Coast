/** The side activities the completion tracker counts. `goal` is how many wins / completions fill the bar. */
export type ActGroup = 'Races' | 'Jobs' | 'Skills' | 'Games' | 'Sports' | 'Outdoors';

export interface ActDef {
  id: string;
  name: string;
  group: ActGroup;
  goal: number;
  unit: string;
  blurb: string;
  /** Payout multiplier info for display only. */
  glyph: string;
  color: string;
}

const a = (id: string, name: string, group: ActGroup, goal: number, unit: string, blurb: string, glyph: string, color: string): ActDef => ({ id, name, group, goal, unit, blurb, glyph, color });

export const ACTS: ActDef[] = [
  a('race.street', 'Street races', 'Races', 3, 'won', 'Cars, city streets, no rules. Beat three rivals to the line.', '⚑', '#ff7a59'),
  a('race.circuit', 'Circuit races', 'Races', 2, 'won', 'Closed laps around the airport service roads.', '⚑', '#ff7a59'),
  a('race.rally', 'Off-road rally', 'Races', 2, 'won', 'Dirt, sand and rock in Cinder Flats.', '⚑', '#e0a24a'),
  a('race.downhill', 'Mountain downhill', 'Races', 2, 'won', 'From the Kestrel switchbacks to the sea. Brakes optional.', '⚑', '#9ad0ff'),
  a('race.bike', 'Bike races', 'Races', 2, 'won', 'Two wheels, tight lines.', '⚑', '#7be28f'),
  a('race.boat', 'Boat races', 'Races', 2, 'won', 'Buoy to buoy across the bay and the harbor.', '⚑', '#4aa8ff'),
  a('race.air', 'Air races', 'Races', 2, 'won', 'Fly the gates, low and fast.', '⚑', '#c8a3ff'),
  a('job.taxi', 'Taxi fares', 'Jobs', 10, 'fares', 'Pick people up and take them where they are going.', '◈', '#ffd166'),
  a('job.courier', 'Courier runs', 'Jobs', 6, 'deliveries', 'Packages that cannot wait.', '▣', '#ffb347'),
  a('job.bounty', 'Bounty hunts', 'Jobs', 4, 'caught', 'Find the skip and bring them in.', '✦', '#ff6a6a'),
  a('job.repo', 'Repo jobs', 'Jobs', 4, 'cars', 'Take a car back before its owner notices.', '⚙', '#c0c4cc'),
  a('job.vigilante', 'Vigilante', 'Jobs', 6, 'levels', 'Ride in a police car and stop crimes in progress.', '★', '#6aa8ff'),
  a('school.flight', 'Flight school', 'Skills', 5, 'lessons', 'Take off, turn, land. Then do it in the dark.', '✈', '#c8a3ff'),
  a('school.stunt', 'Stunt course', 'Skills', 3, 'courses', 'Rings, ramps and loops at the airfield.', '✈', '#c8a3ff'),
  a('casino.blackjack', 'Blackjack', 'Games', 10, 'hands won', 'Twenty-one at the Lucky Seven.', '♠', '#ff7a7a'),
  a('casino.roulette', 'Roulette', 'Games', 5, 'wins', 'Red, black or the number you dream about.', '◉', '#ff7a7a'),
  a('casino.slots', 'Slot machines', 'Games', 3, 'big wins', 'Three of a kind pays.', '7', '#ff7a7a'),
  a('bar.darts', 'Darts', 'Games', 3, 'matches won', 'Best of 301 at the Iron Hound.', '◎', '#ffb347'),
  a('bar.pool', 'Pool', 'Games', 3, 'matches won', 'Eight ball for twenty bucks.', '●', '#ffb347'),
  a('mini.lockpick', 'Lockpicking', 'Games', 6, 'locks', 'Steady hands. Set the pins in order.', '⚿', '#7ad7e0'),
  a('mini.hack', 'Hacking', 'Games', 6, 'breaches', 'Match the sequence before the trace finishes.', '⌗', '#7ad7e0'),
  a('mini.safe', 'Safe-cracking', 'Games', 4, 'safes', 'Listen for the click.', '⛁', '#7ad7e0'),
  a('sport.golf', 'Golf', 'Sports', 3, 'rounds won', 'Vista Verde Links: beat the club pro\'s card.', '⛳', '#7be28f'),
  a('sport.tennis', 'Tennis', 'Sports', 3, 'matches won', 'Costa Merida Tennis Club, from friendlies to the pro-am.', '◐', '#d7f25a'),
  a('sport.bowling', 'Bowling', 'Sports', 2, 'games won', 'Ten frames at Starlite Lanes.', '●', '#8fb8ff'),
  a('sport.hoops', 'Hoops', 'Sports', 3, 'shootouts won', 'Sixty seconds, five racks, Seaside courts.', '◍', '#ff9a4a'),
  a('sport.arm', 'Arm wrestling', 'Sports', 3, 'champions beaten', 'Muscle Beach has three champions. Beat them all.', '✊', '#ff7a7a'),
  a('pastime.fish', 'Fishing', 'Outdoors', 15, 'fish caught', 'Piers, the harbor, the lake and the canals. Strike when the float dips.', '≈', '#5ac8ff'),
  a('pastime.hunt', 'Hunting', 'Outdoors', 10, 'pelts', 'The Kestrel grounds: deer, boar, coyotes and the odd mountain lion.', '⌖', '#c49a5a'),
  a('pastime.dive', 'Diving', 'Outdoors', 20, 'relics', 'Five wrecks off the coast, four relics each.', '◒', '#3ad0c0'),
];

export const ACT_BY_ID: Record<string, ActDef> = Object.fromEntries(ACTS.map((d) => [d.id, d]));
export const ACT_GROUPS: ActGroup[] = ['Races', 'Jobs', 'Skills', 'Games', 'Sports', 'Outdoors'];
