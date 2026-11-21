const byId = (id) => document.getElementById(id);
const composer = byId('composer');
const messageInput = byId('message');
const senderInput = byId('sender');
const sendButton = byId('send');
const resetButton = byId('new-chat');
const experimentMenu = byId('experiment-menu');
let sessionId;
let messages = [];
let events = [];
let responses = {};
let busy = false;
let needsReset = false;

document.addEventListener('click', (event) => {
  if (!experimentMenu.contains(event.target)) experimentMenu.open = false;
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !experimentMenu.open) return;
  experimentMenu.open = false;
  experimentMenu.querySelector('summary').focus();
});

async function loadRealExamples() {
  try {
    const response = await fetch('/real-examples.json');
    if (!response.ok) throw new Error('Examples unavailable');
    const examples = await response.json();
    if (
      !Array.isArray(examples) ||
      examples.length !== 2 ||
      !examples.every(
        (example) =>
          typeof example.title === 'string' &&
          typeof example.message === 'string' &&
          typeof example.source?.evaluation_id === 'number',
      )
    ) {
      throw new Error('Invalid examples');
    }
    const buttons = examples.map((example) => {
      const button = element('button', '', 'real-example');
      button.type = 'button';
      button.append(
        element('strong', example.title),
        element(
          'small',
          `Case ${example.source.evaluation_id}${example.adaptation ? ' · Adapted for simulation' : ''}`,
        ),
      );
      button.addEventListener('click', () => {
        if (busy || needsReset || messages.length >= 20) return;
        senderInput.value = 'recruiter';
        messageInput.value = example.message;
        experimentMenu.open = false;
        byId('status').textContent =
          `Loaded case ${example.source.evaluation_id}. Review or edit it, then choose Send message. No analysis has run.`;
        messageInput.focus();
      });
      return button;
    });
    byId('real-examples').replaceChildren(...buttons);
    byId('example-note').textContent =
      'Labels come from your LinkedIn collection. The suspected scam example uses a repository URL added for the simulation. Start a new conversation to compare cases.';
  } catch {
    byId('example-note').textContent =
      'Examples could not be loaded. Refresh the page, or type your own recruiter message.';
  }
}

loadRealExamples();

const starters = {
  intro:
    "Hi Aamir, we're hiring a full-stack developer. Would you be open to a quick conversation about the role?",
  repo: 'Please run npm install and npm run dev in https://github.com/AamirAlam/portfolio-app and share your feedback for our interview.',
  wallet:
    'Before the interview, connect your funded wallet and approve token spending at https://assessment.invalid/verify.',
};

document.querySelectorAll('[data-starter]').forEach((button) => {
  button.addEventListener('click', () => {
    messageInput.value = starters[button.dataset.starter];
    senderInput.value = 'recruiter';
    messageInput.focus();
  });
});

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function scrollThread() {
  byId('thread').scrollTop = byId('thread').scrollHeight;
}

function appendMessage(message) {
  byId('welcome').hidden = true;
  const row = element(
    'div',
    '',
    `message-row ${message.sender === 'candidate' ? 'candidate' : ''}`,
  );
  const bubble = element('article', '', 'chat-message');
  bubble.append(
    element('span', message.sender === 'candidate' ? 'Candidate' : 'Recruiter', 'message-author'),
    element('p', message.message),
  );
  row.append(bubble);
  byId('thread').append(row);
  byId('count').textContent = `${messages.length} of 20 messages`;
  scrollThread();
}

function beliefBar(label, scam) {
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  const row = element('div', '', 'belief-row');
  const track = element('div', '', 'belief-track');
  const fill = element('span', '', 'belief-fill');
  fill.style.width = percent(scam);
  track.setAttribute('aria-hidden', 'true');
  track.append(fill);
  row.append(
    element('strong', label),
    track,
    element('span', `Scam ${percent(scam)}`, 'belief-scam'),
    element('span', `Legitimate ${percent(1 - scam)}`, 'belief-legitimate'),
  );
  return row;
}

function showReasoning(step) {
  const reasoning = step.reasoning;
  if (!reasoning) return;
  byId('reasoning-panel').hidden = false;
  byId('reasoning-values').hidden = false;
  const status = reasoning.updateStatus;
  const unsupported = status === 'unsupported_evidence' || status === 'unmodelled_evidence';
  byId('reasoning-status').textContent = unsupported
    ? 'The model could not update from this evidence.'
    : reasoning.unmodelledEvidenceEventIds.length
      ? 'Some evidence falls outside this estimate.'
      : '';
  byId('belief-bars').replaceChildren(
    beliefBar('Before this step (prior)', reasoning.priorScam),
    beliefBar(
      reasoning.lastUpdatedAtEvent ? 'After this step (posterior)' : 'Current estimate',
      reasoning.distribution.scam,
    ),
  );
  const metrics = [
    ['Current entropy', reasoning.entropyBits],
    ['Observed information gain', reasoning.observedGainBits],
    ['Expected inspection gain', reasoning.expectedInspectionGainBits],
  ];
  byId('information-metrics').replaceChildren(
    ...metrics.flatMap(([label, value]) => [
      element('dt', label),
      element('dd', value === null ? '—' : `${value.toFixed(3)} bits`),
    ]),
  );
  const costs = Object.entries(reasoning.expectedCosts);
  const max = Math.max(...costs.map(([, cost]) => cost));
  byId('cost-bars').replaceChildren(
    ...costs.map(([action, cost]) => {
      const row = element('div', '', 'cost-row');
      const meter = element('meter');
      meter.max = max || 1;
      meter.value = cost;
      meter.setAttribute('aria-label', `${action} expected cost`);
      row.dataset.lowest = String(action === reasoning.costAction);
      row.append(element('span', action), meter, element('span', cost.toFixed(3)));
      return row;
    }),
  );
  const costChoice = byId('cost-choice');
  costChoice.hidden = reasoning.costAction === step.action;
  costChoice.textContent =
    `Lowest modelled cost: ${reasoning.costAction}. Live guidance: ${step.action}.`;
}

function showDecision(step) {
  if (step.candidate_recorded) {
    const note = element('article', '', 'agent-response');
    note.append(
      element('strong', 'Reply recorded'),
      element(
        'p',
        'Saved as context for the next recruiter message. No AI analysis or inspection was run; the previous assessment still applies.',
      ),
    );
    byId('thread').append(note);
    scrollThread();
    return;
  }
  if (!['SAFE', 'HOLD', 'FLAG'].includes(step.action) || typeof step.reason !== 'string') {
    throw new Error('Unexpected assessment. Start a new conversation.');
  }
  showReasoning(step);
  byId('agent-loading-label').textContent = step.inspection_triggered
    ? 'Inspecting repository source…'
    : 'Finishing assessment…';
  const labels = {
    SAFE: 'Continue chatting',
    HOLD: 'Verification needed',
    FLAG: 'Harmful request flagged',
  };
  const body = step.inspection_triggered
    ? 'Do not run the project yet. The agent is reading repository source without executing code. This may take a few minutes.'
    : step.reason;
  let response = responses[step.time];
  if (!response) {
    response = element('article', '', 'agent-response');
    responses = { ...responses, [step.time]: response };
    byId('thread').append(response);
  }
  response.className = `agent-response ${step.action}`;
  const heading = element('div', '', 'response-label');
  heading.append(element('strong', 'IntentChain'), element('small', labels[step.action]));
  response.replaceChildren(heading, element('p', body));
  const wallet = step.wallet_annotation;
  const execution = step.annotation;
  const quote =
    wallet && wallet.status !== 'absent_so_far'
      ? wallet.quote
      : execution && execution.status !== 'absent_so_far'
        ? execution.quote
        : null;
  byId('evidence-section').hidden = !quote;
  byId('evidence').textContent = quote || '';
  byId('status').textContent = step.inspection_triggered
    ? 'Reading repository source. Keep execution on hold…'
    : 'Assessment received.';
  scrollThread();
}

function setBusy(value) {
  busy = value;
  sendButton.disabled = value || needsReset || messages.length >= 20;
  resetButton.disabled = value;
  messageInput.disabled = value || needsReset || messages.length >= 20;
  senderInput.disabled = value;
  sendButton.textContent = value
    ? senderInput.value === 'candidate'
      ? 'Saving reply…'
      : 'Analysing…'
    : 'Send message ↗';
  composer.setAttribute('aria-busy', String(value));
  const analysing = value && senderInput.value === 'recruiter';
  composer.dataset.analysing = String(analysing);
  byId('agent-loading').hidden = !analysing;
  byId('agent-loading-label').textContent = analysing ? 'Reading the conversation…' : '';
}

messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!busy && !needsReset) composer.requestSubmit();
  }
});

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || busy || needsReset || messages.length >= 20) return;
  setBusy(true);
  if (senderInput.value === 'recruiter') {
    byId('reasoning-panel').hidden = false;
    byId('reasoning-status').textContent = byId('reasoning-values').hidden
      ? 'Waiting for the first assessment.'
      : 'Analysing the new message. Showing the last calculation.';
  }
  byId('status').textContent =
    senderInput.value === 'candidate'
      ? 'Saving the candidate reply as context…'
      : 'Reading the new message in context…';
  let accepted = false;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: { sender: senderInput.value, message: text },
      }),
    });
    if (!response.ok) {
      if (response.status === 410) needsReset = true;
      throw new Error((await response.json()).error);
    }
    // Once accepted, a broken stream needs a fresh chat; silently retrying could duplicate a request.
    accepted = true;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let complete = false;
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        const item = JSON.parse(line);
        events = [...events, item];
        if (item.type === 'started') {
          sessionId = item.session_id;
          messages = [...messages, item.message];
          appendMessage(item.message);
          messageInput.value = '';
        }
        if (item.type === 'decision') showDecision(item.step);
        if (item.type === 'error') throw new Error(item.message);
        if (item.type === 'complete') complete = true;
      }
      if (done) break;
    }
    if (!complete)
      throw new Error('Connection interrupted. Start a new conversation before continuing.');
    byId('status').textContent =
      messages.length >= 20
        ? 'Conversation limit reached. Start a new conversation to test more messages.'
        : 'Ready for the next message. Previous context is retained.';
  } catch (error) {
    if (!byId('reasoning-panel').hidden) {
      byId('reasoning-status').textContent = byId('reasoning-values').hidden
        ? 'No calculation is available for this message.'
        : 'Analysis stopped. Showing the last available calculation.';
    }
    if (accepted) needsReset = true;
    byId('status').textContent =
      `${error.message || 'Unable to analyse this message.'}${needsReset ? ' Choose New conversation to continue.' : ''}`;
  } finally {
    setBusy(false);
    byId('download').disabled = events.length === 0;
    if (!needsReset) messageInput.focus();
  }
});

resetButton.addEventListener('click', async () => {
  if (busy) return;
  if (sessionId) {
    try {
      const response = await fetch('/api/chat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!response.ok) {
        byId('status').textContent =
          'Could not reset the conversation. Wait for analysis to finish and try again.';
        return;
      }
    } catch {
      byId('status').textContent = 'Demo server unavailable. Restart it and refresh this page.';
      return;
    }
  }
  sessionId = undefined;
  messages = [];
  events = [];
  responses = {};
  needsReset = false;
  byId('reasoning-panel').hidden = true;
  byId('reasoning-values').hidden = true;
  byId('reasoning-status').textContent = 'Waiting for the first assessment.';
  byId('thread')
    .querySelectorAll('.message-row, .agent-response')
    .forEach((node) => node.remove());
  byId('welcome').hidden = false;
  byId('count').textContent = '0 of 20 messages';
  byId('evidence-section').hidden = true;
  byId('download').disabled = true;
  byId('status').textContent = 'New conversation. Previous context has been cleared.';
  messageInput.value = '';
  setBusy(false);
  messageInput.focus();
});

byId('download').addEventListener('click', () => {
  const report = {
    purpose: 'local_demo_chat',
    created_at: new Date().toISOString(),
    belief_update: 'none_no_real_likelihoods_configured',
    messages,
    events,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'intentchain-conversation.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
