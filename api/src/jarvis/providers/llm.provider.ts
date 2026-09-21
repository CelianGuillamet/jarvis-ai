export type LLMMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface LLMProvider {
  readonly providerName?: string;
  chat(messages: LLMMessage[]): Promise<string>;
}
