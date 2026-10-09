import { parseYesNo } from './yes-no';

describe('parseYesNo', () => {
  it.each([
    'oui',
    'Oui.',
    'ok',
    "d'accord",
    'Daccord !',
    'vas-y',
    'oui vas-y',
    'oui merci',
    'oui, je confirme',
    'je confirme',
    'confirme',
    'valide',
    'go',
    'yes',
    'exécute',
    'lance',
    'ok parfait',
  ])('accepts %s', (text) => {
    expect(parseYesNo(text)).toBe('yes');
  });

  it.each([
    'non',
    'Non merci',
    'annule',
    'stop',
    'laisse tomber',
    'ne fais pas ça',
    'pas maintenant',
    'je ne confirme pas',
    'non, annule',
  ])('refuses %s', (text) => {
    expect(parseYesNo(text)).toBe('no');
  });

  it.each([
    'si je dis oui tu envoies quoi',
    'je confirme demain',
    'toujours demander avant envoi',
    'oui mais envoie-le à Paul plutôt',
    'est-ce que je dois dire oui',
    'ne dis pas oui à ma place',
    'oui pour le premier et non pour le second',
    'quand je dis ok tu fais quoi exactement avec ça',
    'je valide le plan de demain',
    '',
    '   ',
  ])('never treats %s as consent or refusal', (text) => {
    expect(parseYesNo(text)).toBeNull();
  });
});
