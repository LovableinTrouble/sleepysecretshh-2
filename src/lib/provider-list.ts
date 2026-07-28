import type { ProviderId } from "./streams.server";

export const PROVIDER_LIST: { id: ProviderId; name: string }[] = [
  { id: "orion",  name: "Orion"  },
  { id: "aurora", name: "Aurora" },
  { id: "vega",   name: "Vega"   },
  { id: "atlas",  name: "Atlas"  },
  { id: "nimbus", name: "Nimbus" },
];