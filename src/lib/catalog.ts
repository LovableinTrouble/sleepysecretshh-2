// Curated demo catalog. Real catalog plugs in via TMDB key in Settings.
// Images use TMDB's public CDN (no key required).
export type MediaKind = "movie" | "tv" | "anime" | "sports";

export interface Media {
  id: number; // tmdb id
  imdbId?: string;
  type: MediaKind;
  title: string;
  year: string;
  rating: number;
  runtime?: string;
  overview: string;
  poster: string;   // /w500
  backdrop: string; // /original
  genres: string[];
  studios?: string[];
  cast?: { id?: number; name: string; role: string; img?: string }[];
  seasons?: { number: number; episodes: Episode[] }[];
}

export interface Episode {
  number: number;
  title: string;
  overview: string;
  still: string;
  runtime: string;
}

const img = (p: string) => `https://image.tmdb.org/t/p/w780${p}`;
const back = (p: string) => `https://image.tmdb.org/t/p/original${p}`;

const ep = (n: number, title: string, overview: string, still: string, runtime = "48m"): Episode => ({
  number: n, title, overview, still: img(still), runtime,
});

const seasonOf = (n: number, count: number, base: string): { number: number; episodes: Episode[] } => ({
  number: n,
  episodes: Array.from({ length: count }, (_, i) =>
    ep(i + 1, `Episode ${i + 1}`, "A turning point reshapes the path forward as alliances are tested and secrets surface.", base)
  ),
});

export const CATALOG: Media[] = [
  {
    id: 1184918, type: "movie", title: "The Wild Robot", year: "2024", rating: 8.4, runtime: "1h 42m",
    overview: "After a shipwreck, an intelligent robot called Roz is stranded on an uninhabited island. To survive, she must adapt and form a relationship with the local wildlife.",
    poster: img("/wTnV3PCVW5O92JMrFvvrRsV7iyldd.jpg"),
    backdrop: back("/zEt7yj7M0i7vmRJlw3pTLIVCnUF.jpg"),
    genres: ["Animation", "Sci-Fi", "Family"],
    cast: [
      { name: "Lupita Nyong'o", role: "Roz (voice)" },
      { name: "Pedro Pascal", role: "Fink (voice)" },
      { name: "Kit Connor", role: "Brightbill (voice)" },
    ],
  },
  {
    id: 558449, type: "movie", title: "Gladiator II", year: "2024", rating: 7.2, runtime: "2h 28m",
    overview: "Years after witnessing the death of the revered hero Maximus, Lucius is forced to enter the Colosseum after his home is conquered by the tyrannical Emperors who now lead Rome.",
    poster: img("/2cxhvwyEwRlysAmRH4iodkvo0z5.jpg"),
    backdrop: back("/euYIwmwkmz95mnXvufEmbL6ovhZ.jpg"),
    genres: ["Action", "Drama", "Adventure"],
  },
  {
    id: 912649, type: "movie", title: "Venom: The Last Dance", year: "2024", rating: 6.4, runtime: "1h 49m",
    overview: "Eddie and Venom are on the run. Hunted by both of their worlds and with the net closing in, the duo are forced into a devastating decision.",
    poster: img("/aosm8NMQ3UyoBVpSxyimorCQykC.jpg"),
    backdrop: back("/3V4kLQg0kSqPLctI5ziYWabAZYF.jpg"),
    genres: ["Action", "Sci-Fi"],
  },
  {
    id: 1241982, type: "movie", title: "Moana 2", year: "2024", rating: 7.0, runtime: "1h 40m",
    overview: "After receiving an unexpected call from her wayfinding ancestors, Moana must journey to the far seas of Oceania for an adventure unlike anything she's ever faced.",
    poster: img("/yh64qw9mgXBvlaWDi7Q9tpUBAvH.jpg"),
    backdrop: back("/tElnmtQ6yz1PjN1kePNl8yMSb59.jpg"),
    genres: ["Animation", "Adventure", "Family"],
  },
  {
    id: 845781, type: "movie", title: "Red One", year: "2024", rating: 7.0, runtime: "2h 3m",
    overview: "After Santa Claus is kidnapped, the North Pole's Head of Security must team up with the world's most infamous bounty hunter to save Christmas.",
    poster: img("/cdqLnri3NEGcmfnqwk2TSIYtddg.jpg"),
    backdrop: back("/qVNk3yIQrSGoEEEZQ7ZTSGEukpf.jpg"),
    genres: ["Action", "Comedy"],
  },
  {
    id: 933260, type: "movie", title: "The Substance", year: "2024", rating: 7.3, runtime: "2h 21m",
    overview: "A fading celebrity decides to use a black market drug, a cell-replicating substance that temporarily creates a younger, better version of herself.",
    poster: img("/lqoMzCcZYEFK729d6qzt349fB4o.jpg"),
    backdrop: back("/t98L9uphqBSNn2Mkvdm3xSFCQyi.jpg"),
    genres: ["Horror", "Drama", "Sci-Fi"],
  },

  // TV
  {
    id: 94997, type: "tv", title: "House of the Dragon", year: "2022", rating: 8.4,
    overview: "The Targaryen dynasty is at the absolute apex of its power, with more than 15 dragons under their yoke. Most empires crumble from such heights.",
    poster: img("/7QMsOTMUswlwxJP0rTTZfmz2tX2.jpg"),
    backdrop: back("/etj8E2o0Bud0HkONVQPjyCkIvpv.jpg"),
    genres: ["Drama", "Fantasy"],
    seasons: [seasonOf(1, 10, "/etj8E2o0Bud0HkONVQPjyCkIvpv.jpg"), seasonOf(2, 8, "/etj8E2o0Bud0HkONVQPjyCkIvpv.jpg")],
  },
  {
    id: 76479, type: "tv", title: "The Boys", year: "2019", rating: 8.4,
    overview: "A group of vigilantes set out to take down corrupt superheroes who abuse their superpowers.",
    poster: img("/2zmTngn1tYC1AvfnrFLhxeD82hz.jpg"),
    backdrop: back("/mGVrXeIjyecj6TKmwPVpHlscEmw.jpg"),
    genres: ["Action", "Sci-Fi"],
    seasons: [seasonOf(1, 8, "/mGVrXeIjyecj6TKmwPVpHlscEmw.jpg"), seasonOf(2, 8, "/mGVrXeIjyecj6TKmwPVpHlscEmw.jpg"), seasonOf(3, 8, "/mGVrXeIjyecj6TKmwPVpHlscEmw.jpg"), seasonOf(4, 8, "/mGVrXeIjyecj6TKmwPVpHlscEmw.jpg")],
  },
  {
    id: 100088, type: "tv", title: "The Last of Us", year: "2023", rating: 8.7,
    overview: "Twenty years after modern civilization has been destroyed, Joel, a hardened survivor, is hired to smuggle Ellie, a 14-year-old girl, out of an oppressive quarantine zone.",
    poster: img("/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg"),
    backdrop: back("/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg"),
    genres: ["Drama", "Sci-Fi"],
    seasons: [seasonOf(1, 9, "/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg"), seasonOf(2, 7, "/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg")],
  },
  {
    id: 1399, type: "tv", title: "Game of Thrones", year: "2011", rating: 8.5,
    overview: "Seven noble families fight for control of the mythical land of Westeros.",
    poster: img("/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg"),
    backdrop: back("/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg"),
    genres: ["Drama", "Fantasy"],
    seasons: [seasonOf(1, 10, "/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg")],
  },
  {
    id: 1396, type: "tv", title: "Breaking Bad", year: "2008", rating: 8.9,
    overview: "When Walter White, a chemistry teacher, is diagnosed with Stage III cancer, he turns to a life of crime, producing and selling methamphetamine.",
    poster: img("/ggFHVNu6YYI5L9pCfOacjizRGt.jpg"),
    backdrop: back("/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg"),
    genres: ["Drama", "Crime"],
    seasons: [seasonOf(1, 7, "/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg")],
  },

  // Anime
  {
    id: 95479, type: "anime", title: "Jujutsu Kaisen", year: "2020", rating: 8.5,
    overview: "A boy swallows a cursed talisman - the finger of a demon - and becomes cursed himself.",
    poster: img("/fHpKWq9ayzSk8nSwqRuaAUemRKh.jpg"),
    backdrop: back("/fHpKWq9ayzSk8nSwqRuaAUemRKh.jpg"),
    genres: ["Animation", "Action"],
    seasons: [seasonOf(1, 24, "/fHpKWq9ayzSk8nSwqRuaAUemRKh.jpg")],
  },
  {
    id: 85937, type: "anime", title: "Demon Slayer", year: "2019", rating: 8.7,
    overview: "A family is attacked by demons and only two members survive - Tanjiro and his sister Nezuko, who is turning into a demon slowly.",
    poster: img("/xUfRZu2mi8jH6SzQEJGP6tjBuYj.jpg"),
    backdrop: back("/nTvM4mhqNlHIvUkI1gVnW6XP7GG.jpg"),
    genres: ["Animation", "Action"],
    seasons: [seasonOf(1, 26, "/nTvM4mhqNlHIvUkI1gVnW6XP7GG.jpg")],
  },
  {
    id: 1429, type: "anime", title: "Attack on Titan", year: "2013", rating: 8.7,
    overview: "Several hundred years ago, humans were nearly exterminated by titans.",
    poster: img("/sHim6U0ANaKTr3hkSF3lCcrHKEK.jpg"),
    backdrop: back("/8OFhCfhepXjefiTaPLisxAjkk2D.jpg"),
    genres: ["Animation", "Action", "Drama"],
    seasons: [seasonOf(1, 25, "/8OFhCfhepXjefiTaPLisxAjkk2D.jpg")],
  },
  {
    id: 30984, type: "anime", title: "Bleach", year: "2004", rating: 8.2,
    overview: "Ichigo Kurosaki gains soul reaper powers and takes on the duty of defending humans from evil spirits.",
    poster: img("/2EewmxXe72ogD0EaWM8gqa0ccIw.jpg"),
    backdrop: back("/r5dQRfPgRsil9oFTGT3qf7can2I.jpg"),
    genres: ["Animation", "Action"],
    seasons: [seasonOf(1, 20, "/r5dQRfPgRsil9oFTGT3qf7can2I.jpg")],
  },

];

export const featured = CATALOG[0];

export const trendingNow = CATALOG.slice(0, 8);
export const topMovies = CATALOG.filter((m) => m.type === "movie");
export const topTV = CATALOG.filter((m) => m.type === "tv");
export const topAnime = CATALOG.filter((m) => m.type === "anime");

export function findById(id: number) {
  return CATALOG.find((m) => m.id === id);
}

export function similarTo(media: Media, count = 6) {
  return CATALOG
    .filter((m) => m.id !== media.id)
    .map((m) => ({
      m,
      score: m.genres.filter((g) => media.genres.includes(g)).length + (m.type === media.type ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.m);
}

export function searchCatalog(q: string) {
  const s = q.toLowerCase().trim();
  if (!s) return [];
  return CATALOG.filter(
    (m) => m.title.toLowerCase().includes(s) || m.genres.some((g) => g.toLowerCase().includes(s))
  );
}
