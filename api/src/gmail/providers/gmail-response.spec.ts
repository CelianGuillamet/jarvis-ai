import {
  GmailListSchema,
  GmailMessageSchema,
  validateGmailResponse,
} from './gmail-response';

describe('Gmail response validation', () => {
  const message = {
    id: 'message',
    threadId: 'thread',
    internalDate: '1790812800000',
  };
  it('accepts empty lists and messages with no optional content', () => {
    expect(validateGmailResponse({}, GmailListSchema)).toEqual({});
    expect(validateGmailResponse(message, GmailMessageSchema)).toEqual(message);
  });
  it.each([
    null,
    { messages: null },
    { messages: [{}] },
    { messages: [{ id: ' ' }] },
  ])('rejects invalid lists before fetching any message', (payload) => {
    expect(() => validateGmailResponse(payload, GmailListSchema)).toThrow(
      'La réponse de Gmail est invalide.',
    );
  });
  it.each([
    null,
    { ...message, internalDate: 'invalid' },
    { ...message, internalDate: '999999999999999999999' },
    { ...message, threadId: null },
    { ...message, labelIds: [1] },
    { ...message, payload: { headers: [{ name: 'Subject', value: 2 }] } },
    { ...message, payload: { parts: [{ body: { data: 12 } }] } },
  ])('rejects invalid message fields including nested parts', (payload) => {
    expect(() => validateGmailResponse(payload, GmailMessageSchema)).toThrow(
      'La réponse de Gmail est invalide.',
    );
  });
});
