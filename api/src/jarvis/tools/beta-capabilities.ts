const deferredPrefixes = [
  'habit.',
  'expense.',
  'budget.',
  'delegation.',
  'analytics.',
  'resource.',
  'reminder.',
];
export const DEFERRED_CAPABILITY_MESSAGE =
  'Cette fonctionnalité est reportée après la bêta privée.';

export function isDeferredCapability(name: string): boolean {
  return (
    deferredPrefixes.some((prefix) => name.startsWith(prefix)) ||
    name === 'gmail.delete'
  );
}
