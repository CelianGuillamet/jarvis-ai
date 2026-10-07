import { calendarTools } from './calendar';
import { gmailTools } from './gmail';
import { noteTools } from './note';
import { shoppingTools } from './shopping';
import { systemTools } from './system';
import { todoTools } from './todo';

export const allToolDefinitions = [
  ...calendarTools,
  ...gmailTools,
  ...noteTools,
  ...shoppingTools,
  ...systemTools,
  ...todoTools,
];
