import { MediaRow } from "@/components/MediaRow";
import { useQuery } from "@tanstack/react-query";
import type { Media } from "@/lib/catalog";

export interface RowSpec {
  title: string;
  queryKey: string[];
  queryFn: () => Promise<Media[]>;
}

interface Props {
  title: string;
  subtitle: string;
  rows: RowSpec[];
}

export function CategoryRows({ title, subtitle, rows }: Props) {
  return (
    <div className="min-h-screen pb-24 pt-24">
      <header className="px-6 md:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-2 text-xs uppercase tracking-[0.4em] text-primary/80">{subtitle}</div>
          <h1 className="text-4xl font-black tracking-tight md:text-6xl">{title}</h1>
        </div>
      </header>

      <main className="mt-10 space-y-12 animate-soft-rise">
        {rows.map((r) => (
          <Row key={r.title} spec={r} />
        ))}
      </main>
    </div>
  );
}

function Row({ spec }: { spec: RowSpec }) {
  const q = useQuery({ queryKey: spec.queryKey, queryFn: spec.queryFn, staleTime: 10 * 60_000 });
  if (q.isLoading) {
    return (
      <section className="px-4 md:px-8">
        <div className="mb-3 h-5 w-48 rounded-md animate-shimmer" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 w-40 shrink-0 rounded-2xl animate-shimmer md:w-44" />
          ))}
        </div>
      </section>
    );
  }
  if (q.isError || !q.data?.length) return null;
  return <MediaRow title={spec.title} items={q.data} />;
}
