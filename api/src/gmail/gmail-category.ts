export const GMAIL_CATEGORY_LABEL_IDS = {
  primary: 'CATEGORY_PERSONAL',
  promotions: 'CATEGORY_PROMOTIONS',
  social: 'CATEGORY_SOCIAL',
  updates: 'CATEGORY_UPDATES',
  forums: 'CATEGORY_FORUMS',
} as const;

export type GmailCategory = keyof typeof GMAIL_CATEGORY_LABEL_IDS;

export const GMAIL_CATEGORIES = Object.keys(
  GMAIL_CATEGORY_LABEL_IDS,
) as GmailCategory[];

export const GMAIL_CATEGORY_LABELS_FR: Record<GmailCategory, string> = {
  primary: 'Boite principale',
  promotions: 'Promotions',
  social: 'Reseaux sociaux',
  updates: 'Mises a jour',
  forums: 'Forums',
};

const LABEL_ID_TO_CATEGORY: Record<string, GmailCategory> = {
  CATEGORY_PERSONAL: 'primary',
  CATEGORY_PRIMARY: 'primary',
  CATEGORY_PROMOTIONS: 'promotions',
  CATEGORY_SOCIAL: 'social',
  CATEGORY_UPDATES: 'updates',
  CATEGORY_FORUMS: 'forums',
};

export function getGmailCategoryFromLabels(
  labels: string[] | null | undefined,
) {
  if (!labels?.length) return null;

  for (const label of labels) {
    const category = LABEL_ID_TO_CATEGORY[label];
    if (category) return category;
  }

  return null;
}

export function getGmailCategoryLabelId(category: GmailCategory) {
  return GMAIL_CATEGORY_LABEL_IDS[category];
}

export function getGmailCategoryLabel(
  category: GmailCategory | null | undefined,
) {
  if (!category) return 'Autres';
  return GMAIL_CATEGORY_LABELS_FR[category];
}

export function getGmailCategoryPriority(
  category: GmailCategory | null | undefined,
) {
  switch (category) {
    case 'primary':
      return 5;
    case 'updates':
      return 4;
    case 'forums':
      return 3;
    case 'social':
      return 2;
    case 'promotions':
      return 1;
    default:
      return 0;
  }
}
