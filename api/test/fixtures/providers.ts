import type { CalendarProvider } from '../../src/calendar/providers/calendar.provider';
import type {
  GmailProvider,
  GmailMessageDetail,
} from '../../src/gmail/providers/gmail.provider';

export function fakeCalendar() {
  return {
    listEventsInterval: jest
      .fn<
        ReturnType<CalendarProvider['listEventsInterval']>,
        Parameters<CalendarProvider['listEventsInterval']>
      >()
      .mockResolvedValue([]),
    createEvent: jest
      .fn<
        ReturnType<CalendarProvider['createEvent']>,
        Parameters<CalendarProvider['createEvent']>
      >()
      .mockResolvedValue(undefined),
    deleteEvent: jest
      .fn<
        ReturnType<CalendarProvider['deleteEvent']>,
        Parameters<CalendarProvider['deleteEvent']>
      >()
      .mockResolvedValue(undefined),
    updateEvent: jest
      .fn<
        ReturnType<CalendarProvider['updateEvent']>,
        Parameters<CalendarProvider['updateEvent']>
      >()
      .mockResolvedValue(undefined),
  } satisfies CalendarProvider;
}

export function fakeGmail(messages: GmailMessageDetail[] = []) {
  return {
    listMessages: jest
      .fn<
        ReturnType<GmailProvider['listMessages']>,
        Parameters<GmailProvider['listMessages']>
      >()
      .mockResolvedValue(messages),
    getMessage: jest
      .fn<
        ReturnType<GmailProvider['getMessage']>,
        Parameters<GmailProvider['getMessage']>
      >()
      .mockImplementation((_session, id) => {
        const message = messages.find((item) => item.id === id);
        return message
          ? Promise.resolve(message)
          : Promise.reject(new Error('Unknown fixture message'));
      }),
    modifyLabels: jest
      .fn<
        ReturnType<GmailProvider['modifyLabels']>,
        Parameters<GmailProvider['modifyLabels']>
      >()
      .mockResolvedValue(undefined),
    trashMessage: jest
      .fn<
        ReturnType<GmailProvider['trashMessage']>,
        Parameters<GmailProvider['trashMessage']>
      >()
      .mockResolvedValue(undefined),
    untrashMessage: jest
      .fn<
        ReturnType<GmailProvider['untrashMessage']>,
        Parameters<GmailProvider['untrashMessage']>
      >()
      .mockResolvedValue(undefined),
    deleteMessage: jest
      .fn<
        ReturnType<GmailProvider['deleteMessage']>,
        Parameters<GmailProvider['deleteMessage']>
      >()
      .mockResolvedValue(undefined),
    sendMessage: jest
      .fn<
        ReturnType<GmailProvider['sendMessage']>,
        Parameters<GmailProvider['sendMessage']>
      >()
      .mockResolvedValue(undefined),
  } satisfies GmailProvider;
}
