import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchMediaById, fetchPerson, fetchPersonCredits, type PersonDetails } from "@/lib/tmdb";
import type { Media } from "@/lib/catalog";
import { MediaCard } from "@/components/MediaCard";

export const Route = createFileRoute("/person/$id")({
  head: () => ({ meta: [{ title: "Cast Member — Sleepy" }] }),
  component: PersonPage,
});

function PersonPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const personId = Number(id);
  const [person, setPerson] = useState<PersonDetails | null>(null);
  const [credits, setCredits] = useState<Media[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    setPerson(null);
    setCredits([]);
    setError(null);
    fetchPerson(personId)
      .then((p) => !dead && setPerson(p))
      .catch((e) => !dead && setError(e?.message || "Failed to load"));
    fetchPersonCredits(personId)
      .then(async (c) => {
        if (dead) return;
        setCredits(c);
        const enriched = await Promise.all(
          c.slice(0, 10).map((m) => fetchMediaById(m.id, m.type).catch(() => m)),
        );
        if (!dead) setCredits([...enriched, ...c.slice(10)]);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [personId]);

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else navigate({ to: "/" });
  };

  const genres = [...new Set(credits.flatMap((m) => m.genres))].slice(0, 10);
  const studios = [...new Set(credits.flatMap((m) => m.studios ?? []))].slice(0, 10);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Couldn't load person
          </div>
          <p className="mt-2 text-foreground">{error}</p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="mt-6 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 pt-24">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
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
            <path d="M15 18 9 12l6-6" />
          </svg>
          Back
        </button>

        <section className="mt-6 grid items-start gap-8 md:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="mx-auto w-48 md:sticky md:top-28 md:mx-0 md:w-full">
            <div className="aspect-[2/3] overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-2xl">
              {person?.profile ? (
                <img
                  src={person.profile}
                  alt={person.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-5xl text-white/30">
                  {person?.name?.[0] ?? "·"}
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0 text-center md:text-left">
            <div className="text-xs uppercase tracking-[0.3em] text-primary/80">
              {person?.knownFor || "Cast"}
            </div>
            <h1 className="mt-2 text-balance text-4xl font-black uppercase leading-[0.95] md:text-6xl lg:text-7xl">
              {person?.name || "Loading…"}
            </h1>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Stat label="Credits" value={credits.length ? `${credits.length}` : "—"} />
              <Stat label="Genres" value={genres.length ? `${genres.length}` : "—"} />
              <Stat label="Studios" value={studios.length ? `${studios.length}` : "—"} />
            </div>
            <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Biography
                </h2>
                <p className="mt-3 max-w-3xl whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
                  {person?.biography || "Loading biography…"}
                </p>
              </div>
              <aside className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <Info
                  title="Personal"
                  items={
                    [
                      person?.birthday && `Born ${person.birthday}`,
                      person?.deathday && `Died ${person.deathday}`,
                      person?.placeOfBirth,
                    ].filter(Boolean) as string[]
                  }
                />
                <Info title="Genres" items={genres} />
                <Info
                  title="Studios"
                  items={studios.length ? studios : ["Loading studio history…"]}
                />
              </aside>
            </div>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="mb-4 text-xl font-bold">Known for</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {credits.map((m) => (
              <MediaCard key={`${m.type}-${m.id}`} media={m} fill />
            ))}
            {credits.length === 0 && (
              <div className="col-span-full text-center text-sm text-muted-foreground">
                Loading credits…
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
    </div>
  );
}

function Info({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full bg-white/5 px-3 py-1 text-xs ring-1 ring-white/10"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
