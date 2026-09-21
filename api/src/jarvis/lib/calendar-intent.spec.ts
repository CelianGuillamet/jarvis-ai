import { planCalendarWrite } from './calendar-intent';
import { buildToolExecutionPlan } from './execution-policy';

const timezone = 'Europe/Paris';

describe('calendar write intent', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-21T08:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('keeps ambiguous deletion at medium confidence with confirmation', () => {
    const decision = planCalendarWrite(
      'Supprime mon rendez-vous demain',
      timezone,
    );
    expect(decision).toEqual({
      action: {
        type: 'tool',
        name: 'calendar.delete',
        args: { query: 'mon rendez-vous demain' },
      },
      planner: 'intent',
      confidence: 'medium',
    });
    const plan = buildToolExecutionPlan(decision!.action, decision!);
    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.confirmationReason).toBe('intent_medium_confidence');
  });

  it('routes an explicit reference to calendar while retaining tool-policy confirmation', () => {
    const decision = planCalendarWrite('Supprime le rendez-vous #2', timezone);
    expect(decision?.action).toEqual({
      type: 'tool',
      name: 'calendar.delete',
      args: { ref: 2 },
    });
    expect(
      buildToolExecutionPlan(decision!.action, decision!).requiresConfirmation,
    ).toBe(true);
  });

  it('extracts the user title and delegates time resolution to the existing date parser', () => {
    const decision = planCalendarWrite(
      'Ajoute un rendez-vous avec Marie demain à 18h',
      timezone,
    );
    expect(decision?.action).toEqual({
      type: 'tool',
      name: 'calendar.create',
      args: {
        title: 'rendez-vous avec Marie',
        when: '2026-09-22T18:00:00+02:00',
      },
    });
    expect(
      buildToolExecutionPlan(decision!.action, decision!).requiresConfirmation,
    ).toBe(true);
  });

  it.each([
    'Ne supprime pas mon rendez-vous demain',
    'Supprime le rendez-vous demain mais pas celui avec Marie',
    'Supprime la note sur le rendez-vous #1',
    'Supprime le rendez-vous #1 et #2',
    'Supprime le rendez-vous #201',
    'Supprime le rendez-vous #2.5',
    'Supprime le rendez-vous #2 demain',
    'Ajoute un rendez-vous demain',
    'Ajoute un rendez-vous à 18h',
    'Ajoute un rendez-vous demain à 18h puis supprime ma note',
    'Quel est mon prochain rendez-vous ?',
  ])('does not force a calendar write for %s', (text) => {
    expect(planCalendarWrite(text, timezone)).toBeNull();
  });
});
