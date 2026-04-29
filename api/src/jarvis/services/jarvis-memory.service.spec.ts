import {
  buildSessionSummaryFromTurns,
  extractMemoryFactsFromText,
} from './jarvis-memory.service';

describe('JarvisMemoryService helpers', () => {
  it('extracts durable personal facts from explicit user statements', () => {
    const facts = extractMemoryFactsFromText(
      "Je m'appelle Celian, mon projet s'appelle Jarvis Premium et je travaille chez Stark Industries.",
    );

    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layer: 'identity',
          key: 'preferred_name',
          value: 'Celian',
        }),
        expect.objectContaining({
          layer: 'project',
          key: 'primary_project',
          value: 'Jarvis Premium',
        }),
        expect.objectContaining({
          layer: 'identity',
          key: 'company',
          value: 'Stark Industries',
        }),
      ]),
    );
  });

  it('builds a compact persistent summary from recent turns', () => {
    const summary = buildSessionSummaryFromTurns([
      {
        userText: 'Liste mes todos',
        assistantText: 'Voici tes todos.',
        kind: 'tool',
        toolName: 'todo.list',
      },
      {
        userText: 'Et ensuite ?',
        assistantText: 'Pour bien faire, quel objectif prioritaire ?',
        kind: 'ask',
      },
    ]);

    expect(summary?.summary).toContain('Dernière demande notable');
    expect(summary?.summary).toContain('Actions récentes: todo.list');
    expect(summary?.summary).toContain('Point en attente');
  });
});
