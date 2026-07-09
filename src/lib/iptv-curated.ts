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
];

export const CURATED_GROUPS = ["News", "Sports", "Entertainment", "Lifestyle", "History", "Kids"];
