const TeamAssets = {
  // NFL Team Data
  nfl: {
    "Arizona Cardinals": { abbr: "ARI", color: "#97233F" },
    "Atlanta Falcons": { abbr: "ATL", color: "#A71930" },
    "Baltimore Ravens": { abbr: "BAL", color: "#241773" },
    "Buffalo Bills": { abbr: "BUF", color: "#00338D" },
    "Carolina Panthers": { abbr: "CAR", color: "#0085CA" },
    "Chicago Bears": { abbr: "CHI", color: "#0B162A" },
    "Cincinnati Bengals": { abbr: "CIN", color: "#FB4F14" },
    "Cleveland Browns": { abbr: "CLE", color: "#311D00" },
    "Dallas Cowboys": { abbr: "DAL", color: "#003594" },
    "Denver Broncos": { abbr: "DEN", color: "#FB4F14" },
    "Detroit Lions": { abbr: "DET", color: "#0076B6" },
    "Green Bay Packers": { abbr: "GB", color: "#203731" },
    "Houston Texans": { abbr: "HOU", color: "#03202F" },
    "Indianapolis Colts": { abbr: "IND", color: "#002C5F" },
    "Jacksonville Jaguars": { abbr: "JAX", color: "#006778" },
    "Kansas City Chiefs": { abbr: "KC", color: "#E31837" },
    "Las Vegas Raiders": { abbr: "LV", color: "#000000" },
    "Los Angeles Chargers": { abbr: "LAC", color: "#0080C6" },
    "Los Angeles Rams": { abbr: "LAR", color: "#003594" },
    "Miami Dolphins": { abbr: "MIA", color: "#008E97" },
    "Minnesota Vikings": { abbr: "MIN", color: "#4F2683" },
    "New England Patriots": { abbr: "NE", color: "#002244" },
    "New Orleans Saints": { abbr: "NO", color: "#D3BC8D" },
    "New York Giants": { abbr: "NYG", color: "#0B2265" },
    "New York Jets": { abbr: "NYJ", color: "#125740" },
    "Philadelphia Eagles": { abbr: "PHI", color: "#004C54" },
    "Pittsburgh Steelers": { abbr: "PIT", color: "#FFB612" },
    "San Francisco 49ers": { abbr: "SF", color: "#AA0000" },
    "Seattle Seahawks": { abbr: "SEA", color: "#002244" },
    "Tampa Bay Buccaneers": { abbr: "TB", color: "#D50A0A" },
    "Tennessee Titans": { abbr: "TEN", color: "#0C2340" },
    "Washington Commanders": { abbr: "WAS", color: "#5A1414" }
  },

  // Fallback for unknown teams
  default: { abbr: "GEN", color: "#334155" },

  // Method to get assets
  get(name) {
    const data = this.nfl[name] || this.default;
    return {
      ...data,
      // Generates a logo using the team's initials and color
      logoUrl: `https://ui-avatars.com/api/?name=${data.abbr}&background=${data.color.replace('#', '')}&color=fff&size=64&font-size=0.4&length=3`
    };
  }
};

// Make it available globally
window.TeamAssets = TeamAssets;
