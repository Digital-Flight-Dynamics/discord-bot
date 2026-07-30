import {
    APPEAL_BEHAVIORS,
    PIRACY_REASONS,
    actionStatus,
    appealAnswerEntries,
    appealEligibility,
    formatDuration,
    type AppealAnswers,
    type AppealStatus,
    type PublicAction,
} from '../server/domain';

type User = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
};

type Appeal = {
    id: string;
    actionId: string;
    status: AppealStatus;
    answers: AppealAnswers;
    submittedAt: string;
    reviewStartedAt: string | null;
    decidedAt: string | null;
    decisionNote: string | null;
};

const app = document.querySelector<HTMLElement>('#app')!;
const modalRoot = document.querySelector<HTMLElement>('#modal-root')!;
const toastRoot = document.querySelector<HTMLElement>('#toast-root')!;

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options?.body ? { 'content-type': 'application/json' } : {}),
            ...options?.headers,
        },
    });
    if (response.status === 401) {
        const returnTo = `${location.pathname}${location.search}`;
        location.href = `/logged-out?returnTo=${encodeURIComponent(returnTo)}`;
        throw new Error('Authentication required.');
    }
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
    return data;
}

function toast(message: string): void {
    toastRoot.innerHTML = `<div class="toast" role="alert">${escapeHtml(message)}</div>`;
    window.setTimeout(() => {
        toastRoot.innerHTML = '';
    }, 5_000);
}

function formatDate(value: string | null, includeTime = false): string {
    if (!value) return 'Not set';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        ...(includeTime ? { timeStyle: 'short' as const } : {}),
    }).format(new Date(value));
}

function relativeDate(value: string): string {
    const delta = new Date(value).getTime() - Date.now();
    const abs = Math.abs(delta);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const result =
        abs < 3_600_000
            ? formatter.format(Math.round(delta / 60_000), 'minute')
            : abs < 86_400_000
              ? formatter.format(Math.round(delta / 3_600_000), 'hour')
              : formatter.format(Math.round(delta / 86_400_000), 'day');
    return `${result.charAt(0).toLocaleUpperCase()}${result.slice(1)}`;
}

function expirationTooltip(value: string): string {
    const time = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC',
    })
        .format(new Date(value))
        .replace(/\s+(AM|PM)$/i, '$1')
        .toLocaleLowerCase();
    return `${relativeDate(value)} at ${time} (UTC)`;
}

function statusMarkup(action: PublicAction): string {
    const status = actionStatus(action);
    const labels = {
        active: 'Active',
        expired: 'Expired',
        'appeal submitted': 'Submitted Appeal',
        appealed: 'Appeal Accepted',
        revoked: 'Revoked',
    } satisfies Record<typeof status, string>;
    return `<span class="status status-${status.replaceAll(' ', '-')}">${labels[status]}</span>`;
}

function appealStatusMarkup(status: AppealStatus): string {
    const labels: Record<AppealStatus, string> = {
        submitted: 'Submitted',
        review: 'Under Review',
        approved: 'Approved',
        denied: 'Denied',
    };
    return `<span class="status appeal-status-${status}">${labels[status]}</span>`;
}

function kindMarkup(kind: PublicAction['kind']): string {
    if (kind === 'warning') {
        return `<span class="kind-badge kind-warning">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.7 20h18.6L12 3Z"></path><path d="M12 9v5M12 17.5v.1"></path></svg>
            <span>Warning</span>
        </span>`;
    }
    if (kind === 'timeout') {
        return `<span class="kind-badge kind-mute">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 4V5L9 9H5Z"></path><path d="m17 9 5 5M22 9l-5 5"></path></svg>
            <span>Mute</span>
        </span>`;
    }
    if (kind === 'kick') {
        return `<span class="kind-badge kind-kick">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h11v18H4zM9 12h.1"></path><path d="M14 12h8M19 9l3 3-3 3"></path></svg>
            <span>Kick</span>
        </span>`;
    }
    return `<span class="kind-badge kind-ban">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m5.7 5.7 12.6 12.6"></path></svg>
        <span>Ban</span>
    </span>`;
}

function logoutIcon(): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"></path></svg>`;
}

function userChip(user: User): string {
    return `
        <div class="user-chip">
            <img class="avatar" src="${escapeHtml(user.avatarUrl)}" alt="" />
            <span>
                <strong>${escapeHtml(user.displayName)}</strong>
                <small>@${escapeHtml(user.username)}</small>
            </span>
            <button class="icon-button" id="logout" type="button" aria-label="Log out">${logoutIcon()}</button>
        </div>
    `;
}

function attachLogout(): void {
    document.querySelector('#logout')?.addEventListener('click', async () => {
        await fetch('/auth/logout', { method: 'POST' });
        location.href = '/logged-out';
    });
}

async function loadUser(): Promise<User> {
    return fetchJson<User>('/api/me');
}

function renderLoggedOut(): void {
    const params = new URLSearchParams(location.search);
    const returnTo = params.get('returnTo') || '/my-history';
    const error = params.get('error');
    app.innerHTML = `
        <section class="logged-out page-enter">
            <div class="logged-out-card">
                <img class="app-logo" src="/assets/dfd-logo.png" alt="Digital Flight Dynamics" />
                <h1>Digital Flight Dynamics Community</h1>
                <p class="lede">Sign in to view your account history and appeal moderator actions on your account.</p>
                ${error ? `<p class="toast" role="alert">${escapeHtml(error)}</p>` : ''}
                <a class="button discord-button" href="/auth/discord/start?returnTo=${encodeURIComponent(returnTo)}">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.7 5.3A18 18 0 0 0 15.3 4l-.5 1.1a16.4 16.4 0 0 0-5.6 0L8.7 4a18 18 0 0 0-4.4 1.3C1.5 9.4.7 13.4 1.1 17.4a17.7 17.7 0 0 0 5.4 2.7l1.3-1.8-1.8-.9.4-.3c3.5 1.6 7.7 1.6 11.2 0l.4.3-1.8.9 1.3 1.8a17.7 17.7 0 0 0 5.4-2.7c.5-4.6-.8-8.6-3.2-12.1ZM8.7 15.2c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Zm6.6 0c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Z"></path></svg>
                    Sign in with your Discord Account
                </a>
            </div>
        </section>
    `;
}

function renderInformationPage(title: string): void {
    app.innerHTML = `
        <section class="information-page page-enter">
            <article class="information-card">
                <a class="back-link" href="/">← Back</a>
                <p class="eyebrow">Digital Flight Dynamics Community</p>
                <h1>${escapeHtml(title)}</h1>
                <p class="lede">To be filled</p>
            </article>
        </section>
    `;
}

async function renderHistory(): Promise<void> {
    const [user, actions] = await Promise.all([loadUser(), fetchJson<PublicAction[]>('/api/actions')]);
    app.innerHTML = `
        <div class="page-enter">
            <header class="topbar">
                <div>
                    <h1>Your history</h1>
                    <p class="lede">
                        Here you can see all current and past moderation actions that have been logged in your account.<br />
                        Click on the ID of an action to view more details.
                    </p>
                </div>
                ${userChip(user)}
            </header>
            <section class="panel actions-panel">
                <div class="panel-heading">
                    <h2>Actions</h2>
                    <p>${actions.length} record${actions.length === 1 ? '' : 's'}</p>
                </div>
                <table class="actions-table">
                    <colgroup>
                        <col class="action-id-column" />
                        <col class="kind-column" />
                        <col class="status-column" />
                        <col class="reason-column" />
                        <col class="action-date-column" />
                        <col class="expiration-date-column" />
                    </colgroup>
                    <thead>
                        <tr>
                            <th>Action ID</th>
                            <th>Kind</th>
                            <th>Status</th>
                            <th>Reason</th>
                            <th class="date-column">Date</th>
                            <th class="date-column expiration-column">Expiration</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                            actions.length
                                ? actions
                                      .map(
                                          (action) => `
                            <tr>
                                <td><a class="action-link" href="/action/${encodeURIComponent(action.actionId)}">${escapeHtml(action.actionId)}</a></td>
                                <td>${kindMarkup(action.kind)}</td>
                                <td>${statusMarkup(action)}</td>
                                <td><span class="reason-preview" title="${escapeHtml(action.reason)}">${escapeHtml(action.reason)}</span></td>
                                <td class="date-column">${formatDate(action.createdAt)}</td>
                                <td class="date-column expiration-column">
                                    ${
                                        action.expiresAt
                                            ? `<time class="date-tooltip" datetime="${escapeHtml(action.expiresAt)}" title="${escapeHtml(expirationTooltip(action.expiresAt))}">${formatDate(action.expiresAt)}</time>`
                                            : `<span class="no-expiration">${action.kind === 'ban' ? 'No expiration' : 'Never'}</span>`
                                    }
                                </td>
                            </tr>`,
                                      )
                                      .join('')
                                : `<tr><td class="empty-table" colspan="6"><strong>No moderation actions found.</strong><br />There is nothing for you to review right now.</td></tr>`
                        }
                    </tbody>
                </table>
            </section>
        </div>
    `;
    attachLogout();
}

function actionMetadata(action: PublicAction): string {
    const duration = action.kind === 'timeout' ? formatDuration(action.durationMs) : null;
    return `
        <dl class="action-facts">
            <div><dt>Kind</dt><dd>${kindMarkup(action.kind)}</dd></div>
            <div><dt>Status</dt><dd>${statusMarkup(action)}</dd></div>
            <div><dt>Issued at</dt><dd>${formatDate(action.createdAt, true)}</dd></div>
            <div><dt>Expires at</dt><dd>${action.expiresAt ? `${formatDate(action.expiresAt, true)} · ${relativeDate(action.expiresAt)}` : 'Never'}</dd></div>
            ${duration ? `<div><dt>Duration</dt><dd>${escapeHtml(duration)}</dd></div>` : ''}
        </dl>
        <div class="action-reason">
            <p class="eyebrow">Reason</p>
            <p>${escapeHtml(action.reason)}</p>
        </div>
    `;
}

function revokedCard(action: PublicAction): string {
    return `
        <section class="outcome-card">
            <p class="eyebrow">Action revoked</p>
            <h2>This action is no longer in effect.</h2>
            ${
                action.resolutionPublicNote
                    ? `<div class="moderation-note"><strong>Moderation Team Note:</strong><br>${escapeHtml(action.resolutionPublicNote)}</div>`
                    : ''
            }
            ${
                action.kind === 'kick' || action.kind === 'ban'
                    ? `<button class="button secondary full" id="rejoin" type="button" data-countdown="false">Re-join our community</button>`
                    : ''
            }
        </section>
    `;
}

async function renderAction(actionId: string): Promise<void> {
    const [user, action] = await Promise.all([
        loadUser(),
        fetchJson<PublicAction>(`/api/actions/${encodeURIComponent(actionId)}`),
    ]);
    const status = actionStatus(action);
    const appeals = action.appeals ?? (action.appealId && action.appealStatus && action.appealSubmittedAt
        ? [{
              id: action.appealId,
              status: action.appealStatus,
              submittedAt: action.appealSubmittedAt,
              reviewStartedAt: null,
              decidedAt: action.appealDecidedAt,
          }]
        : []);
    const eligibility = appealEligibility(action);
    const appealsTable = appeals.length
        ? `<h2>Appeals</h2>
           <div class="appeals-table-wrap">
               <table class="appeals-table">
                   <thead>
                       <tr>
                           <th>Appeal Date</th>
                           <th>Status</th>
                           <th aria-label="View appeal"></th>
                       </tr>
                   </thead>
                   <tbody>
                       ${appeals.map((appeal) => `
                           <tr>
                               <td>${formatDate(appeal.submittedAt, true)}</td>
                               <td>${appealStatusMarkup(appeal.status)}</td>
                               <td class="appeal-view-cell">
                                   <a class="appeal-view-link" href="/action/${encodeURIComponent(action.actionId)}/appeal/${encodeURIComponent(appeal.id)}" aria-label="View appeal" title="View appeal">
                                       <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.75"></circle></svg>
                                   </a>
                               </td>
                           </tr>`).join('')}
                   </tbody>
               </table>
           </div>`
        : '';
    const appealControls = eligibility.allowed
        ? `<div class="appeal-submit-block">
               <h2>Submit an Appeal</h2>
               <p>If you believe this action was unjustified, or incorrect, you are welcome to submit an appeal. Appeals are reviewed by the moderation team.</p>
               <button class="button" id="start-appeal" type="button">Appeal</button>
           </div>`
        : status === 'revoked' || status === 'appealed'
          ? `<div class="appeal-submit-block"><p class="eyebrow">Case closed</p><h2>No appeal is needed.</h2><p>This action has already been resolved.</p></div>`
          : `<div class="appeal-submit-block"><p>${escapeHtml(eligibility.reason || 'Another appeal is not available yet.')}</p></div>`;
    app.innerHTML = `
        <div class="page-enter">
            <a class="back-link" href="/my-history">← Back to your history</a>
            <header class="topbar">
                <div>
                    <h1>Action <code class="action-id-code">${escapeHtml(action.actionId)}</code></h1>
                </div>
                ${userChip(user)}
            </header>
            ${status === 'revoked' ? revokedCard(action) : ''}
            <div class="action-stack">
                <article class="detail-card">
                    ${actionMetadata(action)}
                </article>
                <aside class="side-card" id="appeal-side">
                    ${appealsTable}
                    ${appealControls}
                </aside>
            </div>
        </div>
    `;
    attachLogout();
    document.querySelector('#start-appeal')?.addEventListener('click', () => void beginAppeal(action));
    attachRejoin(action);
}

type AppealWindow = {
    windowId: string;
    mathPrompt: string;
    termsAvailableAt: string;
};

async function beginAppeal(action: PublicAction): Promise<void> {
    const side = document.querySelector<HTMLElement>('#appeal-side')!;
    side.innerHTML = `<div class="loading-state compact-loading"><span class="spinner"></span><p>Preparing your appeal…</p></div>`;
    try {
        const windowData = await fetchJson<AppealWindow>(`/api/actions/${encodeURIComponent(action.actionId)}/appeal-window`, {
            method: 'POST',
        });
        renderTerms(action, windowData);
    } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not begin the appeal.');
        await renderAction(action.actionId);
    }
}

function renderTerms(action: PublicAction, windowData: AppealWindow): void {
    const side = document.querySelector<HTMLElement>('#appeal-side')!;
    side.className = 'form-card';
    side.innerHTML = `
        <h2>Appeal terms</h2>
        <div class="terms">
            <p><strong>Please read this before continuing.</strong></p>
            <p>Use your own words and provide a complete, honest account. Submitting misleading information, abuse, threats, copied text, or repeated appeals may result in your submission being closed without review.</p>
            <p>An appeal is not a guarantee that an action will be changed. The moderation team will consider the original action, relevant context, your account, and your plans going forward.</p>
            <p>Take your time and complete the form in as much detail as possible. If you need to attach images or videos as evidence, upload them to a private Discord server or an image-sharing service with an unlisted URL, then add the URLs and any relevant context to the “Evidence links” field at the end of the form. We recommend naming your files in numerical order so that you can reference them in your appeal if needed (for example, “See pic 2”).</p>
            <p>Please do not contact moderators about the status of your appeal. You can follow its review and decision from this page. Reviews may take up to 14 days.</p>
            <p>If you are banned from our community, the bot will attempt to notify you of an approved appeal by editing the original ban message, if you received one. Due to Discord limitations, we recommend checking the progress of your appeal here periodically. For other kinds of infractions, the bot will notify you when your case is updated.</p>
            <p>Depending on the infraction, you may not be able to submit another appeal, so treat this submission as your final opportunity.</p>
        </div>
        <label class="check-row">
            <input id="accept-terms" type="checkbox" />
            <span>I have read these terms and confirm that my appeal is truthful and written by me.</span>
        </label>
        <div class="button-row">
            <button class="button" id="terms-next" type="button" disabled>Continue</button>
        </div>
    `;

    const checkbox = document.querySelector<HTMLInputElement>('#accept-terms')!;
    const next = document.querySelector<HTMLButtonElement>('#terms-next')!;
    const update = () => {
        const seconds = Math.max(0, Math.ceil((new Date(windowData.termsAvailableAt).getTime() - Date.now()) / 1_000));
        next.textContent = seconds ? `Continue (${seconds}s)` : 'Continue';
        next.disabled = seconds > 0 || !checkbox.checked;
        return seconds;
    };
    const timer = window.setInterval(() => {
        if (update() === 0) window.clearInterval(timer);
    }, 250);
    update();
    checkbox.addEventListener('change', update);
    next.addEventListener('click', () => renderAppealForm(action, windowData));
}

type AppealDraft = AppealAnswers;
type FormOption = { value: string; label: string };

function stepHeading(step: number, title: string, description?: string): string {
    return `
        <p class="eyebrow">Appeal Form - Step ${step}</p>
        <h2>${escapeHtml(title)}</h2>
        ${description ? `<p class="lede form-help">${escapeHtml(description)}</p>` : ''}
    `;
}

function radioOptions(name: string, options: readonly FormOption[], draft: AppealDraft): string {
    return `<div class="choice-list">${options
        .map(
            ({ value, label }) => `
                <label class="choice-card">
                    <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${draft[name] === value ? 'checked' : ''} required />
                    <span>${escapeHtml(label)}</span>
                </label>`,
        )
        .join('')}</div>`;
}

function textareaField(id: string, label: string, draft: AppealDraft, options: { min?: number; optional?: boolean } = {}): string {
    const minimum = options.min ?? 20;
    return `
        <div class="field">
            <label for="${id}">${escapeHtml(label)}${options.optional ? ' <span class="optional">(optional)</span>' : ''}</label>
            <textarea id="${id}" name="${id}" minlength="${minimum}" maxlength="2000" ${options.optional ? '' : 'required'}>${escapeHtml(draft[id] || '')}</textarea>
            <div class="field-meta"><span>${options.optional ? 'Optional' : `Minimum ${minimum} characters`}</span><span>Maximum 2,000 characters</span></div>
        </div>`;
}

function shortTextField(id: string, label: string, draft: AppealDraft): string {
    return `
        <div class="field">
            <label for="${id}">${escapeHtml(label)}</label>
            <input id="${id}" name="${id}" value="${escapeHtml(draft[id] || '')}" minlength="5" maxlength="250" required />
            <div class="field-meta"><span>Minimum 5 characters</span><span>Maximum 250 characters</span></div>
        </div>`;
}

function collectForm(form: HTMLFormElement, draft: AppealDraft): void {
    for (const [key, value] of new FormData(form)) draft[key] = String(value).trim();
}

function renderCannotContinue(action: PublicAction, title: string, message: string, back: () => void, tips = ''): void {
    const side = document.querySelector<HTMLElement>('#appeal-side')!;
    side.innerHTML = `
        <div class="blocked-appeal">
            <p class="eyebrow">Cannot continue</p>
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(message)}</p>
            ${tips}
            <div class="button-row">
                <button class="button secondary" id="blocked-back" type="button">Go back</button>
                <a class="button" href="/action/${encodeURIComponent(action.actionId)}">Return to action</a>
            </div>
        </div>`;
    document.querySelector('#blocked-back')?.addEventListener('click', back);
}

function renderAppealForm(action: PublicAction, windowData: AppealWindow): void {
    renderAgeStep(action, windowData, {});
}

function renderAgeStep(action: PublicAction, windowData: AppealWindow, draft: AppealDraft): void {
    const side = document.querySelector<HTMLElement>('#appeal-side')!;
    side.innerHTML = `
        ${stepHeading(1, 'Age confirmation')}
        <p class="form-copy">Discord’s Terms of Service require users to meet the minimum age for digital consent in their country. This is normally 13, but some countries require users to be older. Because we must protect your personal information, we cannot accept age-verification documents through this appeal form.</p>
        <form id="age-step">
            ${radioOptions('ageConfirmation', [
                { value: 'underAge', label: 'I am below the minimum age required by Discord for my country' },
                { value: 'ofAge', label: 'I meet the minimum age required by Discord for my country' },
            ], draft)}
            <div class="button-row">
                <button class="button secondary" id="age-back" type="button">Back</button>
                <button class="button" type="submit">Continue</button>
            </div>
        </form>`;
    document.querySelector('#age-back')?.addEventListener('click', () => renderTerms(action, windowData));
    document.querySelector<HTMLFormElement>('#age-step')?.addEventListener('submit', (event) => {
        event.preventDefault();
        collectForm(event.currentTarget as HTMLFormElement, draft);
        if (draft.ageConfirmation === 'underAge') {
            renderCannotContinue(
                action,
                'We cannot review this appeal',
                'If you are below the minimum age required by Discord in your country, we cannot continue this submission or collect identity documents from you.',
                () => renderAgeStep(action, windowData, draft),
            );
            return;
        }
        renderBehaviorStep(action, windowData, draft);
    });
}

function renderBehaviorStep(action: PublicAction, windowData: AppealWindow, draft: AppealDraft): void {
    const side = document.querySelector<HTMLElement>('#appeal-side')!;
    const behaviors = APPEAL_BEHAVIORS.filter((item) => !('banOnly' in item) || action.kind === 'ban');
    side.innerHTML = `
        ${stepHeading(2, 'What behavior led to this action?')}
        <form id="behavior-step">
            ${radioOptions('behavior', behaviors, draft)}
            <div class="button-row">
                <button class="button secondary" id="behavior-back" type="button">Back</button>
                <button class="button" type="submit">Continue</button>
            </div>
        </form>`;
    const form = document.querySelector<HTMLFormElement>('#behavior-step')!;
    document.querySelector('#behavior-back')?.addEventListener('click', () => renderAgeStep(action, windowData, draft));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        collectForm(form, draft);
        renderBehaviorDetailsStep(action, windowData, draft);
    });
}

function behaviorDetailFields(behavior: string, draft: AppealDraft): string {
    if (behavior === 'piracy') {
        return `
            <fieldset class="form-fieldset">
                <legend>Please choose the reason for this action</legend>
                ${radioOptions('piracyReason', PIRACY_REASONS, draft)}
            </fieldset>
            <div class="conditional-field" id="piracy-other-field" hidden>
                ${shortTextField('piracyReasonOther', 'Please describe the other piracy-related reason', draft)}
            </div>
        `;
    }
    if (behavior === 'spamming') return `${textareaField('spammingDefinition', 'What does “spamming” mean to you?', draft)}${textareaField('spammedContent', 'What did you spam specifically? Please be honest—we already know what was sent.', draft)}`;
    if (behavior === 'advertising') return `${textareaField('advertisedContent', 'What did you advertise or promote, and in which channel?', draft)}${textareaField('advertisingReason', 'Why did you choose to advertise or promote it?', draft)}${textareaField('promptedToAdvertise', 'Were you prompted or told to advertise or promote in our server? If yes, by whom?', draft)}`;
    if (behavior === 'random-dms') return `${textareaField('dmMotivation', 'What motivated you to DM random people on Discord?', draft)}${textareaField('dmContent', 'What content did you send?', draft)}`;
    if (behavior === 'hate-speech') return `${textareaField('hateSpeechDefinition', 'What does hate speech mean to you?', draft)}${textareaField('hateSpeechContent', 'What did you say specifically? Please be honest—we already know what was said.', draft)}${textareaField('hateSpeechJustification', 'What made you feel you had the right to behave in this way?', draft)}`;
    if (behavior === 'bad-behavior') return `${textareaField('badBehaviorDefinition', 'What does “general bad behavior” mean to you?', draft)}${textareaField('badBehaviorDetails', 'What did you do specifically? Please be honest—we already know what happened.', draft)}`;
    if (behavior === 'ignored-moderator') return `${textareaField('moderatorInvolvement', 'Why did the moderator become involved in the first place?', draft)}${textareaField('ignoredModeratorReason', 'Why did you choose to ignore the moderator and carry on?', draft)}`;
    if (behavior === 'compromised') return `
        <fieldset class="form-fieldset">
            <legend>Have you taken steps to secure your account?</legend>
            ${radioOptions('accountSecured', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], draft)}
        </fieldset>
        ${textareaField('compromisedActions', 'If you are aware, what actions were taken while your account was compromised? For example: mass spam, DM spam, malware sharing, or scamming.', draft, { optional: true })}`;
    if (behavior === 'other') return textareaField('behaviorOther', 'Describe the behavior that led to this action', draft);
    return '';
}

function renderBehaviorDetailsStep(action: PublicAction, windowData: AppealWindow, draft: AppealDraft): void {
    const side = document.querySelector<HTMLElement>('#appeal-side')!;
    side.innerHTML = `
        ${stepHeading(3, 'Tell us what happened', 'Answer honestly and provide as much relevant detail as possible.')}
        <form id="details-step">
            ${behaviorDetailFields(draft.behavior || '', draft)}
            <div class="button-row">
                <button class="button secondary" id="details-back" type="button">Back</button>
                <button class="button" type="submit">Continue</button>
            </div>
        </form>`;
    const form = document.querySelector<HTMLFormElement>('#details-step')!;
    if (draft.behavior === 'piracy') {
        const piracyOther = document.querySelector<HTMLElement>('#piracy-other-field')!;
        const updatePiracy = () => {
            const reason = (form.elements.namedItem('piracyReason') as RadioNodeList | null)?.value;
            piracyOther.hidden = reason !== 'other';
            document.querySelector<HTMLInputElement>('#piracyReasonOther')!.required = reason === 'other';
        };
        form.addEventListener('change', updatePiracy);
        updatePiracy();
    }
    document.querySelector('#details-back')?.addEventListener('click', () => renderBehaviorStep(action, windowData, draft));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        collectForm(form, draft);
        if (draft.behavior === 'piracy') {
            if (draft.piracyReason === 'pirated-msfs') renderSimulatorPiracyStep(action, windowData, draft);
            else renderPiracyExplanationStep(action, windowData, draft);
            return;
        }
        if (draft.behavior === 'compromised' && draft.accountSecured === 'no') {
            renderCannotContinue(
                action,
                'Secure your account first',
                'We cannot review an account-compromise appeal until you have secured your Discord account.',
                () => renderBehaviorDetailsStep(action, windowData, draft),
                '<div class="form-notice"><strong>Before returning:</strong> change your Discord password, enable multi-factor authentication, review Authorized Apps, remove unknown Connections, and scan your device for malware.</div>',
            );
            return;
        }
        renderModeratorContextStep(action, windowData, draft);
    });
}

function renderSimulatorPiracyStep(action: PublicAction, windowData: AppealWindow, draft: AppealDraft): void {
    const side = document.querySelector<HTMLElement>('#appeal-side')!;
    side.innerHTML = `
        ${stepHeading(4, 'Simulator Piracy')}
        <form id="simulator-piracy-step">
            ${shortTextField('piratedSimVersion', 'What was the simulator version of your pirated copy?', draft)}
            <fieldset class="form-fieldset">
                <legend>Have you bought a valid copy of Microsoft Flight Simulator since?</legend>
                ${radioOptions('purchasedValidCopy', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], draft)}
            </fieldset>
            <div class="form-notice" id="ownership-proof" hidden><strong>Proof of ownership is required.</strong> Take a screenshot of your Steam or Xbox library with Microsoft Flight Simulator selected. If the account name does not match your Discord username, link the account through Discord Connections and make the connection public. Add the screenshot URL on the final step.</div>
            <div class="button-row">
                <button class="button secondary" id="simulator-piracy-back" type="button">Back</button>
                <button class="button" type="submit">Continue</button>
            </div>
        </form>`;
    const form = document.querySelector<HTMLFormElement>('#simulator-piracy-step')!;
    const proof = document.querySelector<HTMLElement>('#ownership-proof')!;
    const updateProof = () => {
        proof.hidden = (form.elements.namedItem('purchasedValidCopy') as RadioNodeList | null)?.value !== 'yes';
    };
    form.addEventListener('change', updateProof);
    updateProof();
    document.querySelector('#simulator-piracy-back')?.addEventListener('click', () => renderBehaviorDetailsStep(action, windowData, draft));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        collectForm(form, draft);
        if (draft.purchasedValidCopy === 'no') {
            renderCannotContinue(action, 'A valid game copy is required', 'We will not review this appeal until you have purchased a valid copy of Microsoft Flight Simulator.', () => renderSimulatorPiracyStep(action, windowData, draft));
            return;
        }
        renderPiracyExplanationStep(action, windowData, draft);
    });
}

function renderPiracyExplanationStep(action: PublicAction, windowData: AppealWindow, draft: AppealDraft): void {
    const side = document.querySelector<HTMLElement>('#appeal-side')!;
    const step = draft.piracyReason === 'pirated-msfs' ? 5 : 4;
    side.innerHTML = `
        ${stepHeading(step, 'Piracy details', 'Answer honestly and provide as much relevant detail as possible.')}
        <form id="piracy-explanation-step">
            ${textareaField('piracyDetails', 'What did you pirate, discuss, or share?', draft)}
            ${textareaField('piracyMotivation', 'Why did you choose to do this?', draft)}
            <div class="button-row">
                <button class="button secondary" id="piracy-explanation-back" type="button">Back</button>
                <button class="button" type="submit">Continue</button>
            </div>
        </form>`;
    const form = document.querySelector<HTMLFormElement>('#piracy-explanation-step')!;
    document.querySelector('#piracy-explanation-back')?.addEventListener('click', () => {
        if (draft.piracyReason === 'pirated-msfs') renderSimulatorPiracyStep(action, windowData, draft);
        else renderBehaviorDetailsStep(action, windowData, draft);
    });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        collectForm(form, draft);
        renderModeratorContextStep(action, windowData, draft);
    });
}

function selectField(id: string, label: string, options: FormOption[], draft: AppealDraft): string {
    const selectedLabel = options.find((option) => option.value === draft[id])?.label || 'Select an answer';
    return `
        <div class="field">
            <label id="${id}-label">${escapeHtml(label)}</label>
            <div class="custom-select" data-custom-select>
                <input type="hidden" id="${id}" name="${id}" value="${escapeHtml(draft[id] || '')}" />
                <button class="custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${id}-label ${id}-value">
                    <span id="${id}-value">${escapeHtml(selectedLabel)}</span>
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"></path></svg>
                </button>
                <div class="custom-select-menu" role="listbox" aria-labelledby="${id}-label" hidden>
                    ${options.map(({ value, label: optionLabel }) => `
                        <button type="button" role="option" data-value="${escapeHtml(value)}" aria-selected="${draft[id] === value}">
                            <span>${escapeHtml(optionLabel)}</span>
                            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"></path></svg>
                        </button>`).join('')}
                </div>
            </div>
        </div>`;
}

function initializeCustomSelects(form: HTMLFormElement): void {
    const selects = Array.from(form.querySelectorAll<HTMLElement>('[data-custom-select]'));
    const close = (select: HTMLElement) => {
        select.querySelector<HTMLElement>('.custom-select-menu')!.hidden = true;
        select.querySelector<HTMLButtonElement>('.custom-select-trigger')!.ariaExpanded = 'false';
        select.classList.remove('open');
    };
    const open = (select: HTMLElement) => {
        selects.filter((other) => other !== select).forEach(close);
        select.querySelector<HTMLElement>('.custom-select-menu')!.hidden = false;
        select.querySelector<HTMLButtonElement>('.custom-select-trigger')!.ariaExpanded = 'true';
        select.classList.add('open');
    };

    for (const select of selects) {
        const input = select.querySelector<HTMLInputElement>('input[type="hidden"]')!;
        const trigger = select.querySelector<HTMLButtonElement>('.custom-select-trigger')!;
        const valueLabel = trigger.querySelector<HTMLElement>('span')!;
        const options = Array.from(select.querySelectorAll<HTMLButtonElement>('[role="option"]'));
        trigger.addEventListener('click', () => {
            if (select.classList.contains('open')) close(select);
            else open(select);
        });
        trigger.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            open(select);
            const selected = options.find((option) => option.ariaSelected === 'true');
            (selected || options[event.key === 'ArrowDown' ? 0 : options.length - 1])?.focus();
        });
        options.forEach((option, index) => {
            option.addEventListener('click', () => {
                input.value = option.dataset.value || '';
                valueLabel.textContent = option.querySelector('span')!.textContent;
                options.forEach((item) => (item.ariaSelected = String(item === option)));
                select.classList.remove('invalid');
                close(select);
                trigger.focus();
            });
            option.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    close(select);
                    trigger.focus();
                } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const direction = event.key === 'ArrowDown' ? 1 : -1;
                    options[(index + direction + options.length) % options.length]?.focus();
                }
            });
        });
        select.addEventListener('focusout', () => {
            window.setTimeout(() => {
                if (!select.contains(document.activeElement)) close(select);
            });
        });
    }
}

function validateCustomSelects(form: HTMLFormElement): boolean {
    const missing = Array.from(form.querySelectorAll<HTMLElement>('[data-custom-select]')).find(
        (select) => !select.querySelector<HTMLInputElement>('input[type="hidden"]')!.value,
    );
    if (!missing) return true;
    missing.classList.add('invalid');
    missing.querySelector<HTMLButtonElement>('.custom-select-trigger')!.focus();
    return false;
}

function moderatorStepNumber(draft: AppealDraft): number {
    if (draft.piracyReason === 'pirated-msfs') return 6;
    if (draft.behavior === 'piracy') return 5;
    return 4;
}

function renderModeratorContextStep(action: PublicAction, windowData: AppealWindow, draft: AppealDraft): void {
    const side = document.querySelector<HTMLElement>('#appeal-side')!;
    const step = moderatorStepNumber(draft);
    side.innerHTML = `
        ${stepHeading(step, 'Moderator context')}
        <form id="moderator-step">
            ${selectField('moderatorStopCount', 'How many times did a moderator ask you to stop?', [
                { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' },
                { value: 'more', label: 'More than 3' }, { value: 'notInformed', label: 'I was not informed' },
            ], draft)}
            ${selectField('moderatorReaction', 'How did you react when the moderator asked you to stop?', [
                { value: 'resolved', label: 'The situation was resolved' },
                { value: 'steppedAway', label: 'I took a step away from Discord for a while' },
                { value: 'continued', label: 'I carried on or retaliated' },
                { value: 'notAsked', label: 'I was not asked to stop' },
            ], draft)}
            ${selectField('reportedBefore', 'Have you ever been reported by a member of our server?', [
                { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' },
            ], draft)}
            ${textareaField('behaviorChange', 'How will your behavior change for the better, and how can we trust you with another chance?', draft, { min: 80 })}
            <div class="button-row">
                <button class="button secondary" id="moderator-back" type="button">Back</button>
                <button class="button" type="submit">Continue</button>
            </div>
        </form>`;
    const form = document.querySelector<HTMLFormElement>('#moderator-step')!;
    initializeCustomSelects(form);
    document.querySelector('#moderator-back')?.addEventListener('click', () => {
        if (draft.behavior === 'piracy') renderPiracyExplanationStep(action, windowData, draft);
        else renderBehaviorDetailsStep(action, windowData, draft);
    });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!validateCustomSelects(form)) return;
        collectForm(form, draft);
        renderFinalAppealStep(action, windowData, draft);
    });
}

function renderFinalAppealStep(action: PublicAction, windowData: AppealWindow, draft: AppealDraft): void {
    const side = document.querySelector<HTMLElement>('#appeal-side')!;
    const proofRequired = draft.behavior === 'piracy' && draft.piracyReason === 'pirated-msfs';
    const step = moderatorStepNumber(draft) + 1;
    side.innerHTML = `
        ${stepHeading(step, 'Final details')}
        <form id="final-details-step">
            ${textareaField('additionalNotes', 'Anything else you would like to add or mention?', draft, { optional: true })}
            ${textareaField('evidenceLinks', 'Evidence links', draft, { optional: !proofRequired, min: proofRequired ? 8 : 1 })}
            <div class="form-info">
                <p>Enter complete links, including HTTP or HTTPS, separated by new lines. You may add context or notes alongside each piece of evidence. We recommend uploading evidence to a private Discord channel or server, or to an image-sharing service. Make sure the links are unlisted to protect your privacy.</p>
                <p><strong>We will not review links from non-mainstream services or custom uploaders.</strong></p>
                <p>If you need to share multiple files, you may use Google Drive, OneDrive, iCloud Share, or MEGA. We only accept image files such as JPG, PNG, and RAW files.</p>
            </div>
            <div class="button-row">
                <button class="button secondary" id="final-back" type="button">Back</button>
                <button class="button" type="submit">Continue</button>
            </div>
        </form>`;
    const form = document.querySelector<HTMLFormElement>('#final-details-step')!;
    document.querySelector('#final-back')?.addEventListener('click', () => renderModeratorContextStep(action, windowData, draft));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        collectForm(form, draft);
        renderCaptchaStep(action, windowData, draft);
    });
}

function renderCaptchaStep(action: PublicAction, windowData: AppealWindow, draft: AppealDraft): void {
    const side = document.querySelector<HTMLElement>('#appeal-side')!;
    const step = moderatorStepNumber(draft) + 2;
    side.innerHTML = `
        ${stepHeading(step, 'One final thing')}
        <p class="form-copy">Before we submit your appeal, we need to confirm you are not a bot. Please complete this basic CAPTCHA:</p>
        <form id="captcha-step">
            <div class="field">
                <label for="math-answer">What is the answer to this equation?</label>
                <div class="captcha-box">
                    <span class="captcha-prompt">${escapeHtml(windowData.mathPrompt)} =</span>
                    <input id="math-answer" inputmode="numeric" autocomplete="off" required autofocus />
                </div>
            </div>
            <div class="button-row">
                <button class="button secondary" id="captcha-back" type="button">Back</button>
                <button class="button" type="submit">Submit</button>
            </div>
        </form>`;
    const form = document.querySelector<HTMLFormElement>('#captcha-step')!;
    document.querySelector('#captcha-back')?.addEventListener('click', () => renderFinalAppealStep(action, windowData, draft));
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const mathAnswer = document.querySelector<HTMLInputElement>('#math-answer')!.value;
        const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        submit.disabled = true;
        submit.textContent = 'Submitting…';
        try {
            await fetchJson<{ ready: true }>(`/api/actions/${encodeURIComponent(action.actionId)}/appeal-prepare`, {
                method: 'POST',
                body: JSON.stringify({ windowId: windowData.windowId, termsAccepted: true, mathAnswer, answers: draft }),
            });
            const appeal = await fetchJson<{ id: string; actionId: string }>(
                `/api/actions/${encodeURIComponent(action.actionId)}/appeals`,
                {
                    method: 'POST',
                    body: JSON.stringify({ windowId: windowData.windowId }),
                },
            );
            location.href = `/action/${encodeURIComponent(appeal.actionId)}/appeal/${encodeURIComponent(appeal.id)}`;
        } catch (error) {
            submit.disabled = false;
            submit.textContent = 'Submit';
            toast(error instanceof Error ? error.message : 'Could not submit your appeal.');
        }
    });
}

function progressSteps(status: AppealStatus): string {
    const decided = status === 'approved' || status === 'denied';
    const steps = [
        {
            label: 'Submitted',
            className: 'submitted active',
            tooltip: 'You have submitted your appeal to the system.',
        },
        {
            label: 'Review',
            className: 'review active',
            tooltip: 'The moderation team has received the appeal and will now review it. It may take up to 14 days for a decision.',
        },
        {
            label: 'Decision',
            className: decided ? `decision active ${status}` : 'decision',
            tooltip: 'The decision has been taken.',
        },
    ];
    return `
        <div class="progress-steps" aria-label="Appeal progress">
            ${steps
                .map(
                    ({ label, className, tooltip }) =>
                        `<div class="progress-step ${className}" tabindex="0" aria-label="${escapeHtml(`${label}: ${tooltip}`)}">
                            <span>${label}</span>
                            <span class="progress-tooltip" role="tooltip">${escapeHtml(tooltip)}</span>
                        </div>`,
                )
                .join('')}
        </div>
    `;
}

function appealOutcome(action: PublicAction, appeal: Appeal): string {
    if (appeal.status !== 'approved' && appeal.status !== 'denied') return '';
    const approved = appeal.status === 'approved';
    const mayRejoin = approved && (action.kind === 'kick' || action.kind === 'ban');
    const appealAgainDays = action.kind === 'timeout' ? 14 : action.kind === 'ban' ? 30 : 24;
    return `
        <section class="outcome-card ${approved ? '' : 'denied'}">
            <h2>A decision has been taken for your appeal</h2>
            <p>
                ${
                    approved
                        ? `The moderation team has accepted this appeal. This action will be lifted.${mayRejoin ? ' You may rejoin the server using this invite link:' : ''}`
                        : `Your appeal has unfortunately been denied. We apologize if this is not the result you expected. You may appeal again after ${appealAgainDays} days.`
                }
            </p>
            ${mayRejoin ? `<button class="button" id="rejoin" data-countdown="true" type="button">View link</button>` : ''}
            ${
                approved
                    ? `<p>This action and the appeal will remain on your account, even if they previously had an expiration. Future infractions may result in a harsher punishment.</p>`
                    : ''
            }
            ${appeal.decisionNote ? `<div class="moderation-note"><strong>Moderation Team Note:</strong><br>${escapeHtml(appeal.decisionNote)}</div>` : ''}
            <p class="decision-date"><strong>Date &amp; Time of decision:</strong> ${formatDate(appeal.decidedAt, true)}</p>
        </section>
    `;
}

async function renderAppeal(actionId: string, appealId: string): Promise<void> {
    const [user, result] = await Promise.all([
        loadUser(),
        fetchJson<{ action: PublicAction; appeal: Appeal }>(
            `/api/actions/${encodeURIComponent(actionId)}/appeals/${encodeURIComponent(appealId)}`,
        ),
    ]);
    const { action, appeal } = result;
    app.innerHTML = `
        <div class="page-enter">
            <a class="back-link" href="/action/${encodeURIComponent(action.actionId)}">← Back to action</a>
            <header class="topbar">
                <div>
                    <h1>Appeal progress</h1>
                    <p class="lede">Submitted ${formatDate(appeal.submittedAt, true)} for action <span class="action-id-inline">${escapeHtml(action.actionId)}</span>.</p>
                </div>
                ${userChip(user)}
            </header>
            ${progressSteps(appeal.status)}
            ${appealOutcome(action, appeal)}
            <section class="panel">
                <div class="panel-heading">
                    <h2>Your submitted answers</h2>
                </div>
                <div class="answers-list padded-answers">
                    ${appealAnswerEntries(appeal.answers).map(
                        ({ label, value }) => `
                        <article class="answer-card">
                            <h3>${escapeHtml(label)}</h3>
                            <p>${escapeHtml(value)}</p>
                        </article>`,
                    ).join('')}
                </div>
            </section>
        </div>
    `;
    attachLogout();
    attachRejoin(action);
}

function attachRejoin(action: PublicAction): void {
    const button = document.querySelector<HTMLButtonElement>('#rejoin');
    if (!button) return;
    button.addEventListener('click', () => {
        const needsCountdown = button.dataset.countdown === 'true';
        showRejoinModal(action, needsCountdown);
    });
}

function showRejoinModal(action: PublicAction, needsCountdown: boolean): void {
    modalRoot.innerHTML = `
        <div class="modal-backdrop" role="presentation">
            <section class="modal" role="dialog" aria-modal="true" aria-labelledby="rejoin-title">
                <p class="eyebrow">Community access</p>
                <h2 id="rejoin-title">A chance to rejoin.</h2>
                ${
                    needsCountdown
                        ? `<p>We have given you a chance to join our community again. Please do not make us regret it. We recommend that you re-read our rules before returning.</p>`
                        : `<p>This action has been revoked. You can request a fresh community invite below.</p>`
                }
                <div id="invite-result"></div>
                <div class="button-row">
                    <button class="button secondary" id="close-modal" type="button">Close</button>
                    <button class="button" id="show-invite" type="button" ${needsCountdown ? 'disabled' : ''}>
                        ${needsCountdown ? 'Continue in 10s' : 'Show invite link'}
                    </button>
                </div>
            </section>
        </div>
    `;
    document.querySelector('#close-modal')?.addEventListener('click', () => {
        modalRoot.innerHTML = '';
    });
    const showButton = document.querySelector<HTMLButtonElement>('#show-invite')!;
    if (needsCountdown) {
        let seconds = 10;
        const timer = window.setInterval(() => {
            seconds -= 1;
            showButton.textContent = seconds ? `Continue in ${seconds}s` : 'Show invite link';
            if (seconds === 0) {
                showButton.disabled = false;
                window.clearInterval(timer);
            }
        }, 1_000);
    }
    showButton.addEventListener('click', async () => {
        showButton.disabled = true;
        try {
            const result = await fetchJson<{ inviteUrl: string }>(`/api/actions/${encodeURIComponent(action.actionId)}/invite`);
            document.querySelector<HTMLElement>('#invite-result')!.innerHTML =
                `<a class="invite-link" href="${escapeHtml(result.inviteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.inviteUrl)}</a>`;
            showButton.hidden = true;
        } catch (error) {
            showButton.disabled = false;
            toast(error instanceof Error ? error.message : 'No invite is available.');
        }
    });
}

async function renderRoute(): Promise<void> {
    try {
        const informationPages: Record<string, string> = {
            '/privacy-policy': 'Privacy Policy',
            '/community-rules': 'Community Rules',
        };
        const informationPageTitle = informationPages[location.pathname];
        if (informationPageTitle) {
            renderInformationPage(informationPageTitle);
            return;
        }
        if (location.pathname === '/logged-out') {
            renderLoggedOut();
            return;
        }
        if (location.pathname === '/my-history' || location.pathname === '/') {
            await renderHistory();
            return;
        }
        const actionAppealMatch = location.pathname.match(/^\/action\/([^/]+)\/appeal\/([^/]+)\/?$/);
        if (actionAppealMatch?.[1] && actionAppealMatch[2]) {
            await renderAppeal(decodeURIComponent(actionAppealMatch[1]), decodeURIComponent(actionAppealMatch[2]));
            return;
        }
        const actionMatch = location.pathname.match(/^\/action\/([^/]+)\/?$/);
        if (actionMatch?.[1]) {
            await renderAction(decodeURIComponent(actionMatch[1]));
            return;
        }
        app.innerHTML = `<div class="error-state"><p class="eyebrow">404</p><h1>Route not found</h1><a class="button" href="/my-history">Return to your history</a></div>`;
    } catch (error) {
        app.innerHTML = `
            <div class="error-state">
                <p class="eyebrow">Unable to load</p>
                <h1>We lost contact with the tower.</h1>
                <p>${escapeHtml(error instanceof Error ? error.message : 'Please try again shortly.')}</p>
                <button class="button" id="retry" type="button">Try again</button>
            </div>
        `;
        document.querySelector('#retry')?.addEventListener('click', () => void renderRoute());
    }
}

void renderRoute();
