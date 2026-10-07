import { calendarTools } from './calendar';
import { contactTools } from './contact';
import { deferredTools } from './deferred';
import { dependencyTools } from './dependency';
import { gmailTools } from './gmail';
import { goalTools } from './goal';
import { knowledgeTools } from './knowledge';
import { memoryTools } from './memory';
import { missionTools } from './mission';
import { noteTools } from './note';
import { schedulingTools } from './scheduling';
import { shoppingTools } from './shopping';
import { systemTools } from './system';
import { todoTools } from './todo';

export const allToolDefinitions = [
  ...calendarTools,
  ...contactTools,
  ...deferredTools,
  ...dependencyTools,
  ...gmailTools,
  ...goalTools,
  ...knowledgeTools,
  ...memoryTools,
  ...missionTools,
  ...noteTools,
  ...schedulingTools,
  ...shoppingTools,
  ...systemTools,
  ...todoTools,
];
