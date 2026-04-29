(() => {
  const STORAGE_KEYS = {
    apiBase: 'jarvis.apiBase',
    sessionId: 'jarvis.sessionId',
    voiceLang: 'jarvis.voiceLang',
    speakEnabled: 'jarvis.speakEnabled',
    autoSendVoice: 'jarvis.autoSendVoice',
  };

  const FETCH_TIMEOUT_MS = 15_000;
  const STATUS_REFRESH_INTERVAL_MS = 45_000;
  const CLOCK_REFRESH_INTERVAL_MS = 1_000;

  const $ = (id) => document.getElementById(id);
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const state = {
    apiBase:
      localStorage.getItem(STORAGE_KEYS.apiBase) || window.location.origin,
    sessionId:
      new URLSearchParams(window.location.search).get('sessionId') ||
      localStorage.getItem(STORAGE_KEYS.sessionId) ||
      'default',
    voiceLang: localStorage.getItem(STORAGE_KEYS.voiceLang) || 'fr-FR',
    speakEnabled: localStorage.getItem(STORAGE_KEYS.speakEnabled) === 'true',
    autoSendVoice: localStorage.getItem(STORAGE_KEYS.autoSendVoice) === 'true',
    pendingAction: null,
    busy: false,
    refreshing: false,
    recognition: null,
    recording: false,
    lastJarvisText: '',
    lastSnapshot: null,
    hydratedOnce: false,
    lastSyncAt: null,
    statusTone: 'warn',
  };

  const els = {
    deck: $('deck'),
    heroDot: $('heroDot'),
    heroState: $('heroState'),
    heroSession: $('heroSession'),
    heroTimezone: $('heroTimezone'),
    heroSync: $('heroSync'),
    heroAttention: $('heroAttention'),
    heroLlm: $('heroLlm'),
    heroWeb: $('heroWeb'),
    liveClock: $('liveClock'),
    toolbarStatus: $('toolbarStatus'),
    apiBase: $('apiBase'),
    sessionId: $('sessionId'),
    voiceLang: $('voiceLang'),
    configSummary: $('configSummary'),
    composerSession: $('composerSession'),
    composerApi: $('composerApi'),
    messages: $('messages'),
    typingIndicator: $('typingIndicator'),
    prompt: $('prompt'),
    send: $('send'),
    micToggle: $('micToggle'),
    speakNow: $('speakNow'),
    speakEnabled: $('speakEnabled'),
    autoSendVoice: $('autoSendVoice'),
    status: $('status'),
    refreshDeck: $('refreshDeck'),
    hydrateHistory: $('hydrateHistory'),
    clearLocalChat: $('clearLocalChat'),
    saveSession: $('saveSession'),
    openGoogleAuth: $('openGoogleAuth'),
    quickActions: $('quickActions'),
    quickActionsEmpty: $('quickActionsEmpty'),
    choices: $('choices'),
    choicesEmpty: $('choicesEmpty'),
    pendingBox: $('pendingBox'),
    pendingActions: $('pendingActions'),
    integrationBadges: $('integrationBadges'),
    profileSummary: $('profileSummary'),
    nextEvent: $('nextEvent'),
    topEmail: $('topEmail'),
    activeMission: $('activeMission'),
    proactiveList: $('proactiveList'),
    proactiveEmpty: $('proactiveEmpty'),
    metricTodos: $('metricTodos'),
    metricTodosSub: $('metricTodosSub'),
    metricEmails: $('metricEmails'),
    metricEmailsSub: $('metricEmailsSub'),
    metricEvents: $('metricEvents'),
    metricEventsSub: $('metricEventsSub'),
    metricNotes: $('metricNotes'),
    metricNotesSub: $('metricNotesSub'),
    memoryList: $('memoryList'),
    memoryEmpty: $('memoryEmpty'),
    workflowList: $('workflowList'),
    workflowEmpty: $('workflowEmpty'),
    auditFeed: $('auditFeed'),
    auditEmpty: $('auditEmpty'),
    timeline: $('timeline'),
    timelineEmpty: $('timelineEmpty'),
    meta: $('meta'),
    goalsList: $('goalsList'),
    goalsEmpty: $('goalsEmpty'),
    conflictsList: $('conflictsList'),
    conflictsEmpty: $('conflictsEmpty'),
    scheduleList: $('scheduleList'),
    scheduleEmpty: $('scheduleEmpty'),
    resourcesList: $('resourcesList'),
    resourcesEmpty: $('resourcesEmpty'),
  };

  const typingLabel = els.typingIndicator?.lastElementChild ?? null;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let s = escapeHtml(text);
    // bold
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    // italic
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    // inline code
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // bullet list lines (- item) grouped into <ul>
    s = s.replace(/((?:^|\n)- [^\n]+)+/g, (block) => {
      const items = block
        .trim()
        .split('\n')
        .map((line) => `<li>${line.replace(/^- /, '').trim()}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    });
    // line breaks (but not inside ul)
    s = s.replace(/\n(?!<\/?(ul|li))/g, '<br>');
    return s;
  }

  function safeDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatTime(value) {
    const date = safeDate(value);
    if (!date) return '--:--';
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDateTime(value) {
    const date = safeDate(value);
    if (!date) return 'Date indisponible';
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function relativeDate(value) {
    const date = safeDate(value);
    if (!date) return 'temps indisponible';

    const delta = Math.round((date.getTime() - Date.now()) / 60_000);
    if (Math.abs(delta) < 1) return 'maintenant';

    if (delta > 0) {
      if (delta < 60) return `dans ${delta} min`;
      const hours = Math.floor(delta / 60);
      const minutes = delta % 60;
      return minutes ? `dans ${hours} h ${minutes}` : `dans ${hours} h`;
    }

    const abs = Math.abs(delta);
    if (abs < 60) return `il y a ${abs} min`;
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    return minutes ? `il y a ${hours} h ${minutes}` : `il y a ${hours} h`;
  }

  function compactApiBase(value) {
    try {
      const url = new URL(value);
      if (url.origin === window.location.origin) return 'local';
      return url.host || value;
    } catch {
      return value || 'local';
    }
  }

  function normalizeUrl(path) {
    return new URL(path, state.apiBase).toString();
  }

  function safeErrorMessage(error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'La requête a expiré.';
    }
    if (error instanceof Error && error.message) return error.message;
    return 'Erreur inconnue.';
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.message === 'string' && data.message
            ? data.message
            : `HTTP ${response.status}`,
        );
      }

      return data;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function persistPreferences() {
    localStorage.setItem(STORAGE_KEYS.apiBase, state.apiBase);
    localStorage.setItem(STORAGE_KEYS.sessionId, state.sessionId);
    localStorage.setItem(STORAGE_KEYS.voiceLang, state.voiceLang);
    localStorage.setItem(STORAGE_KEYS.speakEnabled, String(state.speakEnabled));
    localStorage.setItem(
      STORAGE_KEYS.autoSendVoice,
      String(state.autoSendVoice),
    );
  }

  function syncPreferenceControls() {
    els.apiBase.value = state.apiBase;
    els.sessionId.value = state.sessionId;
    els.voiceLang.value = state.voiceLang;
    els.speakEnabled.checked = state.speakEnabled;
    els.autoSendVoice.checked = state.autoSendVoice;

    els.heroSession.textContent = state.sessionId;
    els.composerSession.textContent = state.sessionId;
    els.composerApi.textContent = compactApiBase(state.apiBase);
  }

  function syncSessionInUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('sessionId', state.sessionId);
    window.history.replaceState({}, '', url);
  }

  function updateSyncIndicators() {
    if (!state.lastSyncAt) {
      els.heroSync.textContent = '--';
      els.toolbarStatus.textContent = 'Dernière synchro indisponible';
      return;
    }

    els.heroSync.textContent = formatTime(state.lastSyncAt);
    els.toolbarStatus.textContent = `Dernière synchro ${relativeDate(
      state.lastSyncAt,
    )}`;
  }

  function renderEngineState() {
    const tone = state.statusTone || (state.busy ? 'warn' : 'ok');
    const label =
      tone === 'err'
        ? 'Alerte'
        : state.busy
          ? 'Traitement'
          : tone === 'ok'
            ? 'Prêt'
            : 'Surveillance';

    els.heroState.textContent = label;
    els.heroDot.className =
      tone === 'err'
        ? 'dot danger'
        : tone === 'warn' || state.busy
          ? 'dot warn'
          : 'dot';
  }

  function setStatus(text, tone = 'warn') {
    state.statusTone = tone;
    els.status.textContent = text;
    els.status.className = `status-line ${tone}`.trim();
    renderEngineState();
  }

  function setTyping(visible, text = 'Jarvis analyse la demande…') {
    if (!els.typingIndicator) return;
    els.typingIndicator.hidden = !visible;
    if (typingLabel) typingLabel.textContent = text;
  }

  function setButtonsDisabled(container, disabled) {
    if (!container) return;
    for (const button of container.querySelectorAll('button')) {
      button.disabled = disabled;
    }
  }

  function setBusy(value, typingText = 'Jarvis analyse la demande…') {
    state.busy = value;
    els.deck.setAttribute('aria-busy', String(value));

    els.prompt.disabled = value;
    els.send.disabled = value;
    els.refreshDeck.disabled = value;
    els.hydrateHistory.disabled = value;
    els.saveSession.disabled = value;

    setButtonsDisabled(els.quickActions, value);
    setButtonsDisabled(els.choices, value);
    setButtonsDisabled(els.pendingActions, value);
    setButtonsDisabled(els.proactiveList, value);
    setButtonsDisabled(els.workflowList, value);

    for (const button of document.querySelectorAll('#quickChips button')) {
      button.disabled = value;
    }

    setTyping(value, typingText);
    updateMicButton();
    renderEngineState();
  }

  function scrollMessagesToEnd() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function createMessage(role, text, meta = {}) {
    const wrap = document.createElement('article');
    wrap.className = `msg ${role}`;

    const head = document.createElement('div');
    head.className = 'msg-head';

    const label = document.createElement('span');
    label.textContent =
      meta.label ||
      (role === 'user'
        ? 'Opérateur'
        : role === 'jarvis'
          ? 'Jarvis'
          : 'Système');
    head.appendChild(label);

    const time = document.createElement('span');
    time.textContent = meta.at ? formatTime(meta.at) : formatTime(Date.now());
    head.appendChild(time);

    const body = document.createElement('div');
    body.className = 'msg-body';
    if (role === 'jarvis' || role === 'system') {
      body.innerHTML = renderMarkdown(text);
    } else {
      body.textContent = text;
    }

    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  function addMessage(role, text, meta = {}) {
    const {
      announce = role === 'jarvis',
      scroll = true,
      ...messageMeta
    } = meta;
    const node = createMessage(role, text, messageMeta);
    els.messages.appendChild(node);

    if (scroll) scrollMessagesToEnd();
    if (role === 'jarvis') {
      state.lastJarvisText = text;
      if (announce) speak(text);
    }
  }

  function clearMessages() {
    els.messages.innerHTML = '';
  }

  function hydrateMessages(activity) {
    clearMessages();

    if (!Array.isArray(activity) || activity.length === 0) {
      addMessage(
        'system',
        'Pont de commandement prêt. Lance un briefing ou commence à parler avec Jarvis.',
        { announce: false },
      );
      return;
    }

    for (const item of activity) {
      addMessage('user', item.userText || '(message vide)', {
        at: item.at,
        announce: false,
        scroll: false,
      });

      if (item.assistantText) {
        addMessage('jarvis', item.assistantText, {
          at: item.at,
          announce: false,
          scroll: false,
        });
      }
    }

    scrollMessagesToEnd();
  }

  function speak(text, options = {}) {
    const { force = false } = options;
    if ((!state.speakEnabled && !force) || !window.speechSynthesis || !text) {
      return;
    }

    const content = text.replace(/\s+/g, ' ').trim();
    if (!content) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(content.slice(0, 700));
    utterance.lang = state.voiceLang || 'fr-FR';

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((voice) => voice.lang === utterance.lang) ||
      voices.find((voice) => voice.lang.startsWith('fr')) ||
      null;

    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 1;
    utterance.pitch = 0.95;

    window.speechSynthesis.speak(utterance);
  }

  function updateClock() {
    const now = new Date();
    els.liveClock.textContent = now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    updateSyncIndicators();
  }

  function renderBadge(label, tone = 'neutral') {
    const span = document.createElement('span');
    span.className = `badge ${tone}`.trim();
    span.textContent = label;
    return span;
  }

  function toggleEmptyState(element, hasItems) {
    element.style.display = hasItems ? 'none' : 'block';
  }

  function renderChoices(choices) {
    els.choices.innerHTML = '';
    const items = Array.isArray(choices)
      ? choices.filter((choice) => typeof choice === 'string' && choice.trim())
      : [];

    toggleEmptyState(els.choicesEmpty, items.length > 0);

    for (const choice of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice;
      button.onclick = () => sendChat(choice);
      els.choices.appendChild(button);
    }
  }

  function extractSuggestedCommands(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const start = lines.findIndex((line) =>
      /^Commandes suggerees/i.test(line.trim()),
    );

    if (start < 0) return [];

    const out = [];
    for (let index = start + 1; index < lines.length; index++) {
      const line = lines[index].trim();
      if (!line) continue;
      if (!line.startsWith('- ')) break;
      out.push(line.slice(2).trim());
    }

    return out.slice(0, 5);
  }

  function prefillPrompt(prefix) {
    els.prompt.value = prefix || '';
    els.prompt.focus();
    els.prompt.setSelectionRange(
      els.prompt.value.length,
      els.prompt.value.length,
    );
    setStatus('Prompt préparé.', 'ok');
  }

  function renderPending(pendingAction) {
    state.pendingAction = pendingAction || null;
    els.pendingActions.innerHTML = '';
    els.pendingBox.innerHTML = '';

    if (!state.pendingAction) {
      const empty = document.createElement('p');
      empty.textContent = 'Aucune confirmation requise.';
      els.pendingBox.appendChild(empty);
      return;
    }

    const summary = document.createElement('p');
    summary.textContent =
      state.pendingAction.summary ||
      'Une action sensible est prête. Tu peux confirmer via endpoint ou répondre dans le chat.';
    els.pendingBox.appendChild(summary);

    const badges = document.createElement('div');
    badges.className = 'badges';

    const riskTone =
      state.pendingAction.risk === 'high'
        ? 'danger'
        : state.pendingAction.risk === 'medium'
          ? 'warn'
          : 'neutral';
    const confidenceTone =
      state.pendingAction.confidence === 'high'
        ? 'ok'
        : state.pendingAction.confidence === 'medium'
          ? 'warn'
          : 'neutral';

    if (state.pendingAction.risk) {
      badges.appendChild(
        renderBadge(`Risque ${state.pendingAction.risk}`, riskTone),
      );
    }

    if (state.pendingAction.confidence) {
      badges.appendChild(
        renderBadge(
          `Confiance ${state.pendingAction.confidence}`,
          confidenceTone,
        ),
      );
    }

    if (state.pendingAction.planner) {
      badges.appendChild(
        renderBadge(`Décision ${state.pendingAction.planner}`, 'neutral'),
      );
    }

    if (badges.childElementCount > 0) {
      els.pendingBox.appendChild(badges);
    }

    if (state.pendingAction.confirmationReason === 'intent_medium_confidence') {
      const caution = document.createElement('p');
      caution.textContent =
        'La demande paraît plausible, mais le ciblage reste ambigu. Une validation explicite est préférable avant exécution.';
      els.pendingBox.appendChild(caution);
    }

    const args = document.createElement('pre');
    args.textContent =
      `${state.pendingAction.name}\n` +
      JSON.stringify(state.pendingAction.args || {}, null, 2);
    els.pendingBox.appendChild(args);

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'button-warn';
    confirm.textContent = 'Confirmer via endpoint';
    confirm.onclick = () => confirmViaEndpoint(state.pendingAction.id);
    els.pendingActions.appendChild(confirm);

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.textContent = 'Répondre "oui"';
    yes.onclick = () => sendChat('oui');
    els.pendingActions.appendChild(yes);

    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'button-danger';
    no.textContent = 'Répondre "non"';
    no.onclick = () => sendChat('non');
    els.pendingActions.appendChild(no);
  }

  function renderQuickActions(actions) {
    els.quickActions.innerHTML = '';
    const items = Array.isArray(actions) ? actions : [];

    toggleEmptyState(els.quickActionsEmpty, items.length > 0);

    for (const action of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        action.kind === 'confirm'
          ? 'button-warn'
          : action.kind === 'link'
            ? 'button-ghost'
            : '';
      button.textContent = action.label || 'Action';
      button.onclick = () => {
        if (action.kind === 'link' && action.href) {
          window.open(normalizeUrl(action.href), '_blank', 'noopener');
          return;
        }

        if (action.prompt) {
          sendChat(action.prompt);
        }
      };
      els.quickActions.appendChild(button);
    }
  }

  function renderProactiveSuggestions(suggestions) {
    els.proactiveList.innerHTML = '';
    const items = Array.isArray(suggestions) ? suggestions : [];

    toggleEmptyState(els.proactiveEmpty, items.length > 0);

    for (const suggestion of items) {
      const card = document.createElement('article');
      card.className = `suggestion-card ${suggestion.tone || 'neutral'}`.trim();

      const title = document.createElement('strong');
      title.textContent = suggestion.title || 'Signal';
      card.appendChild(title);

      const detail = document.createElement('p');
      detail.textContent = suggestion.detail || '';
      card.appendChild(detail);

      if (suggestion.prompt || suggestion.href) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'button-ghost';
        action.textContent = suggestion.href ? 'Ouvrir' : 'Lancer';
        action.onclick = () => {
          if (suggestion.href) {
            window.open(normalizeUrl(suggestion.href), '_blank', 'noopener');
            return;
          }

          if (suggestion.prompt) {
            sendChat(suggestion.prompt);
          }
        };
        card.appendChild(action);
      }

      els.proactiveList.appendChild(card);
    }
  }

  function renderGoals(goals) {
    if (!els.goalsList) return;
    els.goalsList.innerHTML = '';
    const items = Array.isArray(goals) ? goals : [];
    toggleEmptyState(els.goalsEmpty, items.length > 0);

    const renderGoal = (goal, depth) => {
      const item = document.createElement('div');
      item.className = `goal-item ${goal.priority >= 3 ? 'priority-high' : goal.priority >= 1 ? 'priority-med' : ''}`.trim();
      item.style.marginLeft = `${depth * 12}px`;

      const title = document.createElement('div');
      title.className = 'goal-item-title';
      title.textContent = goal.title;
      item.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'goal-item-meta';
      const parts = [];
      if (goal.priority) parts.push(`P${goal.priority}`);
      if (goal.targetDate) parts.push(goal.targetDate.slice(0, 10));
      if (goal.status !== 'active') parts.push(goal.status);
      meta.textContent = parts.join(' · ');
      if (parts.length) item.appendChild(meta);

      els.goalsList.appendChild(item);
      if (Array.isArray(goal.subGoals)) {
        goal.subGoals.forEach((sg) => renderGoal(sg, depth + 1));
      }
    };

    items.forEach((g) => renderGoal(g, 0));
  }

  function renderConflicts(reports) {
    if (!els.conflictsList) return;
    els.conflictsList.innerHTML = '';
    const items = Array.isArray(reports) ? reports : [];
    toggleEmptyState(els.conflictsEmpty, items.length > 0);

    for (const report of items) {
      const item = document.createElement('div');
      item.className = `conflict-item ${report.severity === 'critical' ? 'critical' : 'warning'}`;

      const type = document.createElement('div');
      type.className = 'conflict-item-type';
      type.textContent = `${report.severity} · ${report.type}`;
      item.appendChild(type);

      const text = document.createElement('p');
      text.style.cssText = 'margin:0;font-size:13px;color:var(--muted-strong)';
      text.textContent = report.remediation || `${report.items.length} problème(s) détecté(s)`;
      item.appendChild(text);

      els.conflictsList.appendChild(item);
    }
  }

  function renderSchedule(suggestions) {
    if (!els.scheduleList) return;
    els.scheduleList.innerHTML = '';
    const items = Array.isArray(suggestions) ? suggestions.filter((s) => !s.applied).slice(0, 4) : [];
    toggleEmptyState(els.scheduleEmpty, items.length > 0);

    for (const s of items) {
      const item = document.createElement('div');
      item.className = 'schedule-item';

      const time = document.createElement('span');
      time.className = 'schedule-item-time';
      time.textContent = new Date(s.suggestedTime).toLocaleString('fr-FR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      item.appendChild(time);

      const rationale = document.createElement('span');
      rationale.className = 'schedule-item-rationale';
      rationale.textContent = s.rationale;
      item.appendChild(rationale);

      els.scheduleList.appendChild(item);
    }
  }

  function renderResources(capacities) {
    if (!els.resourcesList) return;
    els.resourcesList.innerHTML = '';
    const items = Array.isArray(capacities) ? capacities : [];
    toggleEmptyState(els.resourcesEmpty, items.length > 0);

    for (const c of items) {
      const item = document.createElement('div');
      item.className = 'resource-item';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;font-size:13px';
      header.innerHTML = `<span style="color:var(--text);font-weight:600">${escapeHtml(c.resourceType)}/${escapeHtml(c.resourceName)}</span><span style="color:var(--muted)">${c.utilizationPercentage?.toFixed(0) ?? 0}%</span>`;
      item.appendChild(header);

      const barWrap = document.createElement('div');
      barWrap.className = 'resource-bar-wrap';
      const bar = document.createElement('div');
      const pct = Math.min(c.utilizationPercentage ?? 0, 100);
      bar.className = `resource-bar${pct >= 90 ? ' danger' : pct >= 75 ? ' warn' : ''}`;
      bar.style.width = `${pct}%`;
      barWrap.appendChild(bar);
      item.appendChild(barWrap);

      const label = document.createElement('div');
      label.className = 'resource-item-label';
      label.textContent = `${(c.totalUsed ?? 0).toFixed(1)}h / ${(c.totalAllocated ?? 0).toFixed(1)}h allouées`;
      item.appendChild(label);

      els.resourcesList.appendChild(item);
    }
  }

  function renderMemory(turns) {
    els.memoryList.innerHTML = '';
    const items = Array.isArray(turns) ? turns.slice(-6).reverse() : [];

    toggleEmptyState(els.memoryEmpty, items.length > 0);

    for (const turn of items) {
      const item = document.createElement('div');
      item.className = 'memory-item';

      const title = document.createElement('strong');
      title.textContent = `${turn.kind}${turn.toolName ? ` · ${turn.toolName}` : ''}${turn.at ? ` · ${relativeDate(turn.at)}` : ''}`;
      item.appendChild(title);

      const user = document.createElement('p');
      user.textContent = `Utilisateur: ${turn.userText || '(vide)'}`;
      item.appendChild(user);

      const assistant = document.createElement('p');
      assistant.textContent = `Assistant: ${turn.assistantText || '(vide)'}`;
      item.appendChild(assistant);

      els.memoryList.appendChild(item);
    }
  }

  function renderWorkflowMemory(workflows, suggestions) {
    els.workflowList.innerHTML = '';

    const items = Array.isArray(workflows) ? workflows : [];
    const nextPrompts = Array.isArray(suggestions)
      ? suggestions.filter(
          (prompt, index, list) =>
            typeof prompt === 'string' &&
            prompt.trim() &&
            list.indexOf(prompt) === index,
        )
      : [];

    toggleEmptyState(
      els.workflowEmpty,
      items.length > 0 || nextPrompts.length > 0,
    );

    if (nextPrompts.length > 0) {
      const featured = document.createElement('article');
      featured.className = 'workflow-featured';

      const title = document.createElement('strong');
      title.textContent = 'Suite probable';
      featured.appendChild(title);

      const detail = document.createElement('p');
      detail.textContent =
        'Jarvis reconnaît une continuation plausible à partir de tes dernières actions.';
      featured.appendChild(detail);

      const actions = document.createElement('div');
      actions.className = 'workflow-actions';

      for (const prompt of nextPrompts.slice(0, 3)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button-ghost';
        button.textContent = prompt;
        button.onclick = () => sendChat(prompt);
        actions.appendChild(button);
      }

      featured.appendChild(actions);
      els.workflowList.appendChild(featured);
    }

    for (const workflow of items) {
      const item = document.createElement('article');
      item.className = 'workflow-item';

      const title = document.createElement('strong');
      title.textContent = `Après ${workflow.triggerSummary || 'une action récente'}`;
      item.appendChild(title);

      const prompt = document.createElement('p');
      prompt.innerHTML = `Suite observée: <span class="workflow-prompt"></span>`;
      prompt.querySelector('.workflow-prompt').textContent =
        workflow.followUpPrompt || 'Aucune suggestion mémorisée.';
      item.appendChild(prompt);

      const meta = document.createElement('div');
      meta.className = 'badges';
      meta.appendChild(
        renderBadge(
          workflow.usageCount > 1
            ? `${workflow.usageCount} répétitions`
            : '1 répétition',
          workflow.usageCount > 2 ? 'ok' : 'neutral',
        ),
      );

      if (workflow.lastUsedAt) {
        meta.appendChild(
          renderBadge(`Vu ${relativeDate(workflow.lastUsedAt)}`, 'neutral'),
        );
      }

      item.appendChild(meta);

      if (workflow.followUpPrompt) {
        const actions = document.createElement('div');
        actions.className = 'workflow-actions';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button-ghost';
        button.textContent = 'Relancer';
        button.onclick = () => sendChat(workflow.followUpPrompt);
        actions.appendChild(button);

        item.appendChild(actions);
      }

      els.workflowList.appendChild(item);
    }
  }

  function renderAudit(events) {
    els.auditFeed.innerHTML = '';
    const items = Array.isArray(events) ? events : [];

    toggleEmptyState(els.auditEmpty, items.length > 0);

    for (const event of items) {
      const item = document.createElement('article');
      item.className = `audit-item ${event.status || 'neutral'}`.trim();

      const title = document.createElement('strong');
      title.textContent = `${event.toolName || 'action'} · ${relativeDate(
        event.createdAt,
      )}`;
      item.appendChild(title);

      const summary = document.createElement('p');
      summary.textContent = event.summary || 'Aucune synthèse disponible.';
      item.appendChild(summary);

      const meta = document.createElement('div');
      meta.className = 'badges';
      meta.appendChild(
        renderBadge(
          `Statut ${event.status || 'unknown'}`,
          event.status === 'completed'
            ? 'ok'
            : event.status === 'failed' ||
                event.status === 'cancelled' ||
                event.status === 'expired'
              ? 'danger'
              : event.status === 'pending'
                ? 'warn'
                : 'neutral',
        ),
      );
      if (event.risk) {
        meta.appendChild(renderBadge(`Risque ${event.risk}`, 'neutral'));
      }
      if (event.planner) {
        meta.appendChild(renderBadge(`Décision ${event.planner}`, 'neutral'));
      }
      item.appendChild(meta);

      const detail = document.createElement('p');
      detail.textContent =
        event.resultPreview ||
        event.errorMessage ||
        (event.status === 'pending'
          ? 'En attente de confirmation ou d’exécution.'
          : 'Aucun détail supplémentaire.');
      item.appendChild(detail);

      els.auditFeed.appendChild(item);
    }
  }

  function renderTimeline(activity) {
    els.timeline.innerHTML = '';
    const items = Array.isArray(activity) ? [...activity].reverse() : [];

    toggleEmptyState(els.timelineEmpty, items.length > 0);

    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'timeline-item';

      const title = document.createElement('strong');
      title.textContent = item.toolName
        ? `${item.toolName} · ${relativeDate(item.at)}`
        : relativeDate(item.at);
      row.appendChild(title);

      const user = document.createElement('p');
      user.textContent = item.userText || '(message utilisateur vide)';
      row.appendChild(user);

      if (item.assistantText) {
        const assistant = document.createElement('p');
        assistant.textContent = item.assistantText;
        row.appendChild(assistant);
      }

      els.timeline.appendChild(row);
    }
  }

  function renderMeta(meta) {
    els.meta.textContent =
      typeof meta === 'string' ? meta : JSON.stringify(meta || {}, null, 2);
  }

  function describeAttention(snapshot) {
    const metrics = snapshot.metrics || {};

    if (snapshot.pendingAction) return 'Validation';
    if ((metrics.unreadEmails || 0) > 0) return 'Élevée';
    if ((metrics.eventsToday || 0) > 0) return 'Active';
    if ((metrics.openTodos || 0) > 0) return 'Sous contrôle';
    return 'Nominal';
  }

  function describeProfile(profile, snapshot) {
    const parts = [
      `Mode ${profile.speechMode || 'tu'}`,
      `verbosité ${profile.verbosity || 'normal'}`,
      `nom ${profile.preferredName || 'non défini'}`,
      `${profile.turnCount ?? 0} tours`,
    ];

    const project =
      snapshot?.worldModel?.factsByLayer?.project?.find(
        (item) => item.key === 'primary_project',
      ) || null;
    if (project?.value) {
      parts.push(`projet ${project.value}`);
    }

    const missions = Array.isArray(snapshot?.missions) ? snapshot.missions : [];
    if (missions.length > 0) {
      parts.push(
        missions.length === 1
          ? '1 mission active'
          : `${missions.length} missions actives`,
      );
    }

    return parts.join(', ');
  }

  function renderSnapshot(snapshot) {
    state.lastSnapshot = snapshot;

    els.heroSession.textContent = snapshot.sessionId || state.sessionId;
    els.composerSession.textContent = snapshot.sessionId || state.sessionId;
    els.heroTimezone.textContent = snapshot.timezone || 'Europe/Paris';
    els.heroAttention.textContent = describeAttention(snapshot);
    els.heroLlm.textContent = snapshot.providers?.llm || '-';
    els.heroWeb.textContent = snapshot.providers?.web || '-';

    const integrations = snapshot.integrations || {};
    els.configSummary.textContent = snapshot.simulation
      ? 'Mode simulation actif. Les intégrations restent observables sans exécuter d’action réelle.'
      : integrations.googleConnected
        ? 'Mode exécution actif. Google est connecté pour cette session.'
        : 'Mode exécution actif. Google n’est pas encore connecté pour cette session.';

    const metrics = snapshot.metrics || {};
    els.metricTodos.textContent = metrics.openTodos ?? '-';
    els.metricTodosSub.textContent =
      (metrics.openTodos || 0) > 0
        ? 'Des tâches restent à clôturer'
        : 'Aucun todo ouvert';

    els.metricEmails.textContent =
      metrics.unreadEmails === null || metrics.unreadEmails === undefined
        ? '-'
        : metrics.unreadEmails;
    els.metricEmailsSub.textContent =
      metrics.unreadEmails === null
        ? 'Gmail indisponible'
        : metrics.unreadEmails > 0
          ? 'Des messages demandent ton attention'
          : 'Boîte de réception calme';

    els.metricEvents.textContent =
      metrics.eventsToday === null || metrics.eventsToday === undefined
        ? '-'
        : metrics.eventsToday;
    els.metricEventsSub.textContent =
      metrics.eventsToday === null
        ? 'Agenda indisponible'
        : metrics.eventsToday > 0
          ? "Des rendez-vous sont prévus aujourd'hui"
          : 'Aucun rendez-vous détecté';

    els.metricNotes.textContent = metrics.notesTotal ?? '-';
    els.metricNotesSub.textContent =
      (metrics.notesTotal || 0) > 0
        ? 'Base de notes active'
        : 'Aucune note enregistrée';

    if (snapshot.focus?.nextEvent) {
      const event = snapshot.focus.nextEvent;
      els.nextEvent.textContent = `${event.title} · ${formatDateTime(
        event.when,
      )} (${relativeDate(event.when)})`;
    } else {
      els.nextEvent.textContent = 'Aucun prochain rendez-vous visible.';
    }

    if (snapshot.focus?.topUnreadEmail) {
      const mail = snapshot.focus.topUnreadEmail;
      els.topEmail.textContent = `${mail.subject} · ${mail.from} · ${relativeDate(
        mail.date,
      )}`;
    } else {
      els.topEmail.textContent = 'Aucun email prioritaire remonté.';
    }

    if (snapshot.focus?.activeMission) {
      const mission = snapshot.focus.activeMission;
      els.activeMission.textContent = mission.nextStep
        ? `${mission.objective} · prochaine étape: ${mission.nextStep}`
        : `${mission.objective} · ${mission.summary || 'Mission active détectée.'}`;
    } else {
      els.activeMission.textContent = 'Aucune mission active visible.';
    }

    els.integrationBadges.innerHTML = '';
    els.integrationBadges.appendChild(
      renderBadge(
        integrations.googleConnected ? 'Google connecté' : 'Google absent',
        integrations.googleConnected ? 'ok' : 'warn',
      ),
    );
    els.integrationBadges.appendChild(
      renderBadge(
        integrations.calendarConnected ? 'Calendar prêt' : 'Calendar off',
        integrations.calendarConnected ? 'ok' : 'warn',
      ),
    );
    els.integrationBadges.appendChild(
      renderBadge(
        integrations.gmailConnected ? 'Gmail prêt' : 'Gmail off',
        integrations.gmailConnected ? 'ok' : 'warn',
      ),
    );
    els.integrationBadges.appendChild(
      renderBadge(
        snapshot.simulation ? 'Simulation' : 'Exécution réelle',
        snapshot.simulation ? 'warn' : 'ok',
      ),
    );

    if (integrations.lastGoogleSyncAt) {
      els.integrationBadges.appendChild(
        renderBadge(
          `Sync Google ${relativeDate(integrations.lastGoogleSyncAt)}`,
          'neutral',
        ),
      );
    }

    els.profileSummary.textContent = describeProfile(
      snapshot.profile || {},
      snapshot,
    );

    renderQuickActions(snapshot.quickActions || []);
    renderProactiveSuggestions(snapshot.proactiveSuggestions || []);
    renderPending(snapshot.pendingAction || null);
    renderMemory(snapshot.memoryTurns || []);
    renderWorkflowMemory(
      snapshot.workflowMemory || [],
      snapshot.workflowSuggestions || [],
    );
    renderAudit(snapshot.actionAudit || []);
    renderTimeline(snapshot.recentActivity || []);
    renderGoals(snapshot.goals || []);
    renderConflicts(snapshot.conflicts || []);
    renderSchedule(snapshot.schedulingSuggestions || []);
    renderResources(snapshot.resourceCapacities || []);
  }

  async function refreshDeck(options = {}) {
    const { hydrate = false, silent = false, force = false } = options;
    if (state.refreshing) return;
    if (state.busy && !force && !hydrate) return;

    state.refreshing = true;

    try {
      if (!silent) setStatus('Synchronisation du deck…', 'warn');

      const snapshot = await fetchJson(
        normalizeUrl(
          `/jarvis/status?sessionId=${encodeURIComponent(state.sessionId)}`,
        ),
      );

      renderSnapshot(snapshot);
      state.lastSyncAt = new Date();
      updateSyncIndicators();

      if (hydrate || !state.hydratedOnce) {
        hydrateMessages(snapshot.recentActivity || []);
        state.hydratedOnce = true;
      }

      if (!silent && !state.busy) {
        setStatus('Deck synchronisé.', 'ok');
      }
    } catch (error) {
      setStatus(`État indisponible: ${safeErrorMessage(error)}`, 'err');
    } finally {
      state.refreshing = false;
      renderEngineState();
    }
  }

  async function applyAssistantResponse(data, options = {}) {
    const { clearPrompt = false } = options;

    addMessage('jarvis', data.text || '(réponse vide)');
    renderChoices(
      data.choices?.length
        ? data.choices
        : extractSuggestedCommands(data.text || ''),
    );
    renderPending(data.pending_action || null);
    renderMeta(data.meta || {});

    if (clearPrompt) {
      els.prompt.value = '';
    }

    await refreshDeck({ hydrate: false, silent: true, force: true });
  }

  async function runAssistantRequest({
    path,
    payload,
    busyLabel,
    successLabel,
    errorPrefix,
    userText,
    clearPrompt = false,
  }) {
    if (state.busy) return null;

    if (userText) {
      addMessage('user', userText, { announce: false });
    }

    setBusy(true, busyLabel);
    setStatus(busyLabel, 'warn');

    try {
      const data = await fetchJson(normalizeUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      await applyAssistantResponse(data, { clearPrompt });
      setStatus(successLabel, 'ok');
      return data;
    } catch (error) {
      const message = safeErrorMessage(error);
      addMessage('system', `${errorPrefix}: ${message}`, { announce: false });
      renderChoices([]);
      setStatus(`${errorPrefix}: ${message}`, 'err');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendChat(text) {
    const clean = (text || '').trim();
    if (!clean) return;

    await runAssistantRequest({
      path: '/jarvis/chat',
      payload: {
        text: clean,
        sessionId: state.sessionId,
      },
      busyLabel: 'Jarvis traite la demande…',
      successLabel: 'Réponse reçue.',
      errorPrefix: 'Erreur',
      userText: clean,
      clearPrompt: true,
    });
  }

  async function confirmViaEndpoint(actionId) {
    if (!actionId) return;

    await runAssistantRequest({
      path: '/jarvis/confirm',
      payload: {
        actionId,
        sessionId: state.sessionId,
      },
      busyLabel: 'Confirmation en cours…',
      successLabel: 'Action confirmée.',
      errorPrefix: 'Erreur confirmation',
    });
  }

  function stopRecognition() {
    if (!state.recognition) return;

    try {
      state.recognition.stop();
    } catch {}

    state.recording = false;
    updateMicButton();
  }

  function destroyRecognition() {
    if (!state.recognition) return;

    stopRecognition();
    state.recognition.onstart = null;
    state.recognition.onend = null;
    state.recognition.onerror = null;
    state.recognition.onresult = null;
    state.recognition = null;
  }

  function updateMicButton() {
    const unsupported = !SpeechRecognition;
    els.micToggle.disabled = unsupported || (state.busy && !state.recording);
    els.micToggle.textContent = unsupported
      ? 'Micro indisponible'
      : state.recording
        ? 'Stop micro'
        : 'Micro';
    els.micToggle.className = unsupported
      ? 'button-ghost'
      : state.recording
        ? 'button-warn'
        : 'button-ghost';
    els.micToggle.setAttribute('aria-pressed', String(state.recording));
  }

  function initRecognition() {
    destroyRecognition();

    if (!SpeechRecognition) {
      updateMicButton();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = state.voiceLang;
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      state.recording = true;
      updateMicButton();
      setStatus('Écoute active…', 'warn');
    };

    recognition.onend = () => {
      state.recording = false;
      updateMicButton();
    };

    recognition.onerror = (event) => {
      setStatus(`Voix indisponible: ${event.error}`, 'err');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index++
      ) {
        const chunk = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) {
          finalTranscript += chunk;
        } else {
          interimTranscript += chunk;
        }
      }

      const merged = (finalTranscript || interimTranscript).trim();
      if (!merged) return;

      els.prompt.value = merged;
      if (finalTranscript) {
        setStatus('Transcription reçue.', 'ok');
        if (state.autoSendVoice) {
          void sendChat(finalTranscript.trim());
        }
      }
    };

    state.recognition = recognition;
    updateMicButton();
  }

  function handleSaveSession() {
    state.apiBase = els.apiBase.value.trim() || window.location.origin;
    state.sessionId = els.sessionId.value.trim() || 'default';
    state.voiceLang = els.voiceLang.value.trim() || 'fr-FR';
    state.speakEnabled = els.speakEnabled.checked;
    state.autoSendVoice = els.autoSendVoice.checked;
    state.hydratedOnce = false;

    persistPreferences();
    syncPreferenceControls();
    syncSessionInUrl();
    initRecognition();

    setStatus('Configuration sauvegardée.', 'ok');
    void refreshDeck({ hydrate: true, silent: true, force: true });
  }

  function handleClearScreen() {
    clearMessages();
    addMessage(
      'system',
      'Écran local effacé. L’historique serveur reste disponible via "Recharger l’historique".',
      { announce: false },
    );
  }

  function bindEvents() {
    els.send.onclick = () => {
      void sendChat(els.prompt.value);
    };

    els.prompt.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void sendChat(els.prompt.value);
      }
    });

    els.refreshDeck.onclick = () => {
      void refreshDeck({ hydrate: false });
    };

    els.hydrateHistory.onclick = () => {
      void refreshDeck({ hydrate: true });
    };

    els.clearLocalChat.onclick = handleClearScreen;
    els.saveSession.onclick = handleSaveSession;

    els.openGoogleAuth.onclick = () => {
      window.open(
        normalizeUrl(
          `/auth/google?sessionId=${encodeURIComponent(state.sessionId)}`,
        ),
        '_blank',
        'noopener',
      );
    };

    els.speakEnabled.onchange = () => {
      state.speakEnabled = els.speakEnabled.checked;
      persistPreferences();
    };

    els.autoSendVoice.onchange = () => {
      state.autoSendVoice = els.autoSendVoice.checked;
      persistPreferences();
    };

    els.voiceLang.onchange = () => {
      state.voiceLang = els.voiceLang.value.trim() || 'fr-FR';
      persistPreferences();
      initRecognition();
    };

    els.speakNow.onclick = () => speak(state.lastJarvisText, { force: true });

    els.micToggle.onclick = () => {
      if (!state.recognition) return;
      if (state.recording) {
        stopRecognition();
        return;
      }

      state.recognition.lang = state.voiceLang || 'fr-FR';
      state.recognition.start();
    };

    for (const head of document.querySelectorAll('.card-head.collapsible')) {
      head.addEventListener('click', (e) => {
        if (e.target.closest('.collapse-btn') || e.target.tagName === 'BUTTON') {
          const card = document.getElementById(head.dataset.target);
          if (card) card.classList.toggle('collapsed');
        } else {
          const card = document.getElementById(head.dataset.target);
          if (card) card.classList.toggle('collapsed');
        }
      });
    }

    for (const button of document.querySelectorAll('[data-quick]')) {
      button.addEventListener('click', () => {
        void sendChat(button.getAttribute('data-quick') || '');
      });
    }

    for (const button of document.querySelectorAll('[data-prefill]')) {
      button.addEventListener('click', () =>
        prefillPrompt(button.getAttribute('data-prefill') || ''),
      );
    }

    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        els.prompt.focus();
      }

      if (event.key === 'Escape' && state.recording) {
        stopRecognition();
      }
    });
  }

  function bootstrapUi() {
    syncPreferenceControls();
    renderChoices([]);
    renderQuickActions([]);
    renderPending(null);
    renderMemory([]);
    renderTimeline([]);
    renderMeta('-');
    clearMessages();
    addMessage(
      'system',
      'Pont de commandement prêt. Essaie "Donne-moi mes priorités du jour" ou active le micro.',
      { announce: false },
    );
    updateSyncIndicators();
    updateMicButton();
    setStatus('Console prête.', 'ok');
  }

  function init() {
    bindEvents();
    bootstrapUi();
    initRecognition();
    updateClock();
    window.setInterval(updateClock, CLOCK_REFRESH_INTERVAL_MS);
    void refreshDeck({ hydrate: true, silent: true, force: true });
    window.setInterval(() => {
      void refreshDeck({ hydrate: false, silent: true });
    }, STATUS_REFRESH_INTERVAL_MS);
  }

  init();
})();
