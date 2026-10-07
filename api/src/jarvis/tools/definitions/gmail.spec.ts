import { gmailTools } from './gmail';

const byName = Object.fromEntries(gmailTools.map((tool) => [tool.name, tool]));

describe('gmail definitions', () => {
  it('keeps gmail.delete deferred and gated on permanent delete', () => {
    expect(byName['gmail.delete'].deferred).toBe(true);
    expect(byName['gmail.delete'].requires).toBe('gmail.permanent_delete');
  });

  it('gates sending and label changes on their own scopes', () => {
    expect(byName['gmail.send'].requires).toBe('gmail.send');
    for (const name of ['gmail.archive', 'gmail.trash', 'gmail.mark_read'])
      expect(byName[name].requires).toBe('gmail.modify');
    expect(byName['gmail.list'].requires).toBe('gmail.read');
  });

  it('keeps every other gmail tool available', () => {
    for (const tool of gmailTools)
      expect(tool.deferred).toBe(tool.name === 'gmail.delete');
  });
});
