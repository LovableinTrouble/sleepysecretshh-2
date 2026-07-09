import { MediaCard } from "@/components/MediaCard";
import { useQuery } from "@tanstack/react-query";
import type { Media } from "@/lib/catalog";

interface Props {
  title: string;
  subtitle: string;
  items?: Media[];
  queryKey?: string[];
  queryFn?: () => Promise<Media[]>;
}

export function CategoryPage({ title, subtitle, items, queryKey, queryFn }: Props) {
  const q = useQuery({
    queryKey: queryKey ?? ["static", title],
    queryFn: queryFn ?? (async () => items ?? []),
    staleTime: 5 * 60_000,
  });
  const list = q.data ?? items ?? [];

  return (
    <div className="min-h-screen px-6 pb-24 pt-24 md:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-2 text-xs uppercase tracking-[0.4em] text-primary/80">{subtitle}</div>
        <h1 className="text-4xl font-black tracking-tight md:text-6xl">{title}</h1>
        {q.isLoading && (
          <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-2xl animate-shimmer" />
            ))}
          </div>
        )}
        {!q.isLoading && (
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-7 overflow-visible sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 animate-fade-in">
            {list.map((m) => (
              <MediaCard key={`${m.type}-${m.id}`} media={m} fill />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
