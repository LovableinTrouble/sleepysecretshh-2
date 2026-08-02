import type { ProviderId } from "./streams.server";

export const PROVIDER_LIST: { id: ProviderId; name: string }[] = [
  { id: "febbox", name: "Febbox" },
  { id: "atlas", name: "Atlas" },
  { id: "nimbus", name: "Nimbus" },
  { id: "orion", name: "Orion" },
  { id: "vault", name: "Vault" }, // VAULT — direct MP4/MKV from downloads endpoint (second-last)
  { id: "vega", name: "Vega" }, // VEGA (peachify) — keep as the last fallback
];
