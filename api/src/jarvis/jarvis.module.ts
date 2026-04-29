import { Module } from '@nestjs/common';
import { JarvisService } from './services/jarvis.service';
import { JarvisController } from './jarvis.controller';
import { PendingActionsService } from './services/pending-action.service';
import { HumanProfileService } from './services/human-profile.service';
import { JarvisMemoryService } from './services/jarvis-memory.service';
import { JarvisMissionService } from './services/jarvis-mission.service';
import { JarvisAuditService } from './services/jarvis-audit.service';
import { JarvisWorkflowService } from './services/jarvis-workflow.service';
import { JarvisGoalService } from './services/jarvis-goal.service';
import { ConflictDetectionService } from './services/conflict-detection.service';
import { JarvisDependencyTrackingService } from './services/jarvis-dependency-tracking.service';
import { JarvisResourceAllocationService } from './services/jarvis-resource-allocation.service';
import { JarvisPredictiveAnalyticsService } from './services/jarvis-predictive-analytics.service';
import { JarvisSmartSchedulingService } from './services/jarvis-smart-scheduling.service';
import { JarvisContextualHelpService } from './services/jarvis-contextual-help.service';
import { JarvisSearchService } from './services/jarvis-search.service';
import { JarvisKnowledgeBaseService } from './services/jarvis-knowledge-base.service';
import { JarvisTimeInsightsService } from './services/jarvis-time-insights.service';
import { JarvisDelegationService } from './services/jarvis-delegation.service';
import { JarvisReminderService } from './services/jarvis-reminder.service';
import { JarvisHabitService } from './services/jarvis-habit.service';
import { JarvisContactService } from './services/jarvis-contact.service';
import { JarvisFinanceService } from './services/jarvis-finance.service';

@Module({
  providers: [
    JarvisService,
    PendingActionsService,
    HumanProfileService,
    JarvisMemoryService,
    JarvisMissionService,
    JarvisAuditService,
    JarvisWorkflowService,
    JarvisGoalService,
    ConflictDetectionService,
    JarvisDependencyTrackingService,
    JarvisResourceAllocationService,
    JarvisPredictiveAnalyticsService,
    JarvisSmartSchedulingService,
    JarvisContextualHelpService,
    JarvisSearchService,
    JarvisKnowledgeBaseService,
    JarvisTimeInsightsService,
    JarvisDelegationService,
    JarvisReminderService,
    JarvisHabitService,
    JarvisContactService,
    JarvisFinanceService,
  ],
  controllers: [JarvisController],
})
export class JarvisModule {}
