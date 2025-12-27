export const Teams = {
  /* ================= NFL ================= */
  "Houston Texans": { logo: "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png" },
  "Los Angeles Chargers": { logo: "https://a.espncdn.com/i/teamlogos/nfl/500/lac.png" },
  "Baltimore Ravens": { logo: "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png" },
  "Green Bay Packers": { logo: "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png" }
  // keep your existing NFL list
};

/* ================= NHL ================= */

const nhl = {
  "Anaheim Ducks": "ana",
  "Boston Bruins": "bos",
  "Buffalo Sabres": "buf",
  "Calgary Flames": "cgy",
  "Carolina Hurricanes": "car",
  "Chicago Blackhawks": "chi",
  "Colorado Avalanche": "col",
  "Dallas Stars": "dal",
  "Detroit Red Wings": "det",
  "Edmonton Oilers": "edm",
  "Florida Panthers": "fla",
  "Los Angeles Kings": "la",
  "Minnesota Wild": "min",
  "Montreal Canadiens": "mtl",
  "Nashville Predators": "nsh",
  "New Jersey Devils": "nj",
  "New York Islanders": "nyi",
  "New York Rangers": "nyr",
  "Ottawa Senators": "ott",
  "Philadelphia Flyers": "phi",
  "Pittsburgh Penguins": "pit",
  "San Jose Sharks": "sj",
  "Seattle Kraken": "sea",
  "St. Louis Blues": "stl",
  "Tampa Bay Lightning": "tb",
  "Toronto Maple Leafs": "tor",
  "Vancouver Canucks": "van",
  "Vegas Golden Knights": "vgk",
  "Washington Capitals": "wsh",
  "Winnipeg Jets": "wpg"
};

Object.entries(nhl).forEach(([name, code]) => {
  Teams[name] = {
    logo: `https://a.espncdn.com/i/teamlogos/nhl/500/${code}.png`
  };
});
