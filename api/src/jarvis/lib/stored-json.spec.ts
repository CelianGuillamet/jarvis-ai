import { parseStoredNumbers, parseStoredTags } from './stored-json';

describe('stored JSON column validation', () => {
  it('preserves valid tag and numeric arrays', () => {
    expect(parseStoredTags('["work","personal"]')).toEqual([
      'work',
      'personal',
    ]);
    expect(parseStoredNumbers('[1,-2,3.5]')).toEqual([1, -2, 3.5]);
    expect(parseStoredNumbers('[]')).toEqual([]);
  });

  it.each(['null', '{}', '"tag"', '["tag",2]', 'invalid'])(
    'rejects malformed tags: %s',
    (raw) => {
      expect(parseStoredTags(raw)).toEqual([]);
    },
  );

  it.each(['null', '{}', '1', '[1,"2"]', '[1,null]', '[1e999]', 'invalid'])(
    'rejects malformed series: %s',
    (raw) => {
      expect(() => parseStoredNumbers(raw)).toThrow();
    },
  );
});
