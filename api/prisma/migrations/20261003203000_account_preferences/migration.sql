ALTER TABLE "User"
  ADD COLUMN "displayTimezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
  ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'dark',
  ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ADD CONSTRAINT "User_theme_check" CHECK ("theme" IN ('light', 'dark'));
