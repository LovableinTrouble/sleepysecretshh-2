// Curated mainstream IPTV channels. Only widely-recognized brands whose
// streams come directly from the broadcaster's own public CDN (Akamai,
// Uplynk, broadcaster-owned origins). No Pluto-slug guessing, no
// community-sourced random channel lists — every entry below is a
// well-known, household-name network with a 24/7 public live feed.
// The player proxies every URL through /api/public/iptv-proxy.

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
  { id: "abcnewslive", name: "ABC News Live", group: "News", country: "US",
    logo: `${LOGO}/united-states/abc-news-us.png`,
    url: "https://content.uplynk.com/channel/3c367669a83b4cdab20cceefac253c5d.m3u8" },
  { id: "cbsnews", name: "CBS News 24/7", group: "News", country: "US",
    logo: `${LOGO}/united-states/cbs-news-us.png`,
    url: "https://cbsn-us.cbsnstream.cbsnews.com/out/v1/55a8648e8f134e82a470f83d562deeca/master.m3u8" },
  { id: "nbcnewsnow", name: "NBC News NOW", group: "News", country: "US",
    logo: `${LOGO}/united-states/nbc-news-now-us.png`,
    url: "https://nbcnews2.akamaized.net/hls/live/723426/NBCNewsPlaymaker24x7Linear2HD/master.m3u8" },
  { id: "newsmax", name: "Newsmax", group: "News", country: "US",
    logo: `${LOGO}/united-states/newsmax-us.png`,
    url: "https://nmxlive.akamaized.net/hls/live/529965/Live_1/index.m3u8" },

  // ── News · International ───────────────────────────────────────────────
  { id: "skynews", name: "Sky News", group: "News", country: "UK",
    logo: `${LOGO}/united-kingdom/sky-news-uk.png`,
    url: "https://linear417-gb-hls1-prd-ak.cdn.skycdp.com/100e/Content/HLS_001_1080_30/Live/channel(skynews)/index_1080-30.m3u8" },
  { id: "france24", name: "France 24 English", group: "News", country: "FR",
    logo: `${LOGO}/france/france-24-fr.png`,
    url: "https://live.france24.com/hls/live/2037218-b/F24_EN_HI_HLS/master_5000.m3u8" },
  { id: "dwenglish", name: "DW English", group: "News", country: "DE",
    logo: `${LOGO}/germany/dw-tv-de.png`,
    url: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8" },
  { id: "aljazeera", name: "Al Jazeera English", group: "News", country: "QA",
    logo: `${LOGO}/qatar/al-jazeera-english-qa.png`,
    url: "https://live-hls-web-aje.getaj.net/AJE/01.m3u8" },
  { id: "nhkworld", name: "NHK World Japan", group: "News", country: "JP",
    logo: `${LOGO}/japan/nhk-world-jp.png`,
    url: "https://nhkwlive-ojp.akamaized.net/hls/live/2003459/nhkwlive-ojp-en/index.m3u8" },
  { id: "cbcnews", name: "CBC News Network", group: "News", country: "CA",
    logo: `${LOGO}/canada/cbc-news-network-ca.png`,
    url: "https://cbcrclinear-tor.akamaized.net/hls/live/2042769/geo_allow_ca/CBCRCLINEAR_TOR_15/master5.m3u8" },

  // ── Sports ─────────────────────────────────────────────────────────────
  { id: "redbull-tv", name: "Red Bull TV", group: "Sports", country: "INT",
    logo: `${LOGO}/united-states/red-bull-tv-us.png`,
    url: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8" },

  // ── Entertainment ──────────────────────────────────────────────────────
  { id: "comet", name: "Comet TV", group: "Entertainment", country: "US",
    logo: `${LOGO}/united-states/comet-tv-us.png`,
    url: "https://fast-channels.sinclairstoryline.com/COMET/index.m3u8" },
  { id: "charge", name: "Charge!", group: "Entertainment", country: "US",
    logo: `${LOGO}/united-states/charge-us.png`,
    url: "https://fast-channels.sinclairstoryline.com/CHARGE/index.m3u8" },
  { id: "courttv", name: "Court TV", group: "Entertainment", country: "US",
    logo: `${LOGO}/united-states/court-tv-us.png`,
    url: "https://content.uplynk.com/channel/9d8acf3f0c7c4c809f5305a6e0091cbe.m3u8" },

  // ── Lifestyle ──────────────────────────────────────────────────────────
  { id: "tastemade", name: "Tastemade", group: "Lifestyle", country: "US",
    logo: `${LOGO}/united-states/tastemade-us.png`,
    url: "https://tastemadessai.akamaized.net/amagi_hls_data_tastemade-tastemade/CDN/playlist.m3u8" },

  // ── Kids ───────────────────────────────────────────────────────────────
  { id: "pbskids", name: "PBS Kids", group: "Kids", country: "US",
    logo: `${LOGO}/united-states/pbs-kids-us.png`,
    url: "https://livestream.pbskids.org/out/v1/14507d931bbe48a69287e4850e53443c/est.m3u8" },
];

export const CURATED_GROUPS = [
  "News",
  "Sports",
  "Entertainment",
  "Lifestyle",
  "Kids",
];
