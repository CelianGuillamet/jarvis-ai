import { ToolCall } from '../tools/tools';
import type { ConversationState, AuditStatusFilter } from './assistant-types';
import {
  normalizeIntentText,
  extractRefsFromText,
  extractOrdinalRefFromText,
  includesAny,
  hasMetVerb,
  extractWeatherLocation,
  extractMissionObjectiveFromText,
  extractMissionCloseTargetFromText,
} from './intent-text';

export function tryDirectToolCall(
  userText: string,
  st: ConversationState | null,
): Extract<ToolCall, { type: 'tool' }> | null {
  const text = normalizeIntentText(userText);
  const refs = extractRefsFromText(text);
  const hashRefMatch = text.match(/#\s*(\d{1,3})\b/);
  const numRefMatch = text.match(/\b(?:numero|num|n)\s*(\d{1,3})\b/);

  const rememberMatch = userText.match(
    /^\s*(?:jarvis[,:\s-]*)?(?:retiens|souviens[- ]toi|rappelle[- ]toi|m[ée]morise)\s+(?:bien\s+)?(?:que|qu['’])\s*(.+)$/i,
  );
  if (rememberMatch?.[1]?.trim()) {
    return {
      type: 'tool',
      name: 'memory.remember',
      args: { text: rememberMatch[1].trim() },
    };
  }
  if (
    /\b(?:que sais[\s-]tu|qu est ce que tu sais|que connais[\s-]tu)\s+(?:de|sur)\s+moi\b/.test(
      text,
    )
  ) {
    return { type: 'tool', name: 'memory.list', args: { limit: 20 } };
  }
  const forgetThatMatch = userText.match(
    /^\s*(?:jarvis[,:\s-]*)?oublie\s+(?:que|qu['’])\s*(.+)$/i,
  );
  if (forgetThatMatch?.[1]?.trim()) {
    return {
      type: 'tool',
      name: 'memory.forget',
      args: { query: forgetThatMatch[1].trim().replace(/[.!]+$/, '') },
    };
  }

  const listWords = ['liste', 'lister', 'montre', 'affiche', 'voir'];
  const allWords = ['tout', 'tous', 'toutes', 'all', 'entier', 'complet'];
  const deleteWords = [
    'supprime',
    'supprimer',
    'efface',
    'effacer',
    'retire',
    'retirer',
    'enleve',
    'enlever',
  ];
  const doneWords = ['termine', 'termines', 'terminer', 'fait', 'fini', 'clos'];
  const boughtWords = ['achete', 'achetes', 'acheter', 'pris', 'prendre'];
  const unboughtWords = ['non achete', 'pas achete'];
  const wantsList = includesAny(text, listWords);
  const wantsAll = includesAny(text, allWords);
  const wantsDelete = includesAny(text, deleteWords);
  const wantsDone = includesAny(text, doneWords);
  const wantsBought = includesAny(text, boughtWords);
  if (
    includesAny(text, [
      'undo',
      'annule la derniere action',
      'annule derniere action',
      'retour en arriere',
    ])
  ) {
    return { type: 'tool', name: 'undo.last_action', args: {} };
  }

  if (
    includesAny(text, [
      'briefing',
      'resume du jour',
      'resume quotidien',
      'priorites du jour',
      'priorites aujourd hui',
      'situation du jour',
      'centre de commande',
      'command center',
      'mission control',
      'tableau de bord',
      'dashboard',
      'que dois je traiter aujourd hui',
    ]) &&
    !includesAny(text, ['calendar', 'calendrier'])
  ) {
    return { type: 'tool', name: 'daily.briefing', args: {} };
  }

  const wantsActionHistory =
    includesAny(text, [
      'historique des actions',
      'historique d actions',
      'journal des actions',
      'journal d audit',
      'audit log',
      'audit trail',
      'actions recentes',
      'actions récentes',
      'qu as tu fait',
      'qu as-tu fait',
      'qu est ce que tu as fait',
      'que s est il passe',
      'que s’est il passe',
    ]) ||
    (includesAny(text, ['action', 'actions']) &&
      includesAny(text, [
        'historique',
        'journal',
        'attente',
        'recent',
        'récent',
      ]));
  if (wantsActionHistory) {
    const status: AuditStatusFilter = includesAny(text, [
      'en attente',
      'pending',
      'pas encore executees',
      'pas encore exécutées',
    ])
      ? 'pending'
      : 'all';
    return {
      type: 'tool',
      name: 'action.history',
      args: { status, limit: status === 'pending' ? 5 : 8 },
    };
  }

  const wantsWorkflowList =
    includesAny(text, [
      'workflow',
      'workflows',
      'routine',
      'routines',
      'habitudes',
      'ce que tu as appris',
      'workflows appris',
    ]) &&
    (wantsList ||
      includesAny(text, [
        'appris',
        'apprises',
        'habitudes',
        'routines',
        'workflow',
        'workflows',
      ]));
  if (wantsWorkflowList) {
    return {
      type: 'tool',
      name: 'workflow.list',
      args: { limit: 5 },
    };
  }

  const wantsMemoryList =
    includesAny(text, [
      'memoire',
      'ta memoire',
      'monde personnel',
      'world model',
      'qu est ce que tu sais',
      'qu est ce que tu sais sur moi',
      'qu as tu retenu',
      'qu as tu retenu sur moi',
    ]) &&
    (wantsList ||
      includesAny(text, [
        'montre',
        'affiche',
        'liste',
        'resume',
        'résume',
        'donne',
      ]));
  if (wantsMemoryList) {
    return { type: 'tool', name: 'memory.list', args: { limit: 20 } };
  }

  const wantsMemoryForget =
    includesAny(text, ['memoire', 'souvenir', 'souvenirs']) &&
    includesAny(text, [
      'oublie',
      'oublier',
      'efface',
      'effacer',
      'supprime',
      'supprimer',
      'retire',
      'retirer',
    ]);
  if (wantsMemoryForget) {
    const query = userText
      .trim()
      .replace(/^jarvis[,:\s-]*/i, '')
      .replace(
        /^(?:oublie|oublier|efface|effacer|supprime|supprimer|retire|retirer)\s+(?:de\s+ta\s+memoire\s+)?/i,
        '',
      )
      .trim();

    const ref = Number(hashRefMatch?.[1] ?? numRefMatch?.[1]);
    return {
      type: 'tool',
      name: 'memory.forget',
      args:
        Number.isInteger(ref) && ref >= 1
          ? { ref }
          : { query: query || userText.trim() },
    };
  }

  const wantsMissionList =
    (includesAny(text, [
      'mission',
      'missions',
      'mission active',
      'missions actives',
      'mission en cours',
      'missions en cours',
    ]) &&
      (wantsList ||
        /quelles?\s+sont\s+mes\s+missions/.test(text) ||
        /mes\s+missions\s+actives/.test(text))) ||
    includesAny(text, ['liste mes missions', 'montre mes missions']);
  if (
    wantsMissionList &&
    !includesAny(text, ['mission control', 'centre de commande'])
  ) {
    return {
      type: 'tool',
      name: 'mission.list',
      args: { status: 'active', limit: 5 },
    };
  }

  const wantsMissionClose =
    includesAny(text, [
      'cloture la mission',
      'clôture la mission',
      'cloturer la mission',
      'clôturer la mission',
      'ferme la mission',
      'termine la mission',
      'mission terminee',
      'mission terminée',
      'close la mission',
    ]) ||
    (includesAny(text, ['mission', 'missions']) &&
      includesAny(text, [
        'cloture',
        'clôture',
        'cloturer',
        'clôturer',
        'ferme',
        'terminer',
        'termine',
        'acheve',
        'achève',
        'close',
      ]) &&
      !includesAny(text, ['mission control', 'centre de commande']));
  if (wantsMissionClose) {
    const ref =
      extractOrdinalRefFromText(text) ??
      (hashRefMatch ? Number(hashRefMatch[1]) : null) ??
      (numRefMatch ? Number(numRefMatch[1]) : null);
    const query = extractMissionCloseTargetFromText(userText);
    return {
      type: 'tool',
      name: 'mission.close',
      args:
        typeof ref === 'number'
          ? { ref }
          : query
            ? { query }
            : { query: userText.trim() },
    };
  }

  const wantsMissionPlan =
    includesAny(text, [
      'plan de mission',
      'mission plan',
      'plan d action',
      'roadmap',
      'strategie',
      'stratégie',
    ]) ||
    /comment\s+(?:tu|on)\s+(?:t\s*y|s\s*y)\s+prend/.test(text) ||
    /comment\s+(?:organiser|structurer)\b/.test(text);
  if (
    wantsMissionPlan &&
    !includesAny(text, [
      'planifie',
      'planifier',
      'calendrier',
      'agenda',
      'rendez vous',
      'rendez-vous',
      'rdv',
    ])
  ) {
    return {
      type: 'tool',
      name: 'mission.plan',
      args: {
        objective: extractMissionObjectiveFromText(userText),
      },
    };
  }

  const isTodo = includesAny(text, ['todo', 'todos', 'tache', 'taches']);
  const isCalendar = includesAny(text, [
    'calendrier',
    'agenda',
    'rendez vous',
    'rendez-vous',
    'rdv',
    'reunion',
    'evenement',
  ]);
  const isShopping = includesAny(text, [
    'course',
    'courses',
    'shopping',
    'achat',
    'achats',
    'liste de courses',
    'liste des courses',
  ]);
  const isNote = includesAny(text, ['note', 'notes']);
  const isGmail = includesAny(text, [
    'gmail',
    'email',
    'e mail',
    'mail',
    'courriel',
    'boite mail',
    'boite de reception',
    'inbox',
  ]);
  const urlMatch = userText.match(/\bhttps?:\/\/[^\s<>()]+/i);
  const ordinalRef = extractOrdinalRefFromText(text);
  const explicitCalendarRef =
    ordinalRef ??
    (hashRefMatch ? Number(hashRefMatch[1]) : null) ??
    (numRefMatch ? Number(numRefMatch[1]) : null);

  const asksWeather =
    (includesAny(text, [
      'meteo',
      'weather',
      'temperature',
      'temperatures',
      'pluie',
      'vent',
      'humidite',
      'neige',
      'prevision',
      'previsions',
    ]) ||
      /\bquel temps\b/.test(text)) &&
    !isTodo &&
    !isCalendar &&
    !isShopping &&
    !isNote &&
    !isGmail;
  if (asksWeather) {
    const day = includesAny(text, ['demain', 'tomorrow'])
      ? 'tomorrow'
      : 'today';
    const location = extractWeatherLocation(text);
    return {
      type: 'tool',
      name: 'weather.forecast',
      args: {
        ...(location ? { location } : {}),
        day,
      },
    };
  }

  const asksWebSearch =
    includesAny(text, [
      'sur internet',
      'sur le web',
      'cherche sur',
      'recherche sur',
      'google',
      'actualite',
      'actualites',
      'news',
      'wikipedia',
    ]) &&
    !isTodo &&
    !isCalendar &&
    !isShopping &&
    !isNote;
  if (asksWebSearch) {
    return {
      type: 'tool',
      name: 'web.search',
      args: { query: userText.trim(), limit: 5 },
    };
  }

  if (urlMatch) {
    const onlyUrl = userText.trim() === urlMatch[0];
    const wantsOpenUrl =
      onlyUrl ||
      includesAny(text, [
        'ouvre',
        'ouvrir',
        'lis',
        'lire',
        'consulte',
        'resume',
        'resumer',
        'analyse',
        'va sur',
      ]);
    if (wantsOpenUrl) {
      return {
        type: 'tool',
        name: 'web.open',
        args: { url: urlMatch[0] },
      };
    }
  }

  const priorNorm = st
    ? normalizeIntentText(`${st.originalUserText} ${st.askedText}`)
    : '';
  const priorGmail = includesAny(priorNorm, [
    'gmail',
    'email',
    'mail',
    'courriel',
    'boite de reception',
    'inbox',
  ]);
  const gmailContext =
    isGmail ||
    includesAny(text, [
      'onglet promotion',
      'onglet social',
      'onglet mise a jour',
      'onglet forum',
      'onglet primary',
      'onglet principal',
      'mails promotion',
      'emails promotion',
      'mails social',
      'emails social',
      'mails mise a jour',
      'emails mise a jour',
      'mes primary',
      'mes promotions',
      'mes promos',
      'mes social',
      'mes updates',
      'mes forums',
      'dans primary',
      'dans promotions',
      'dans social',
      'dans updates',
      'dans forums',
    ]) ||
    (includesAny(text, ['non lu', 'non lus', 'unread']) &&
      includesAny(text, ['mail', 'email', 'courriel'])) ||
    (priorGmail &&
      includesAny(text, [
        'non lu',
        'non lus',
        'unread',
        'ouvre',
        'ouvrir',
        'lis',
        'lire',
        'resume',
        'resumer',
        'marque',
        'mettre',
        'archive',
        'supprime',
        '#',
        'premier',
        'deuxieme',
        'troisieme',
      ]));

  if (gmailContext) {
    const gmailRef = explicitCalendarRef;
    const wantsUnread = includesAny(text, [
      'non lu',
      'non lus',
      'pas lu',
      'pas lus',
      'unread',
      'non ouvert',
      'non ouverts',
    ]);
    const asksCount = includesAny(text, ['combien', 'nombre']);
    const wantsOpen = includesAny(text, [
      'ouvre',
      'ouvrir',
      'lis',
      'lire',
      'consulte',
      'affiche',
      'montre',
      'detail',
    ]);
    const wantsSummary = includesAny(text, [
      'resume',
      'resumer',
      'synthese',
      'summarise',
      'summariser',
    ]);
    const wantsSearchMail = includesAny(text, [
      'cherche',
      'recherche',
      'trouve',
      'from:',
      'subject:',
      'label:',
    ]);
    const wantsMarkUnread =
      (includesAny(text, ['marque', 'mettre', 'remet']) || hasMetVerb(text)) &&
      wantsUnread;
    const wantsMarkRead =
      (includesAny(text, ['marque', 'mettre']) || hasMetVerb(text)) &&
      includesAny(text, ['lu', 'lue', 'lus']) &&
      !wantsMarkUnread;
    const wantsUnarchive = includesAny(text, [
      'desarchive',
      'desarchiver',
      'restaure',
      'restaurer',
      'unarchive',
    ]);
    const wantsArchive =
      includesAny(text, ['archive', 'archiver']) && !wantsUnarchive;
    const wantsPermanentDelete =
      wantsDelete &&
      includesAny(text, [
        'definitif',
        'definitivement',
        'permanent',
        'pour toujours',
      ]);
    const wantsSend = includesAny(text, ['envoie', 'envoyer', 'envoi', 'send']);

    const gmailCategory:
      | 'primary'
      | 'promotions'
      | 'social'
      | 'updates'
      | 'forums'
      | undefined = includesAny(text, [
      'promotion',
      'promotions',
      'promo',
      'promos',
      'spam commercial',
    ])
      ? 'promotions'
      : includesAny(text, [
            'social',
            'reseaux sociaux',
            'facebook',
            'twitter',
            'linkedin',
            'instagram',
          ])
        ? 'social'
        : includesAny(text, [
              'mise a jour',
              'mises a jour',
              'update',
              'updates',
              'notification',
              'notifications',
              'alerte',
              'alertes',
            ])
          ? 'updates'
          : includesAny(text, ['forum', 'forums', 'discussion', 'discussions'])
            ? 'forums'
            : includesAny(text, [
                  'principal',
                  'principale',
                  'primaire',
                  'primary',
                  'important',
                  'importants',
                  'boite principale',
                ])
              ? 'primary'
              : undefined;
    const mentionedCategories = [
      includesAny(text, [
        'principal',
        'principale',
        'primaire',
        'primary',
        'boite principale',
      ])
        ? 'primary'
        : null,
      includesAny(text, ['promotion', 'promotions', 'promo', 'promos'])
        ? 'promotions'
        : null,
      includesAny(text, ['social', 'reseaux sociaux']) ? 'social' : null,
      includesAny(text, ['mise a jour', 'mises a jour', 'update', 'updates'])
        ? 'updates'
        : null,
      includesAny(text, ['forum', 'forums']) ? 'forums' : null,
    ].filter((value): value is NonNullable<typeof gmailCategory> => !!value);
    const wantsCategoryBreakdown =
      includesAny(text, [
        'difference',
        'differences',
        'distinction',
        'distingue',
        'distinguer',
        'repartition',
        'repartis',
        'repartir',
        'classe',
        'classer',
        'categorie',
        'categories',
        'onglet',
        'onglets',
        'tabs',
      ]) &&
      (mentionedCategories.length >= 2 ||
        includesAny(text, ['gmail', 'mail', 'email', 'courriel']));
    const requestedCategory = wantsCategoryBreakdown
      ? undefined
      : gmailCategory;

    if (wantsSend) {
      const emails = Array.from(
        userText.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi),
      )
        .map((m) => (m[0] || '').trim())
        .filter((email) => email.length > 0);
      const to = emails[0] || '';
      const ccMatch = userText.match(
        /\bcc\s*[:=-]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
      );
      const bccMatch = userText.match(
        /\bbcc\s*[:=-]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
      );
      const cc =
        ccMatch?.[1]?.trim() || (emails.length > 1 ? emails[1] : undefined);
      const bcc = bccMatch?.[1]?.trim();

      const subjectMatch = userText.match(
        /\b(?:objet|sujet)\s*[:=-]\s*([^,\n]+)/i,
      );
      const textMatch = userText.match(
        /\b(?:texte|message|contenu)\s*[:=-]\s*([\s\S]+)/i,
      );
      const quotedBody = userText.match(/["“”]([^"“”]{3,})["“”]/);
      const lower = userText.toLowerCase();
      const lowerTo = to.toLowerCase();
      const toPos = to ? lower.indexOf(lowerTo) : -1;
      const afterToRaw =
        toPos >= 0 ? userText.slice(toPos + to.length).trim() : '';
      const afterToBody = afterToRaw
        .replace(/^(?:,|;|-|:)\s*/, '')
        .replace(/^(?:texte|message|contenu)\s*[:=-]?\s*/i, '')
        .replace(/\b(?:objet|sujet)\s*[:=-]\s*[^,\n]+/i, '')
        .replace(/\bcc\s*[:=-]\s*[^\s,;]+/gi, '')
        .replace(/\bbcc\s*[:=-]\s*[^\s,;]+/gi, '')
        .trim();

      const subject = subjectMatch?.[1]?.trim() || 'Message Jarvis';
      const body =
        textMatch?.[1]?.trim() || quotedBody?.[1]?.trim() || afterToBody;

      if (to && body) {
        return {
          type: 'tool',
          name: 'gmail.send',
          args: {
            to,
            subject,
            text: body,
            ...(cc ? { cc } : {}),
            ...(bcc ? { bcc } : {}),
          },
        };
      }
    }

    if (wantsSummary) {
      if (gmailRef) {
        return {
          type: 'tool',
          name: 'gmail.summary',
          args: { ref: gmailRef },
        };
      }

      const wantsMailboxSummary =
        !!requestedCategory ||
        wantsCategoryBreakdown ||
        wantsUnread ||
        includesAny(text, [
          'boite de reception',
          'inbox',
          'mes mails',
          'mes emails',
        ]);

      const cleanedQuery = userText
        .replace(
          /\b(résume|resume|resumer|résumer|synthese|synthèse|summarise|summariser)\b/gi,
          '',
        )
        .replace(/\b(mails?|emails?|courriels?)\b/gi, '')
        .replace(/\b(non\s*lus?|unread)\b/gi, '')
        .replace(/\b(boite|boîte)\s+principale\b/gi, '')
        .replace(/\b(boite|boîte)\s+(?:de\s+)?(reception|réception)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (wantsMailboxSummary) {
        const wantsAllEmails = includesAny(text, [
          'tous mes mails',
          'tous mes emails',
          'toutes mes mails',
          'toutes mes emails',
          'derniers mails',
          'dernieres mails',
          'derniers emails',
          'dernieres emails',
          'emails recents',
          'mails recents',
        ]);
        const unreadOnly = wantsUnread
          ? true
          : wantsAllEmails
            ? false
            : undefined;

        return {
          type: 'tool',
          name: 'gmail.summary',
          args: {
            ...(unreadOnly === undefined ? {} : { unreadOnly }),
            ...(requestedCategory ? { category: requestedCategory } : {}),
            ...(wantsSearchMail
              ? { query: cleanedQuery || userText.trim() }
              : {}),
            limit: 10,
          },
        };
      }

      return {
        type: 'tool',
        name: 'gmail.summary',
        args: { query: cleanedQuery || userText.trim() },
      };
    }

    if (wantsMarkUnread) {
      return gmailRef
        ? { type: 'tool', name: 'gmail.mark_unread', args: { ref: gmailRef } }
        : {
            type: 'tool',
            name: 'gmail.mark_unread',
            args: { query: userText.trim() },
          };
    }

    if (wantsMarkRead) {
      const bulkCue =
        includesAny(text, ['ces', 'ceux', 'tous', 'toutes']) &&
        includesAny(text, ['mail', 'email', 'courriel']);
      const bulkRefs = refs;

      if (!gmailRef && (bulkCue || bulkRefs.length >= 2)) {
        return {
          type: 'tool',
          name: 'gmail.bulk_mark_read',
          args: {
            ...(bulkRefs.length ? { refs: bulkRefs } : {}),
            unreadOnly: true,
          },
        };
      }

      return gmailRef
        ? { type: 'tool', name: 'gmail.mark_read', args: { ref: gmailRef } }
        : {
            type: 'tool',
            name: 'gmail.mark_read',
            args: { query: userText.trim() },
          };
    }

    if (wantsUnarchive) {
      return gmailRef
        ? { type: 'tool', name: 'gmail.unarchive', args: { ref: gmailRef } }
        : {
            type: 'tool',
            name: 'gmail.unarchive',
            args: { query: userText.trim() },
          };
    }

    if (wantsArchive) {
      return gmailRef
        ? { type: 'tool', name: 'gmail.archive', args: { ref: gmailRef } }
        : {
            type: 'tool',
            name: 'gmail.archive',
            args: { query: userText.trim() },
          };
    }

    if (wantsDelete) {
      if (wantsPermanentDelete) {
        return gmailRef
          ? { type: 'tool', name: 'gmail.delete', args: { ref: gmailRef } }
          : {
              type: 'tool',
              name: 'gmail.delete',
              args: { query: userText.trim() },
            };
      }
      return gmailRef
        ? { type: 'tool', name: 'gmail.trash', args: { ref: gmailRef } }
        : {
            type: 'tool',
            name: 'gmail.trash',
            args: { query: userText.trim() },
          };
    }

    if (
      requestedCategory ||
      wantsCategoryBreakdown ||
      wantsUnread ||
      asksCount ||
      wantsList ||
      includesAny(text, [
        'boite de reception',
        'inbox',
        'mes mails',
        'mes emails',
      ])
    ) {
      return {
        type: 'tool',
        name: 'gmail.list',
        args: {
          unreadOnly: wantsUnread,
          ...(requestedCategory ? { category: requestedCategory } : {}),
          ...(wantsSearchMail ? { query: userText.trim() } : {}),
          limit: 20,
        },
      };
    }

    if (wantsOpen || gmailRef !== null) {
      return gmailRef
        ? { type: 'tool', name: 'gmail.get', args: { ref: gmailRef } }
        : {
            type: 'tool',
            name: 'gmail.get',
            args: { query: userText.trim() },
          };
    }
  }

  if (isTodo) {
    if (wantsList) {
      return {
        type: 'tool',
        name: 'todo.list',
        args: wantsAll ? { show: 'all' } : { show: 'open' },
      };
    }
    if (wantsDelete && wantsAll && wantsDone) {
      return { type: 'tool', name: 'todo.clear_done', args: {} };
    }
    if (wantsDelete && wantsAll) {
      return { type: 'tool', name: 'todo.clear_all', args: {} };
    }
    if (wantsDone && wantsAll) {
      return { type: 'tool', name: 'todo.done_all', args: {} };
    }
    if (refs.length && wantsDelete) {
      return { type: 'tool', name: 'todo.bulk_delete', args: { refs } };
    }
    if (refs.length && wantsDone) {
      return { type: 'tool', name: 'todo.bulk_done', args: { refs } };
    }
  }

  if (isShopping) {
    if (wantsList) {
      return {
        type: 'tool',
        name: 'shopping.list',
        args: wantsAll ? { show: 'all' } : { show: 'open' },
      };
    }
    if (wantsDelete && wantsAll && wantsBought) {
      return { type: 'tool', name: 'shopping.clear_bought', args: {} };
    }
    if (wantsDelete && wantsAll) {
      return { type: 'tool', name: 'shopping.clear_all', args: {} };
    }
    if (wantsBought && wantsAll) {
      return { type: 'tool', name: 'shopping.bought_all', args: {} };
    }
    if (refs.length && wantsDelete) {
      return { type: 'tool', name: 'shopping.bulk_delete', args: { refs } };
    }
    if (refs.length && wantsBought) {
      return { type: 'tool', name: 'shopping.bulk_bought', args: { refs } };
    }
    if (refs.length && includesAny(text, unboughtWords)) {
      return {
        type: 'tool',
        name: 'shopping.unbought',
        args: { query: `#${refs[0]}` },
      };
    }
  }

  if (isNote && wantsList) {
    return { type: 'tool', name: 'note.list', args: {} };
  }

  // Par défaut sur des refs + action "terminé/supprimer", on privilégie les todos.
  if (!isCalendar && !isTodo && !isShopping && refs.length && wantsDone) {
    return { type: 'tool', name: 'todo.bulk_done', args: { refs } };
  }
  if (!isCalendar && !isTodo && !isShopping && refs.length && wantsDelete) {
    return { type: 'tool', name: 'todo.bulk_delete', args: { refs } };
  }

  // Follow-up de clarification: "le 1 et le 2" sans répéter le domaine.
  if (!isCalendar && !isTodo && !isShopping && refs.length && st) {
    const prior = normalizeIntentText(`${st.originalUserText} ${st.askedText}`);
    const priorTodo = includesAny(prior, ['todo', 'todos', 'tache', 'taches']);
    const priorShopping = includesAny(prior, [
      'course',
      'courses',
      'shopping',
      'achat',
      'achats',
    ]);
    const priorGmail = includesAny(prior, [
      'gmail',
      'email',
      'mail',
      'courriel',
      'boite de reception',
      'inbox',
    ]);
    if (priorTodo) {
      if (includesAny(prior, deleteWords)) {
        return { type: 'tool', name: 'todo.bulk_delete', args: { refs } };
      }
      if (includesAny(prior, doneWords)) {
        return { type: 'tool', name: 'todo.bulk_done', args: { refs } };
      }
    }
    if (priorShopping) {
      if (includesAny(prior, deleteWords)) {
        return { type: 'tool', name: 'shopping.bulk_delete', args: { refs } };
      }
      if (includesAny(prior, boughtWords)) {
        return { type: 'tool', name: 'shopping.bulk_bought', args: { refs } };
      }
    }
    if (priorGmail) {
      const firstRef = refs[0];
      if (includesAny(prior, ['resume', 'resumer', 'synthese'])) {
        return {
          type: 'tool',
          name: 'gmail.summary',
          args: { ref: firstRef },
        };
      }
      if (
        includesAny(prior, ['non lu', 'non lus', 'pas lu']) &&
        (includesAny(prior, ['marque', 'mettre', 'remet']) || hasMetVerb(prior))
      ) {
        return {
          type: 'tool',
          name: 'gmail.mark_unread',
          args: { ref: firstRef },
        };
      }
      if (
        includesAny(prior, ['lu', 'lue', 'lus']) &&
        (includesAny(prior, ['marque', 'mettre']) || hasMetVerb(prior))
      ) {
        return {
          type: 'tool',
          name: 'gmail.mark_read',
          args: { ref: firstRef },
        };
      }
      if (includesAny(prior, ['supprime', 'supprimer', 'efface', 'retire'])) {
        return { type: 'tool', name: 'gmail.trash', args: { ref: firstRef } };
      }
      return { type: 'tool', name: 'gmail.get', args: { ref: firstRef } };
    }
  }

  return null;
}
