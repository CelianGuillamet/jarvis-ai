import { createHumanProfile, humanizeToolResult } from './humanize';
import { addressee, formatListReply } from './reply-format';

const vous = createHumanProfile('vous', 'normal');
const tu = createHumanProfile('tu', 'normal');

describe('reply layout', () => {
  it('lays out an agenda by day with bold times and keeps the #N references', () => {
    const raw =
      'Rendez-vous:\n#1 - ven. 09/10 à 09:30 — Réunion équipe\n#2 - ven. 09/10 à 12:30 — Déjeuner Marie\n#3 - sam. 10/10 à 10:00 — Dentiste';
    const out = humanizeToolResult(vous, raw);
    expect(out).toContain('Voici votre agenda, Monsieur : 3 rendez-vous.');
    expect(out).toContain(
      '**Vendredi 09/10**\n- **09:30** — Réunion équipe (#1)\n- **12:30** — Déjeuner Marie (#2)',
    );
    expect(out).toContain('**Samedi 10/10**\n- **10:00** — Dentiste (#3)');
    expect(out).toContain(
      'Souhaitez-vous que je prépare ou déplace l’un d’eux ?',
    );
    expect(out).toMatch(/\n\n/);
  });

  it('switches to informal address and shortens when brief', () => {
    const raw = 'Rendez-vous:\n#1 - ven. 09/10 à 09:30 — Réunion équipe';
    expect(humanizeToolResult(tu, raw)).toContain('Un seul rendez-vous');
    const brief = humanizeToolResult(createHumanProfile('vous', 'brief'), raw);
    expect(brief).not.toContain('Souhaitez-vous');
  });

  it('formats tasks, shopping and notes as references with bold numbers', () => {
    expect(
      humanizeToolResult(
        vous,
        'Todos (open):\n- #1 - Appeler Pepper\n- #2 - Envoyer le devis',
      ),
    ).toBe(
      'Voici vos tâches en cours, Monsieur :\n\n- **#1** Appeler Pepper\n- **#2** Envoyer le devis',
    );
    expect(
      humanizeToolResult(vous, 'Courses (open):\n- #1 - Lait ✅'),
    ).toContain('votre liste de courses');
    expect(
      humanizeToolResult(vous, 'Notes (1):\n- #1 - Idées: démo'),
    ).toContain('vos notes');
  });

  it('turns emails into a list with quoted previews', () => {
    const raw =
      'Emails non lus (2):\n#1 - [non lu] ven. 09/10 à 08:00 — Facture (a@b.c)\nExtrait: Bonjour, veuillez trouver…\n#2 - [non lu] ven. 09/10 à 07:00 — Réunion (d@e.f)';
    const out = humanizeToolResult(vous, raw);
    expect(out).toContain('- **#1** [non lu]');
    expect(out).toContain('  > Bonjour, veuillez trouver…');
  });

  it('answers empty results in full sentences', () => {
    expect(humanizeToolResult(vous, 'Aucun todo.')).toBe(
      'Aucune tâche en cours, Monsieur. Tout est à jour.',
    );
    expect(humanizeToolResult(vous, 'Aucun événement sur cette période.')).toBe(
      'Votre agenda est libre sur cette période, Monsieur.',
    );
    expect(humanizeToolResult(tu, 'Aucun todo.')).toBe(
      'Aucune tâche en cours. Tout est à jour.',
    );
  });

  it('leaves unrecognized output untouched and uses a known name over « Monsieur »', () => {
    const text = 'Rendez-vous:\nligne inattendue';
    expect(formatListReply(text, vous)).toBe(text);
    expect(addressee({ ...vous, preferredName: 'Célian' })).toBe('Célian');
    expect(addressee(tu)).toBe('');
  });
});
