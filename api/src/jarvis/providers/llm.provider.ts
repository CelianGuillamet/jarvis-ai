export type LLMMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface LLMProvider {
  chat(messages: LLMMessage[]): Promise<string>;
}
