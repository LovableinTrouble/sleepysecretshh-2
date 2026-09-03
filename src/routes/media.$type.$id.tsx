/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Episode, Media, MediaKind } from "@/lib/catalog";
import { DownloadsDialog } from "@/components/DownloadsDialog";
import { MediaCard } from "@/components/MediaCard";
import { getWatchlist, toggleWatchlist } from "@/lib/store";
import {
  fetchCredits,
  fetchExtraDetails,
  fetchMediaById,
  fetchSimilar,
  fetchTvDetails,
  fetchTvSeasonEpisodes,
  fetchWatchProviders,
  type ExtraDetails,
  type WatchProvider,
} from "@/lib/tmdb";

import { loadStashedMedia, stashWatchMedia } from "@/lib/watch-stash";

export const Route = createFileRoute("/media/$type/$id")({
  head: () => ({ meta: [{ title: "Title Details — Sleepy" }] }),
  component: MediaPage,
});

function MediaPage() {
  const { id, type } = Route.useParams();
  const navigate = useNavigate();
  const mediaId = Number(id);
  const mediaType = type as MediaKind;
  const [media, setMedia] = useState<Media | null>(null);
  const [extra, setExtra] = useState<ExtraDetails | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [episodesShown, setEpisodesShown] = useState(3);
  const [wl, setWl] = useState<number[]>([]);
  const [similar, setSimilar] = useState<Media[]>([]);
  const [similarShown, setSimilarShown] = useState(8);

  const [cast, setCast] = useState<{ id?: number; name: string; role: string; img?: string }[]>([]);
  const [seasons, setSeasons] = useState<{ number: number }[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  const [providers, setProviders] = useState<WatchProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [downloadEpisode, setDownloadEpisode] = useState<number | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    setMedia(null);
    setExtra(null);
    setSimilar([]);
    setSimilarShown(8);

    setCast([]);
    setProviders([]);
    setSeasons([]);
    setEpisodes([]);
    setError(null);
    setWl(getWatchlist());
    const cached = loadStashedMedia(mediaId);
    const load =
      cached && cached.type === mediaType
        ? Promise.resolve(cached)
        : fetchMediaById(mediaId, mediaType);
    load
      .then((m) => {
        if (dead) return;
        setMedia(m);
        stashWatchMedia(m);
        setCast(m.cast ?? []);
        fetchSimilar(m)
          .then((items) => !dead && setSimilar(items))
          .catch(() => {});
        fetchCredits(m)
          .then((credits) => !dead && credits.length && setCast(credits))
          .catch(() => {});
        fetchWatchProviders(m.id, m.type)
          .then((p) => !dead && setProviders(p))
          .catch(() => {});
        fetchExtraDetails(m.id, m.type)
          .then((d) => !dead && setExtra(d))
          .catch(() => {});
        if (m.type === "tv" || m.type === "anime")
          fetchTvDetails(m.id)
            .then((d) => !dead && setSeasons(d.seasons))
            .catch(() => {});
      })
      .catch((e) => !dead && setError(e?.message || "Couldn't load title"));
    return () => {
      dead = true;
    };
  }, [mediaId, mediaType]);

  useEffect(() => {
    if (!media || !(media.type === "tv" || media.type === "anime")) return;
    setEpisodesShown(3);
    fetchTvSeasonEpisodes(media.id, season)
      .then(setEpisodes)
      .catch(() => setEpisodes([]));
  }, [media, season]);

  const goBack = () => {
    if (typeof window === "undefined") {
      navigate({ to: "/" });
      return;
    }
    const referrer = document.referrer;
    const sameOrigin = referrer && referrer.startsWith(window.location.origin);
    if (sameOrigin && window.history.length > 1) {
      window.history.back();
    } else {
      navigate({ to: "/" });
    }
  };

  const handleWatchParty = async () => {
    if (typeof window === "undefined") return;
    const roomId = Math.random().toString(36).slice(2, 8);
    const u = new URL(window.location.href);
    u.pathname = `/watch/${mediaId}`;
    u.search = "";
    u.searchParams.set("t", mediaType);
    if (isSeries) {
      u.searchParams.set("s", String(season));
      u.searchParams.set("e", String(episode));
    }
    u.searchParams.set("party", roomId);
    const link = u.toString();
    try {
      await navigator.clipboard.writeText(link);
      setShareToast("Watch-party link copied!");
    } catch {
      setShareToast(`Room ${roomId} ready`);
    }
    setTimeout(() => setShareToast(null), 2400);
    if (media) stashWatchMedia(media);
    // Stay in-app — navigate to the watch route in the same tab.
    navigate({
      to: "/watch/$id",
      params: { id: String(mediaId) },
      search: {
        t: mediaType,
        ...(isSeries ? { s: season, e: episode } : {}),
        // Pass the party id via URL — the player reads `party` from window.location.
        party: roomId,
      } as any,
    });
  };

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const link = window.location.href;
    const title = media?.title ?? "Watch on Sleepy";
    if (navigator.share) {
      try {
        await navigator.share({ title, url: link });
        return;
      } catch {
        /* no-op */
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setShareToast("Link copied!");
    } catch {
      setShareToast("Couldn't copy link");
    }
    setTimeout(() => setShareToast(null), 1800);
  };

  if (!media) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <BackButton onClick={goBack} />
        <div>
          <div className="text-xs uppercase tracking-[0.4em] text-primary/70">
            {error ? "Error" : "Loading"}
          </div>
          <h1 className="mt-3 text-2xl font-black">{error ?? "Preparing title details…"}</h1>
        </div>
      </main>
    );
  }

  const isSeries = media.type === "tv" || media.type === "anime";
  const inWl = wl.includes(media.id);
  const studios = media.studios?.length
    ? media.studios
    : extra?.networks?.length
      ? extra.networks
      : [isSeries ? "Network details unavailable" : "Studio details unavailable"];

  return (
    <main className="min-w-0 overflow-x-clip pb-8">
      <BackButton onClick={goBack} />

      {shareToast && (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-[#1a1a24] px-5 py-2.5 text-sm font-medium text-white shadow-xl ring-1 ring-white/12 animate-toast-in">
          {shareToast}
        </div>
      )}

      {/* HERO */}
      <section className="relative z-20 w-full overflow-clip">
        <div className="absolute inset-0">
          <img
            src={media.backdrop || media.poster}
            alt=""
            className="h-full w-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/35 to-transparent" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(110% 80% at 12% 100%, color-mix(in oklab, var(--primary) 12%, transparent) 0%, transparent 58%)",
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
        </div>

        <div className="relative mx-auto flex min-h-[520px] max-w-7xl flex-col justify-end px-5 pb-10 pt-24 sm:px-6 md:min-h-[560px] md:px-10 md:pb-11 md:pt-28">

          <div className="grid items-end gap-7 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-9">
            <div className="hidden md:block">
              <div className="relative">
                <div className="absolute -inset-3 rounded-[28px] bg-primary/20 blur-2xl" />
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[22px] ring-1 ring-white/20 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.95)]">
                  <img
                    src={media.poster || media.backdrop}
                    alt={media.title}
                    className="h-full w-full object-cover"
                    loading="eager"
                  />
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary ring-1 ring-primary/30">
                  {isSeries ? "Series" : "Film"}
                </span>
                {extra?.contentRating && (
                  <span className="rounded-full border border-white/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-foreground/80">
                    {extra.contentRating}
                  </span>
                )}
              </div>

              <h1 className="max-w-full break-words text-balance text-4xl font-black leading-[0.98] tracking-normal sm:text-5xl md:text-[4rem] md:leading-[0.95]">
                {media.title}
              </h1>

              {extra?.tagline && (
                <p className="max-w-xl text-sm italic text-foreground/50">{extra.tagline}</p>
              )}

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] font-semibold text-foreground/70">
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-primary">
                    <path d="M12 2l2.9 6.1 6.7.9-4.9 4.6 1.2 6.6L12 17.1 6.1 20.2l1.2-6.6L2.4 9l6.7-.9z" />
                  </svg>
                  {media.rating.toFixed(1)}
                </span>
                <span className="text-foreground/25">•</span>
                <span>{media.year}</span>
                {media.runtime && (
                  <>
                    <span className="text-foreground/25">•</span>
                    <span>{media.runtime}</span>
                  </>
                )}
              </div>

              {media.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {media.genres.slice(0, 4).map((g) => (
                    <span
                      key={g}
                      className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-foreground/75 ring-1 ring-white/10"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}



              <div className="flex max-w-full flex-wrap items-center gap-2 pt-1.5">
                <Link
                  to="/watch/$id"
                  params={{ id: String(media.id) }}
                  search={{
                    t: media.type,
                    s: isSeries ? season : undefined,
                    e: isSeries ? episode : undefined,
                    party: undefined,
                  }}
                  onClick={() => stashWatchMedia(media)}
                   className="liquid-pill group/btn relative z-10 inline-flex h-12 shrink-0 items-center gap-2.5 rounded-full px-6 text-[15px] font-bold transition-all duration-500 ease-out hover:scale-[1.02] sm:mr-1 sm:px-7"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 fill-current transition-transform duration-500 ease-out group-hover/btn:scale-110"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play {isSeries && `S${season} · E${episode}`}
                </Link>

                <button
                  type="button"
                  onClick={() => setWl(toggleWatchlist(media.id))}
                  aria-label={inWl ? "Remove from watchlist" : "Add to watchlist"}
                  title={inWl ? "In watchlist" : "Add to watchlist"}
                  className={`liquid-icon inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all duration-500 ease-out hover:scale-[1.04] ${
                    inWl ? "border-primary/50 bg-primary/20 text-foreground ring-1 ring-primary/30" : ""
                  }`}
                >
                  {inWl ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-[18px] w-[18px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-[18px] w-[18px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 5v14m-7-7h14" />
                    </svg>
                  )}
                </button>

                {extra?.trailerKey && (
                  <IconBtn onClick={() => setTrailerOpen(true)} label="Trailer">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-[18px] w-[18px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                  </IconBtn>
                )}
                <IconBtn onClick={handleShare} label="Share">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[18px] w-[18px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </IconBtn>
                <DownloadButton onClick={() => setDownloadsOpen(true)} />
                {extra?.imdbId && (
                  <a
                    href={`https://www.imdb.com/title/${extra.imdbId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="IMDb"
                    title="IMDb"
                    className="liquid-icon inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[10px] font-black tracking-wider text-yellow-300 transition-all duration-500 ease-out hover:scale-[1.04] hover:border-yellow-300/40 hover:bg-yellow-300/15"
                  >
                    IMDb
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* CONTENT */}
      <section className="relative z-0 mx-auto grid min-w-0 max-w-7xl gap-8 px-5 pb-36 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10 lg:px-10 lg:pb-28 lg:pt-10">
        <div className="min-w-0 space-y-10 md:space-y-12">
          <div className="animate-soft-rise">
            <SectionHeading kicker="Story" title={isSeries ? "About the series" : "About the film"} />
            <p className="mt-3 max-w-3xl text-[15px] leading-[1.75] text-foreground/75">
              {media.overview || "No synopsis available for this title yet."}
            </p>
          </div>

          {cast.length > 0 && <PeopleStrip title="Cast" people={cast} />}

          {isSeries && (
            <div className="animate-soft-rise">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <SectionHeading
                  kicker={`Season ${season}${episodes.length ? ` · ${episodes.length} episodes` : ""}`}
                  title="Episodes"
                />
                {seasons.length > 0 && (
                  <SeasonPicker
                    seasons={seasons}
                    value={season}
                    onChange={(s) => {
                      setSeason(s);
                      setEpisode(1);
                    }}
                  />
                )}
              </div>
              <div className="space-y-2.5">
                {episodes.slice(0, episodesShown).map((ep, i) => (
                  <div
                    key={ep.number}
                    style={{ animationDelay: `${i * 40}ms` }}
                    className={`group relative grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)_2.25rem] items-center gap-3 rounded-2xl p-3 transition-all duration-200 animate-soft-rise sm:grid-cols-[8rem_minmax(0,1fr)_2.25rem] sm:gap-4 ${ep.number === episode ? "bg-primary/15 ring-1 ring-primary/40 shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--primary)_50%,transparent)]" : "ring-1 ring-white/[0.05] hover:bg-white/[0.05] hover:ring-white/15"}`}
                  >
                    <Link
                      to="/watch/$id"
                      params={{ id: String(media.id) }}
                      search={{ t: media.type, s: season, e: ep.number, party: undefined }}
                      onClick={() => stashWatchMedia(media)}
                      className="absolute inset-0 z-0 rounded-2xl"
                      aria-label={`Play episode ${ep.number}`}
                    />
                    <div className="relative z-[1] aspect-video w-full overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10 pointer-events-none">
                      {ep.still && (
                        <img
                          src={ep.still}
                          alt=""
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                      )}
                      <span className="absolute left-1.5 top-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
                        E{ep.number}
                      </span>
                    </div>
                    <div className="relative z-[1] min-w-0 flex-1 pointer-events-none">
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2">
                        <span className="truncate text-sm font-semibold">{ep.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{ep.runtime}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {ep.overview}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDownloadEpisode(ep.number);
                        setDownloadsOpen(true);
                      }}
                      title={`Download S${season} · E${ep.number}`}
                      aria-label={`Download episode ${ep.number}`}
                      className="relative z-[2] grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 ring-1 ring-white/10 transition hover:bg-primary/30 hover:text-white hover:ring-primary/40"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 3v12" />
                        <path d="m7 10 5 5 5-5" />
                        <path d="M5 21h14" />
                      </svg>
                    </button>
                  </div>
                ))}
                {episodes.length === 0 && (
                  <div className="rounded-2xl border border-white/10 p-8 text-center text-sm text-muted-foreground">
                    Loading episodes…
                  </div>
                )}
                {episodes.length > episodesShown && (
                  <button
                    onClick={() => setEpisodesShown((n) => n + 6)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-sm font-semibold text-foreground/85 transition hover:bg-white/[0.08] hover:border-white/20"
                  >
                    Load {Math.min(6, episodes.length - episodesShown)} more ·{" "}
                    {episodes.length - episodesShown} remaining
                  </button>
                )}
                {episodes.length > 3 && episodesShown > 3 && (
                  <button
                    onClick={() => setEpisodesShown(3)}
                    className="w-full rounded-2xl py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          )}

          {similar.length > 0 && (
            <div>
              <SectionHeading kicker="Recommended" title="More like this" />
              <div className="mt-3 grid grid-cols-2 gap-4 pt-1 sm:grid-cols-3 lg:grid-cols-4">
                {similar.slice(0, similarShown).map((m) => (
                  <MediaCard key={`${m.type}-${m.id}`} media={m} />
                ))}
              </div>
              {similarShown < similar.length && (
                <button
                  type="button"
                  onClick={() => setSimilarShown((n) => n + 8)}
                  className="liquid-glass mt-4 w-full rounded-2xl py-3 text-xs font-bold uppercase tracking-[0.18em] text-foreground/80 transition-all duration-500 ease-out hover:text-foreground"
                >
                  Load more
                </button>
              )}
            </div>
          )}

        </div>

        <aside className="min-w-0 self-start space-y-4 animate-soft-rise lg:sticky lg:top-24 lg:h-fit lg:pb-2">
          <div className="media-sidebar-card rounded-[26px] p-5">
            <div className="flex items-center gap-3">
              <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/12">
                <img
                  src={media.poster || media.backdrop}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <h2 className="break-words text-sm font-black tracking-tight">{media.title}</h2>
                <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                  {isSeries ? "TV Series" : "Movie"} · {media.year}
                </p>
              </div>
              <span className="media-info-chip ml-auto shrink-0 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider text-foreground">
                {extra?.contentRating || "NR"}
              </span>
            </div>
          </div>

          <div className="media-sidebar-card rounded-[26px] p-5">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Where to watch
            </h3>
            {providers.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {providers.map((p) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={p.name}
                    className="liquid-glass group flex min-w-0 items-center gap-2 rounded-2xl p-2 transition hover:ring-primary/40"
                  >
                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                      <img src={p.logo} alt={p.name} className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-foreground">
                        {p.name}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {p.access || "Watch"}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <WhereToWatchFallback media={media} extra={extra} />
            )}
          </div>

          <div className="media-sidebar-card space-y-2 rounded-[26px] p-5 text-sm">
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Details
            </h3>
            {extra?.status && <Detail k="Status" v={extra.status} />}
            {extra?.originalLanguage && (
              <Detail k="Original language" v={extra.originalLanguage.toUpperCase()} />
            )}
            {isSeries ? (
              <>
                {extra?.firstAirDate && <Detail k="First aired" v={extra.firstAirDate} />}
                {extra?.lastAirDate && <Detail k="Last aired" v={extra.lastAirDate} />}
                {extra?.numberOfSeasons ? (
                  <Detail k="Seasons" v={String(extra.numberOfSeasons)} />
                ) : null}
                {extra?.numberOfEpisodes ? (
                  <Detail k="Episodes" v={String(extra.numberOfEpisodes)} />
                ) : null}
              </>
            ) : (
              <>{extra?.releaseDate && <Detail k="Released" v={extra.releaseDate} />}</>
            )}
            {extra?.originalTitle && extra.originalTitle !== media.title && (
              <Detail k="Original title" v={extra.originalTitle} />
            )}
            {extra?.budget ? <Detail k="Budget" v={fmtMoney(extra.budget)} /> : null}
            {extra?.revenue ? <Detail k="Revenue" v={fmtMoney(extra.revenue)} /> : null}
          </div>

          <div className="media-sidebar-card space-y-5 rounded-[26px] p-5">
            <InfoBlock title={isSeries ? "Networks" : "Studios"} items={studios} />
            {extra?.spokenLanguages?.length ? (
              <InfoBlock title="Languages" items={extra.spokenLanguages} />
            ) : null}
            {extra?.productionCountries?.length ? (
              <InfoBlock title="Countries" items={extra.productionCountries} />
            ) : null}
            {extra?.createdBy?.length ? (
              <InfoBlock title="Created by" items={extra.createdBy} />
            ) : null}
          </div>

          {extra?.homepage && (
            <a
              href={extra.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="liquid-glass block break-words rounded-full px-3 py-2.5 text-center text-xs font-semibold text-primary transition"
            >
              Official site
            </a>
          )}
        </aside>
      </section>


      {trailerOpen && extra?.trailerKey && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 animate-fade-in"
          onClick={() => setTrailerOpen(false)}
        >
          <button
            onClick={() => setTrailerOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white ring-1 ring-white/20 hover:bg-black/80"
            aria-label="Close trailer"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
          <div
            className="aspect-video w-full max-w-5xl overflow-hidden rounded-2xl ring-1 ring-white/15"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`https://www.youtube.com/embed/${extra.trailerKey}?autoplay=1&rel=0`}
              title="Trailer"
              className="h-full w-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
      <DownloadsDialog
        open={downloadsOpen}
        media={media}
        season={isSeries ? season : undefined}
        episode={isSeries ? (downloadEpisode ?? episode) : undefined}
        onClose={() => {
          setDownloadsOpen(false);
          setDownloadEpisode(null);
        }}
      />
    </main>
  );
}

function SeasonPicker({
  seasons,
  value,
  onChange,
}: {
  seasons: { number: number }[];
  value: number;
  onChange: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (seasons.length <= 1) {
    return (
      <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-white/10">
        Season {value}
      </span>
    );
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-sm font-semibold ring-1 ring-white/10 transition hover:bg-white/[0.12] hover:ring-white/20"
      >
        <span>Season {value}</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-full z-50 mt-2 max-h-72 w-44 overflow-y-auto rounded-2xl border border-white/10 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl animate-modal-in">
            {seasons.map((s) => (
              <button
                key={s.number}
                type="button"
                onClick={() => {
                  onChange(s.number);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${s.number === value ? "bg-primary/20 font-semibold text-foreground" : "text-foreground/85 hover:bg-white/[0.06]"}`}
              >
                <span>Season {s.number}</span>
                {s.number === value && (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                  >
                    <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      type="button"
      aria-label="Back"
      className="fixed left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/15 backdrop-blur transition-all duration-500 ease-out hover:scale-[1.04] hover:bg-black/85 hover:ring-white/30 md:left-6 md:top-5"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
      >
        <path d="M15 18 9 12l6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function PeopleStrip({
  title,
  people,
}: {
  title: string;
  people: { id?: number; name: string; role: string; img?: string }[];
}) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      <div className="no-scrollbar -mx-2 flex gap-4 overflow-x-auto px-2 pb-3 pt-2">
        {people.slice(0, 18).map((p) =>
          p.id ? (
            <Link
              key={`${p.id}-${p.role}`}
              to="/person/$id"
              params={{ id: String(p.id) }}
              className="group w-32 shrink-0 text-center"
            >
              <PersonTile person={p} />
            </Link>
          ) : (
            <div key={`${p.name}-${p.role}`} className="w-32 shrink-0 text-center">
              <PersonTile person={p} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function PersonTile({ person }: { person: { name: string; role: string; img?: string } }) {
  return (
    <>
      <div className="aspect-square overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 transition group-hover:ring-primary/45">
        {person.img ? (
          <img
            src={person.img}
            alt={person.name}
            className="h-full w-full object-cover transition group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full place-items-center text-3xl text-white/30">
            {person.name[0]}
          </div>
        )}
      </div>
      <div className="mt-2 truncate text-xs font-semibold">{person.name}</div>
      <div className="truncate text-[11px] text-muted-foreground">{person.role}</div>
    </>
  );
}

function WhereToWatchFallback({ media, extra }: { media: Media; extra: ExtraDetails | null }) {
  const today = new Date();
  const release = extra?.releaseDate || extra?.firstAirDate;
  const releaseDate = release ? new Date(release) : null;
  const daysSince = releaseDate
    ? Math.floor((today.getTime() - releaseDate.getTime()) / 86_400_000)
    : null;
  const isFuture = releaseDate ? releaseDate.getTime() > today.getTime() : false;
  const status = extra?.status;

  let label = "Not yet on streaming";
  let sub = "We'll list providers when available.";
  let tone: "theatre" | "soon" | "muted" = "muted";

  if (media.type === "movie") {
    if (
      isFuture ||
      status === "Post Production" ||
      status === "In Production" ||
      status === "Planned"
    ) {
      label = "Coming soon";
      sub = release ? `Releases ${release}` : "Release date pending";
      tone = "soon";
    } else if (daysSince !== null && daysSince >= 0 && daysSince <= 90) {
      label = "In theatres";
      sub = "Currently playing in cinemas";
      tone = "theatre";
    }
  } else if (isFuture) {
    label = "Premieres soon";
    sub = release ? `First airs ${release}` : "Premiere date pending";
    tone = "soon";
  }

  const accent =
    tone === "theatre"
      ? "from-amber-400/25 to-amber-500/5 ring-amber-300/30 text-amber-100"
      : tone === "soon"
        ? "from-primary/25 to-primary/5 ring-primary/30 text-foreground"
        : "from-white/10 to-white/0 ring-white/10 text-foreground/85";

  return (
    <div
      className={`mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-br ${accent} p-3 ring-1`}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/30 ring-1 ring-white/10">
        {tone === "theatre" ? (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7h18M3 12h18M3 17h18" />
            <path d="M7 3v18M17 3v18" />
          </svg>
        ) : tone === "soon" ? (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18" />
          </svg>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{label}</div>
        <div className="truncate text-[11px] text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="media-info-chip rounded-full px-3 py-1.5 text-xs">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="media-info-row flex items-start justify-between gap-3 pb-2">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 break-words text-right">{v}</span>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  active = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`liquid-icon group/icon relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-500 ease-out hover:scale-[1.04] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "border-primary/50 bg-primary/20 text-primary-foreground ring-1 ring-primary/40"
          : ""
      }`}
    >
      {children}
    </button>
  );
}

function DownloadButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Downloads"
      title="Downloads"
      className="liquid-icon group/icon relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-500 ease-out hover:scale-[1.04] active:scale-95"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}


function SectionHeading({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <div>
      {kicker && (
        <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-primary/80">{kicker}</p>
      )}
      <h2 className="mt-1 text-2xl font-black tracking-tight md:text-[1.7rem]">{title}</h2>
    </div>
  );
}

