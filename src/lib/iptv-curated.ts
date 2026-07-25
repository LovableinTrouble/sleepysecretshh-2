// Curated 24/7 IPTV channels. Keep this list intentionally small and tested:
// every entry below returned a valid HLS manifest during verification. Streams
// flow through /api/public/iptv-proxy for CORS-safe playback.

export interface CuratedChannel {
  id: string;
  name: string;
  group: string;
  country: string;
  logo?: string;
  url: string;
}

const LOGO = "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries";

export const CURATED_CHANNELS: CuratedChannel[] = [
  // ── News · US ──────────────────────────────────────────────────────────
  {
    id: "cbsnews",
    name: "CBS News 24/7",
    group: "News",
    country: "US",
    logo: `${LOGO}/united-states/cbs-news-us.png`,
    url: "https://cbsn-us.cbsnstream.cbsnews.com/out/v1/55a8648e8f134e82a470f83d562deeca/master.m3u8",
  },
  {
    id: "newsmax",
    name: "Newsmax",
    group: "News",
    country: "US",
    logo: `${LOGO}/united-states/newsmax-us.png`,
    url: "https://nmxlive.akamaized.net/hls/live/529965/Live_1/index.m3u8",
  },
  {
    id: "scripps-news",
    name: "Scripps News",
    group: "News",
    country: "US",
    logo: `${LOGO}/united-states/scripps-news-us.png`,
    url: "https://content.uplynk.com/channel/1fbfb28ae5044f619f75ae0adb011989.m3u8",
  },
  {
    id: "bloomberg-us",
    name: "Bloomberg TV US",
    group: "News",
    country: "US",
    logo: `${LOGO}/united-states/bloomberg-tv-us.png`,
    url: "https://bloomberg.com/media-manifest/streams/us.m3u8",
  },

  // ── News · International ───────────────────────────────────────────────
  {
    id: "france24",
    name: "France 24 English",
    group: "News",
    country: "FR",
    logo: `${LOGO}/france/france-24-fr.png`,
    url: "https://live.france24.com/hls/live/2037218-b/F24_EN_HI_HLS/master_5000.m3u8",
  },
  {
    id: "dwenglish",
    name: "DW English",
    group: "News",
    country: "DE",
    logo: `${LOGO}/germany/dw-tv-de.png`,
    url: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8",
  },
  {
    id: "bloomberg-europe",
    name: "Bloomberg TV Europe",
    group: "News",
    country: "UK",
    logo: `${LOGO}/united-kingdom/bloomberg-tv-uk.png`,
    url: "https://bloomberg.com/media-manifest/streams/eu.m3u8",
  },
  {
    id: "bloomberg-asia",
    name: "Bloomberg TV Asia",
    group: "News",
    country: "INT",
    logo: `${LOGO}/united-states/bloomberg-tv-us.png`,
    url: "https://bloomberg.com/media-manifest/streams/asia.m3u8",
  },

  // ── Sports ─────────────────────────────────────────────────────────────
  {
    id: "redbull-tv",
    name: "Red Bull TV",
    group: "Sports",
    country: "INT",
    logo: `${LOGO}/united-states/red-bull-tv-us.png`,
    url: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
  },
  {
    id: "pac-12-insider",
    name: "Pac-12 Insider",
    group: "Sports",
    country: "US",
    logo: `${LOGO}/united-states/pac-12-network-us.png`,
    url: "https://pac12-samsungus.amagi.tv/playlist.m3u8",
  },
  {
    id: "outside-tv",
    name: "Outside TV",
    group: "Sports",
    country: "US",
    logo: `${LOGO}/united-states/outside-tv-us.png`,
    url: "https://outsidetv-oando.amagi.tv/playlist.m3u8",
  },

  // ── Entertainment ──────────────────────────────────────────────────────
  {
    id: "comet",
    name: "Comet TV",
    group: "Entertainment",
    country: "US",
    logo: `${LOGO}/united-states/comet-tv-us.png`,
    url: "https://fast-channels.sinclairstoryline.com/COMET/index.m3u8",
  },
  {
    id: "charge",
    name: "Charge!",
    group: "Entertainment",
    country: "US",
    logo: `${LOGO}/united-states/charge-us.png`,
    url: "https://fast-channels.sinclairstoryline.com/CHARGE/index.m3u8",
  },
  {
    id: "tbd",
    name: "TBD",
    group: "Entertainment",
    country: "US",
    logo: `${LOGO}/united-states/tbd-us.png`,
    url: "https://fast-channels.sinclairstoryline.com/TBD/index.m3u8",
  },

  // ── Lifestyle / Food ───────────────────────────────────────────────────
  {
    id: "bon-appetit",
    name: "Bon Appétit",
    group: "Lifestyle",
    country: "US",
    logo: `${LOGO}/united-states/bon-appetit-us.png`,
    url: "https://bonappetit-samsung.amagi.tv/playlist.m3u8",
  },
  {
    id: "pet-collective",
    name: "The Pet Collective",
    group: "Lifestyle",
    country: "US",
    logo: `${LOGO}/united-states/the-pet-collective-us.png`,
    url: "https://the-pet-collective-international-in.samsung.wurl.tv/playlist.m3u8",
  },

  // ── History / Documentary ──────────────────────────────────────────────
  {
    id: "timeline",
    name: "Timeline",
    group: "History",
    country: "UK",
    logo: `${LOGO}/united-kingdom/timeline-uk.png`,
    url: "https://lds-timeline-plex.amagi.tv/playlist.m3u8",
  },

  // ── Kids ───────────────────────────────────────────────────────────────
  {
    id: "pbskids",
    name: "PBS Kids",
    group: "Kids",
    country: "US",
    logo: `${LOGO}/united-states/pbs-kids-us.png`,
    url: "https://livestream.pbskids.org/out/v1/14507d931bbe48a69287e4850e53443c/est.m3u8",
  },
  {
    id: "moonbug",
    name: "Moonbug Kids",
    group: "Kids",
    country: "US",
    logo: `${LOGO}/united-states/moonbug-us.png`,
    url: "https://moonbug-rokuus.amagi.tv/playlist.m3u8",
  },

  // ── News · Premium additions ───────────────────────────────────────────
  {
    id: "abc-news-live",
    name: "ABC News Live",
    group: "News",
    country: "US",
    logo: `${LOGO}/united-states/abc-news-us.png`,
    url: "https://content.uplynk.com/channel/3324f2467c414329b3b0cc5cd987b6be.m3u8",
  },
  {
    id: "nbc-news-now",
    name: "NBC News NOW",
    group: "News",
    country: "US",
    logo: `${LOGO}/united-states/nbc-news-us.png`,
    url: "https://nbcnewsnow-samsung.amagi.tv/playlist.m3u8",
  },
  {
    id: "sky-news",
    name: "Sky News",
    group: "News",
    country: "UK",
    logo: `${LOGO}/united-kingdom/sky-news-uk.png`,
    url: "https://skynews2-plutolive-vo.akamaized.net/cdnAkamaiLive_201/Live_1/index.m3u8",
  },
  {
    id: "aljazeera-en",
    name: "Al Jazeera English",
    group: "News",
    country: "INT",
    logo: `${LOGO}/qatar/al-jazeera-english-qa.png`,
    url: "https://live-hls-web-aje.getaj.net/AJE/01.m3u8",
  },
  {
    id: "euronews-en",
    name: "Euronews English",
    group: "News",
    country: "INT",
    logo: `${LOGO}/france/euronews-english-fr.png`,
    url: "https://euronews-euronews-english-2-eu.rakuten.wurl.tv/playlist.m3u8",
  },
  {
    id: "cnbc",
    name: "CNBC",
    group: "News",
    country: "US",
    logo: `${LOGO}/united-states/cnbc-us.png`,
    url: "https://dai.google.com/linear/hls/event/Sid4xiTQTkCT1SLu6rjUSQ/master.m3u8",
  },

  // ── Sports · Premium additions ─────────────────────────────────────────
  {
    id: "fuel-tv",
    name: "Fuel TV",
    group: "Sports",
    country: "US",
    logo: `${LOGO}/united-states/fuel-tv-us.png`,
    url: "https://fuel-tv-fueltv-1-us.plex.wurl.tv/playlist.m3u8",
  },
  {
    id: "fight-network",
    name: "The Fight Network",
    group: "Sports",
    country: "US",
    logo: `${LOGO}/united-states/fight-network-us.png`,
    url: "https://fight-plex.amagi.tv/playlist.m3u8",
  },
  {
    id: "unbeaten",
    name: "Unbeaten",
    group: "Sports",
    country: "US",
    logo: `${LOGO}/united-states/unbeaten-us.png`,
    url: "https://unbeaten-samsungau.amagi.tv/playlist.m3u8",
  },
  {
    id: "stadium",
    name: "Stadium",
    group: "Sports",
    country: "US",
    logo: `${LOGO}/united-states/stadium-us.png`,
    url: "https://stadiumnational-samsung.amagi.tv/playlist.m3u8",
  },

  // ── Entertainment · Premium additions ──────────────────────────────────
  {
    id: "mst3k",
    name: "MST3K",
    group: "Entertainment",
    country: "US",
    logo: `${LOGO}/united-states/mst3k-us.png`,
    url: "https://mst3k-samsungus.amagi.tv/playlist.m3u8",
  },
  {
    id: "loving-life",
    name: "Loving Life",
    group: "Entertainment",
    country: "US",
    logo: `${LOGO}/united-states/loving-life-us.png`,
    url: "https://d1nemn5b1eywqi.cloudfront.net/lovinglife/playlist.m3u8",
  },
  {
    id: "wu-tang",
    name: "Wu-Tang Collection",
    group: "Entertainment",
    country: "US",
    logo: `${LOGO}/united-states/wu-tang-collection-us.png`,
    url: "https://cdn.pluto.tv/wu-tang/main.m3u8",
  },
  {
    id: "midnight-pulp",
    name: "Midnight Pulp",
    group: "Entertainment",
    country: "US",
    logo: `${LOGO}/united-states/midnight-pulp-us.png`,
    url: "https://midnightpulp-samsungus.amagi.tv/playlist.m3u8",
  },
  {
    id: "shout-factory",
    name: "Shout! Factory TV",
    group: "Entertainment",
    country: "US",
    logo: `${LOGO}/united-states/shout-factory-tv-us.png`,
    url: "https://shoutfactory-samsungus.amagi.tv/playlist.m3u8",
  },

  // ── Music ──────────────────────────────────────────────────────────────
  {
    id: "stingray-classica",
    name: "Stingray Classica",
    group: "Music",
    country: "INT",
    logo: `${LOGO}/canada/stingray-classica-ca.png`,
    url: "https://stirr-fast-stingray-classicaeurope.amagi.tv/playlist.m3u8",
  },
  {
    id: "xite",
    name: "XITE",
    group: "Music",
    country: "INT",
    logo: `${LOGO}/netherlands/xite-nl.png`,
    url: "https://xite-samsung.amagi.tv/playlist.m3u8",
  },

  // ── Lifestyle · Premium additions ──────────────────────────────────────
  {
    id: "tastemade",
    name: "Tastemade",
    group: "Lifestyle",
    country: "US",
    logo: `${LOGO}/united-states/tastemade-us.png`,
    url: "https://tastemade-us.samsung.wurl.tv/playlist.m3u8",
  },

  // ── History / Documentary · Premium additions ──────────────────────────
  {
    id: "real-wild",
    name: "Real Wild",
    group: "History",
    country: "UK",
    logo: `${LOGO}/united-kingdom/real-wild-uk.png`,
    url: "https://lds-realwild-plex.amagi.tv/playlist.m3u8",
  },
  {
    id: "abandoned",
    name: "Abandoned Places",
    group: "History",
    country: "UK",
    logo: `${LOGO}/united-kingdom/timeline-uk.png`,
    url: "https://lds-abandonedplaces-plex.amagi.tv/playlist.m3u8",
  },
];

export const CURATED_GROUPS = ["News", "Sports", "Entertainment", "Music", "Lifestyle", "History", "Kids"];
