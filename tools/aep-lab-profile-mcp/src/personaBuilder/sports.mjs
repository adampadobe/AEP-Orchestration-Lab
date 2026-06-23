import {
  assign,
  randomBetween,
  randomPick,
  weightedBool,
} from './utils.mjs';

const SPORTS = ['football', 'american_football', 'basketball', 'baseball', 'hockey', 'rugby', 'cricket', 'tennis', 'motorsport'];
const TEAMS_BY_SPORT = {
  football: ['Manchester United', 'Real Madrid', 'Barcelona', 'Arsenal', 'Liverpool'],
  american_football: ['Patriots', 'Chiefs', '49ers', 'Cowboys', 'Eagles'],
  basketball: ['Lakers', 'Celtics', 'Warriors', 'Heat', 'Bulls'],
  baseball: ['Yankees', 'Red Sox', 'Dodgers', 'Giants', 'Cubs'],
  hockey: ['Maple Leafs', 'Rangers', 'Bruins', 'Blackhawks', 'Penguins'],
  rugby: ['All Blacks', 'Springboks', 'Saracens', 'Leinster'],
  cricket: ['Mumbai Indians', 'England', 'Australia', 'India'],
  tennis: ['No team — individual sport'],
  motorsport: ['Ferrari', 'Mercedes', 'Red Bull', 'McLaren'],
};
const FAN_SEGMENTS = ['casual', 'regular', 'superfan', 'day_one'];
const JERSEY_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const MERCH_BANDS = ['under_50', '50_200', '200_500', '500_plus'];
const LAST_ATTENDED = ['this_season', 'last_season', '2_plus_years', 'never'];

/**
 * Fan/venue-coherent sports persona (mirrors profile-generation-sports.js).
 * @returns {Record<string, unknown>}
 */
export function buildSportsPersonaAttributes() {
  const attrs = {};
  const sport = randomPick(SPORTS);
  const teamPool = TEAMS_BY_SPORT[sport] || ['Demo FC'];
  const team = randomPick(teamPool);
  const streamLive = weightedBool(0.65);
  const fantasyPlayer = weightedBool(0.30);
  const lastAttended = randomPick(LAST_ATTENDED);
  const attendsLive = lastAttended && lastAttended !== 'never';
  const seasonTicket = attendsLive && weightedBool(0.60) ? true : weightedBool(0.20);
  let fanSegment = randomPick(FAN_SEGMENTS);
  if (streamLive && weightedBool(0.70)) {
    fanSegment = randomPick(['superfan', 'day_one']);
  }
  const newsletterSub = fantasyPlayer && weightedBool(0.70) ? true : weightedBool(0.55);

  assign(attrs, 'industrySports.favouriteSport', sport);
  assign(attrs, 'industrySports.favouriteTeam', team);
  assign(attrs, 'industrySports.fanSegment', fanSegment);
  assign(attrs, 'industrySports.jerseySize', randomPick(JERSEY_SIZES));
  assign(attrs, 'industrySports.merchSpendBand', randomPick(MERCH_BANDS));
  assign(attrs, 'industrySports.lastAttendedEvent', lastAttended);
  assign(attrs, 'industrySports.fanFlags.seasonTicket', seasonTicket);
  assign(attrs, 'industrySports.fanFlags.fantasyPlayer', fantasyPlayer);
  assign(attrs, 'industrySports.fanFlags.betsRegularly', weightedBool(0.20));
  assign(attrs, 'industrySports.fanFlags.streamLive', streamLive);
  assign(attrs, 'industrySports.fanFlags.newsletterSub', newsletterSub);
  assign(attrs, 'industrySports.fanFlags.childFan', weightedBool(0.30));
  assign(attrs, 'individualCharacteristics.favouriteTeam', team);
  assign(attrs, 'individualCharacteristics.core.favouriteCategory', 'sports');
  assign(attrs, 'individualCharacteristics.core.favouriteSubCategory', sport);
  assign(attrs, 'scoring.product.affinity', team);
  assign(attrs, 'gym.ptSession', randomPick(['weekly', 'monthly', 'none']));

  return attrs;
}
