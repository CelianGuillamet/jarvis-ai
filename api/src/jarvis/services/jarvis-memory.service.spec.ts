import { buildSessionSummaryFromTurns } from './jarvis-memory.service';

describe('JarvisMemoryService helpers', () => {
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
