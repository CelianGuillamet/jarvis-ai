export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebOpenResult = {
  url: string;
  title?: string;
  content: string;
};

export interface WebProvider {
  readonly name: string;
  search(query: string, limit?: number): Promise<WebSearchResult[]>;
  open(url: string, maxChars?: number): Promise<WebOpenResult>;
}

// No runtime flag can re-enable retrieval until the network boundary is hardened.
export const WEB_DISABLED_MESSAGE =
  'La recherche et la lecture de pages web sont désactivées pour cette bêta.';

export class DisabledWebProvider implements WebProvider {
  readonly name = 'disabled';

  search: WebProvider['search'] = () =>
    Promise.reject(new Error(WEB_DISABLED_MESSAGE));

  open: WebProvider['open'] = () =>
    Promise.reject(new Error(WEB_DISABLED_MESSAGE));
}
