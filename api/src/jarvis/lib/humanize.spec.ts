import type { ToolExecutionPlan } from './execution-policy';
import type { ToolCall } from '../tools/tools';
import {
  createHumanProfile,
  humanizeError,
  humanizePendingPrompt,
  humanizeToolResult,
  updateHumanProfile,
} from './humanize';

type ToolOnly = Extract<ToolCall, { type: 'tool' }>;

describe('humanize', () => {
  it('updates user profile from natural language preferences', () => {
    const base = createHumanProfile('tu', 'normal');
    const next = updateHumanProfile(
      base,
      "Je m'appelle Celian, vouvoie-moi et réponds en bref",
    );

    expect(next.preferredName).toBe('Celian');
    expect(next.speechMode).toBe('vous');
    expect(next.verbosity).toBe('brief');
    expect(next.turnCount).toBe(1);
  });

  it('adapts pending prompt pronouns for vouvoiement', () => {
    const profile = {
      ...createHumanProfile('vous', 'normal'),
      turnCount: 2,
    };
    const call: ToolOnly = {
      type: 'tool',
      name: 'calendar.list',
      args: { rangeText: 'demain' },
    };

    const text = humanizePendingPrompt(profile, call, 'Europe/Paris');
    expect(text).toContain('votre calendrier');
    expect(text).toContain('Vous confirmez ?');
  });

  it('adds a caution sentence when confirmation comes from medium intent confidence', () => {
    const profile = {
      ...createHumanProfile('tu', 'normal'),
      turnCount: 0,
    };
    const call: ToolOnly = {
      type: 'tool',
      name: 'calendar.delete',
      args: { query: 'demain' },
    };
    const plan: ToolExecutionPlan = {
      planner: 'intent',
      confidence: 'medium',
      risk: 'high',
      sideEffect: true,
      requiresConfirmation: true,
      confirmationReason: 'intent_medium_confidence',
      summary: 'supprimer le rendez-vous "demain"',
    };

    const text = humanizePendingPrompt(profile, call, 'Europe/Paris', plan);
    expect(text).toContain('je préfère ta validation');
    expect(text).toContain('Tu confirmes ?');
  });

  it('keeps brief mode concise for tool results', () => {
    const profile = {
      ...createHumanProfile('tu', 'brief'),
      turnCount: 0,
    };

    const text = humanizeToolResult(profile, 'OK. Événement créé: "Dentiste"');
    expect(text).toBe('Événement créé: "Dentiste"');
  });

  it('humanizes non-brief OK results', () => {
    const profile = {
      ...createHumanProfile('tu', 'normal'),
      turnCount: 0,
    };

    const text = humanizeToolResult(profile, 'OK. Note ajoutée.');
    expect(
      text.startsWith("C'est fait, ") || text.startsWith('Parfait, '),
    ).toBe(true);
  });

  it('adds an intro for mission plans', () => {
    const profile = {
      ...createHumanProfile('tu', 'normal'),
      turnCount: 1,
    };

    const text = humanizeToolResult(
      profile,
      'Mission plan - Demo investisseur\n\nPlan recommande\n1. Faire le point',
    );
    expect(text).toContain('Voici ton plan de mission.');
    expect(text).toContain('Mission plan - Demo investisseur');
  });

  it('humanizes technical errors depending on speech mode', () => {
    expect(humanizeError(createHumanProfile('tu', 'normal'))).toContain(
      'Tu peux',
    );
    expect(humanizeError(createHumanProfile('vous', 'normal'))).toContain(
      'Pouvez-vous',
    );
  });
});
