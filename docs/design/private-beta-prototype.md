# JAR-028: private-beta product prototype

Status: French-only first version confirmed by owner; representative-user feedback explicitly deferred until later. No real account, email or calendar is used.

## Direction and design review

Jarvis is a personal daily workspace: open Today, finish a useful task, review a draft before sending, and find its outcome in Activity. A quiet blue workspace and a visible daily agenda put attention on work rather than on a chat box or developer settings.

Palette: canvas #edf2f8, surface #ffffff, ink #172b4d, secondary #465a76, action #174ea6, success #246344, error #a12a32. Borders separate rows; broad panels group a workflow, rather than giving every datum a card. System humanist sans (`Avenir Next`, `Segoe UI`, sans-serif), with 32/24/18/16/14px scale and 1.5 body line height. Spacing 4/8/12/16/24/32/48px. Radius 8px controls, 16px grouped surfaces. Left-aligned content, maximum readable paragraph width 68ch.

Desktop: a persistent five-area rail beside a main workspace; Today has a task list and agenda. Mobile: five labeled bottom navigation buttons, one column, content clear of the navigation and safe area. The distinctive device is the agenda's time rail; no decorative gradient, fake metrics or ornamental tiles. The first plan resembled a dashboard of equal cards; revised to task rows and one contrasting agenda panel so action priority stays clear.

## Run and boundaries

From `web`, install using the setup guide, then `npm run prototype` and open `/prototype.html`. `npm run build:prototype` creates `dist-prototype`; `npm run build` retains the existing application. The prototype has a separate Vue entry point and no application store/API imports, external assets, persistence, credentials or network requests. Reload resets fictional data. Do not enter personal information. Prototype actions are explicitly simulated.

## Flow coverage

- Onboarding: invitation context → simulated Google sign-in → optional Google connection (explain email/calendar access separately) → timezone preference → first task. Skipping Google keeps tasks and notes available.
- Today: add and complete a task, write a note, see a fictional appointment. Empty and load-error examples preserve the distinction between missing data and unavailable data.
- Inbox: inspect recipient and editable reply, confirm one send, see success in Activity; unknown result blocks resend and requires outcome verification. Reconnection is available for an expired connection.
- Assistant: an explicit suggestion prepares a task; no simulated general AI claims. Confirm or cancel before adding it.
- Activity: review task and email outcomes; resolve an unknown example before considering a new action. No universal undo claim for sent email.
- Settings: account, timezone, Google connection and data-use explanation. No session IDs, API URLs or developer keys.

## Accessibility and state contract

Native buttons/labels/inputs; visible 3px focus outline with offset. Main heading receives focus after navigation/onboarding. Persistent polite live region announces local outcomes; blocking errors use alert. No modal focus traps are needed: review appears inline and cancellation returns focus to its trigger. Controls at least 44px high. Status text accompanies color. No automatic motion; reduced-motion remains respected. Narrow layouts wrap controls, never hide essential labels.

Scenario controls are a research aid outside the product workspace. They reset fictional state into normal, empty, unavailable, expired Google access and unknown-send cases. They are not proposed production UI.

## Moderated validation protocol

Recruit representative individual beta users through the owner; do not contact anyone without instruction. Suggested session: 20 minutes, no real accounts or personal data. Ask participants to think aloud, without telling them which buttons to press.

1. Enter the workspace without connecting Google, set timezone, add and complete a task.
2. Connect the fictional account, inspect a reply's recipient/content, then send it.
3. Load the unknown-send scenario; explain whether sending again is safe and recover its status.
4. Find the note, recent actions and connection settings on a narrow screen.
5. Repeat navigation with keyboard only; ask what labels or feedback were unclear.

Record participant pseudonym/context, date, viewport/input, task completion, assistance, time to first useful action, confusion, severity, exact feedback (with consent), resulting change and retest. Store no identifying information in this public repository. Proposed success target: core task completed without assistance and no participant interprets an unknown email outcome as permission to resend. These targets are proposals, not measured results.

## Evidence and feedback

No representative beta-user sessions have occurred. On 22 September the owner explicitly instructed French only first, feedback much later and continued coding. Feedback is therefore a later release-validation activity, not an implementation/merge gate. Engineering checks do not constitute user validation. Merge after engineering review and required checks; collect feedback under the release-validation work before external beta launch.

### Engineering verification — 22 September 2026

- Web typecheck, zero-warning lint, 12 tests (including three prototype state tests), production build and separate prototype build passed. Production output contains no prototype entry point. Required GitHub checks are recorded on the PR.
- Browser walkthrough: optional-Google onboarding, task creation without Google, inline recipient/draft review, keyboard cancellation with trigger focus restored, one simulated send and Activity result, unknown-send reconciliation without resend, unavailable-data recovery, empty task/calendar states, assistant confirmation and account settings. Review focus was corrected after inspection.
- Desktop 1280px and mobile 390px screenshots inspected; mobile document width equals viewport width (390px). Labeled bottom navigation remains visible. This is a smoke check, not a full device or screen-reader certification.
- Calculated contrast: ink/canvas 12.53:1; secondary/canvas 6.25:1; white/action 7.85:1; secondary/agenda 5.74:1. Disabled controls excluded.
- No beta-user feedback yet. No live Google, authentication, delivery, persistence or production-readiness claim.
