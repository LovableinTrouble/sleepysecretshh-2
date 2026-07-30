import { PROVIDER_LIST } from "./provider-list";

export { PROVIDER_LIST };

export const PROVIDERS = PROVIDER_LIST;

export interface ScrapedStream {
  url: string;
  quality: string;
  provider: string;
  type: "hls" | "mp4" | "mkv" | "dash" | "unknown";
}

export function listProviders() {
  return PROVIDER_LIST.map((provider) => ({ ...provider }));
}