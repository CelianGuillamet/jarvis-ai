import { parseMissionPlan } from './jarvis-mission.service';

describe('JarvisMissionService helpers', () => {
  it('parses summary, next step and signals from a mission plan', () => {
    const parsed = parseMissionPlan(
      [
        'Mission plan - Démo investisseur',
        '',
        'Evaluation tactique',
        "- J'ai trouvé plusieurs signaux liés à cette mission.",
        '',
        'Signaux pertinents',
        '- Agenda: Demo Stark',
        '- Emails: Validation finale',
        '',
        'Plan recommande',
        '1. Relire les slides.',
        '2. Verrouiller le fil rouge.',
      ].join('\n'),
      'Démo investisseur',
    );

    expect(parsed.summary).toContain('plusieurs signaux');
    expect(parsed.nextStep).toBe('Relire les slides.');
    expect(parsed.keySignals).toEqual(
      expect.arrayContaining([
        'Agenda: Demo Stark',
        'Emails: Validation finale',
      ]),
    );
  });
});
