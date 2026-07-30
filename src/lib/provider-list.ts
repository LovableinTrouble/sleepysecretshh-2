import type { ProviderId } from "./streams.server";

export const PROVIDER_LIST: { id: ProviderId; name: string }[] = [
  { id: "aurora", name: "Aurora" },
  { id: "orion", name: "Orion" },
  { id: "vega", name: "Vega" },
  { id: "atlas", name: "Atlas" },
  { id: "comet", name: "Comet" },
  { id: "nimbus", name: "Nimbus" },
];