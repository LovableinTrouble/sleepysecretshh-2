import type { LucideProps } from "lucide-react";
import {
  Trophy,
  Goal,
  Volleyball,
  Swords,
  Car,
  Target,
  Tv,
  Dumbbell,
  Shield,
} from "lucide-react";

const MAP: Record<string, React.ComponentType<LucideProps>> = {
  "Football": Goal,
  "Soccer": Goal,
  "American Football": Shield,
  "Australian Football": Shield,
  "Basketball": Trophy,
  "Baseball": Trophy,
  "Combat Sports": Swords,
  "Wrestling": Dumbbell,
  "Boxing": Swords,
  "MMA": Swords,
  "Motorsports": Car,
  "Rugby": Trophy,
  "Volleyball": Volleyball,
  "Darts": Target,
  "Cricket": Trophy,
  "Hockey": Trophy,
  "Tennis": Trophy,
  "Golf": Target,
  "24/7 Streams": Tv,
};

export function SportIcon({ category, className, ...rest }: { category: string } & LucideProps) {
  const Icon = MAP[category] ?? Trophy;
  return <Icon className={className} strokeWidth={2.2} {...rest} />;
}