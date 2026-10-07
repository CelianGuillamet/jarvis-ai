/** Shared by execution and disclosure so provider routing cannot silently diverge. */
export function selectedModelProvider(
  preference: string | undefined,
  apiKey: string | undefined,
): 'ollama' | 'openai' {
  return apiKey?.trim() && preference?.toLowerCase() !== 'ollama'
    ? 'openai'
    : 'ollama';
}
