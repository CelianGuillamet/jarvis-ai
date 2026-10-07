import { calendarTools } from './calendar';
import { noteTools } from './note';
import { shoppingTools } from './shopping';
import { systemTools } from './system';
import { todoTools } from './todo';

export const allToolDefinitions = [
  ...calendarTools,
  ...noteTools,
  ...shoppingTools,
  ...systemTools,
  ...todoTools,
];
