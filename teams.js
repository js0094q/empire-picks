const TeamAssets = {
  nfl: {
    "Arizona Cardinals": { abbr: "ARI", primary: "#97233F", secondary: "#000000" },
    "Atlanta Falcons": { abbr: "ATL", primary: "#A71930", secondary: "#000000" },
    "Baltimore Ravens": { abbr: "BAL", primary: "#241773", secondary: "#000000" },
    "Buffalo Bills": { abbr: "BUF", primary: "#00338D", secondary: "#C60C30" },
    "Carolina Panthers": { abbr: "CAR", primary: "#0085CA", secondary: "#101820" },
    "Chicago Bears": { abbr: "CHI", primary: "#0B162A", secondary: "#C83803" },
    "Cincinnati Bengals": { abbr: "CIN", primary: "#FB4F14", secondary: "#000000" },
    "Cleveland Browns": { abbr: "CLE", primary: "#311D00", secondary: "#FF3C00" },
    "Dallas Cowboys": { abbr: "DAL", primary: "#003594", secondary: "#869397" },
    "Denver Broncos": { abbr: "DEN", primary: "#FB4F14", secondary: "#002244" },
    "Detroit Lions": { abbr: "DET", primary: "#0076B6", secondary: "#B0B7BC" },
    "Green Bay Packers": { abbr: "GB", primary: "#203731", secondary: "#FFB612" },
    "Houston Texans": { abbr: "HOU", primary: "#03202F", secondary: "#A71930" },
    "Indianapolis Colts": { abbr: "IND", primary: "#002C5F", secondary: "#A2AAAD" },
    "Jacksonville Jaguars": { abbr: "JAX", primary: "#006778", secondary: "#101820" },
    "Kansas City Chiefs": { abbr: "KC", primary: "#E31837", secondary: "#FFB81C" },
    "Las Vegas Raiders": { abbr: "LV", primary: "#000000", secondary: "#A5ACAF" },
    "Los Angeles Chargers": { abbr: "LAC", primary: "#0080C6", secondary: "#FFC20E" },
    "Los Angeles Rams": { abbr: "LAR", primary: "#003594", secondary: "#FFA300" },
    "Miami Dolphins": { abbr: "MIA", primary: "#008E97", secondary: "#F58220" },
    "Minnesota Vikings": { abbr: "MIN", primary: "#4F2683", secondary: "#FFC62F" },
    "New England Patriots": { abbr: "NE", primary: "#002244", secondary: "#C60C30" },
    "New Orleans Saints": { abbr: "NO", primary: "#D3BC8D", secondary: "#101820" },
    "New York Giants": { abbr: "NYG", primary: "#0B2265", secondary: "#A71930" },
    "New York Jets": { abbr: "NYJ", primary: "#125740", secondary: "#000000" },
    "Philadelphia Eagles": { abbr: "PHI", primary: "#004C54", secondary: "#A5ACAF" },
    "Pittsburgh Steelers": { abbr: "PIT", primary: "#FFB612", secondary: "#101820" },
    "San Francisco 49ers": { abbr: "SF", primary: "#AA0000", secondary: "#B3995D" },
    "Seattle Seahawks": { abbr: "SEA", primary: "#002244", secondary: "#69BE28" },
    "Tampa Bay Buccaneers": { abbr: "TB", primary: "#D50A0A", secondary: "#FF7900" },
    "Tennessee Titans": { abbr: "TEN", primary: "#0C2340", secondary: "#4B92DB" },
    "Washington Commanders": { abbr: "WAS", primary: "#5A1414", secondary: "#FFB612" }
  },

  fallback: { abbr: "NFL", primary: "#222222", secondary: "#555555" },

  get(name) {
    const data = this.nfl[name] || this.fallback;
    const abbr = data.abbr || "NFL";
    const bg = (data.primary || "#222222").replace("#", "");
    return {
      abbr,
      primary: data.primary,
      secondary: data.secondary,
      logoUrl: `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`
      helmetUrl: `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`
    };
  }
};

window.TeamAssets = TeamAssets;
