export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
}
export interface SearchProvider {
  name: string;
  search(query: string): Promise<SearchHit[]>;
}
