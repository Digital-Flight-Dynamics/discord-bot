import {
    APPEAL_BEHAVIORS,
    PIRACY_REASONS,
    actionStatus,
    appealAnswerEntries,
    appealEligibility,
    formatDuration,
    formatNaturalDuration,
    parseNaturalDuration,
    type AppealAnswers,
    type AppealStatus,
    type DiscordMemberProfile,
    type ModeratorAccess,
    type PublicAction,
} from '../server/domain';
import {
    Ban,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    CircleX,
    ClipboardList,
    createIcons,
    Database,
    DoorOpen,
    Eye,
    Hourglass,
    Info,
    KeyRound,
    LayoutDashboard,
    PencilLine,
    Radar,
    Search,
    Send,
    Settings,
    TriangleAlert,
    VolumeX,
    Wrench,
    X,
} from 'lucide';

type User = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    access: ModeratorAccess;
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

type ModerationPreset = {
    id: string;
    name: string;
    reason: string;
    durationMs: number | null;
    durationToken: string | null;
};

type ManagementChannel = {
    id: string;
    name: string;
    category: string;
    categoryPosition: number;
    position: number;
};

type ManagedBotSetting = {
    key: string;
    category: string;
    label: string;
    description: string;
    help: string;
    configured: boolean;
    maskedValue: string | null;
    updatedAt: string | null;
};

type ModerationEmbedField = {
    name: string;
    value: string;
    inline: boolean;
};

type ModerationEmbed = {
    title?: string;
    url?: string;
    description?: string;
    color?: string | number;
    timestamp?: string;
    author?: { name: string; url?: string; icon_url?: string };
    footer?: { text: string; icon_url?: string };
    thumbnail?: { url: string };
    image?: { url: string };
    fields?: ModerationEmbedField[];
};

type EmbedBuilderController = {
    serialize: () => ModerationEmbed[];
    reset: () => void;
    load: (embeds: ModerationEmbed[]) => void;
};

const app = document.querySelector<HTMLElement>('#app')!;
const modalRoot = document.querySelector<HTMLElement>('#modal-root')!;
const toastRoot = document.querySelector<HTMLElement>('#toast-root')!;
const moderatorIcons = {
    Ban,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    CircleX,
    ClipboardList,
    Database,
    DoorOpen,
    Eye,
    Hourglass,
    Info,
    KeyRound,
    LayoutDashboard,
    PencilLine,
    Radar,
    Search,
    Send,
    Settings,
    TriangleAlert,
    VolumeX,
    Wrench,
    X,
};

function renderModeratorIcons(root: HTMLElement = app): void {
    createIcons({
        icons: moderatorIcons,
        root,
        attrs: {
            'aria-hidden': 'true',
            'stroke-width': 1.8,
        },
    });
}

function moderatorIcon(name: string): string {
    return `<i data-lucide="${escapeHtml(name)}"></i>`;
}

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

type ToastType = 'success' | 'warning' | 'info' | 'danger';
type ToastNotice = { id: number; message: string; type: ToastType };

const toastQueue: ToastNotice[] = [];
let nextToastId = 1;

const toastPresentation: Record<ToastType, { title: string; icon: string }> = {
    success: { title: 'Success', icon: 'circle-check' },
    warning: { title: 'Warning', icon: 'triangle-alert' },
    info: { title: 'Information', icon: 'info' },
    danger: { title: 'Something went wrong', icon: 'circle-x' },
};

function renderToastQueue(): void {
    const visible = toastQueue.slice(0, 3);
    const hidden = toastQueue.length - visible.length;
    toastRoot.innerHTML = `
        ${visible.map((notice) => {
            const presentation = toastPresentation[notice.type];
            return `
                <section class="toast toast-${notice.type}" role="${notice.type === 'danger' ? 'alert' : 'status'}">
                    <span class="toast-icon">${moderatorIcon(presentation.icon)}</span>
                    <div class="toast-copy">
                        <strong>${presentation.title}</strong>
                        <p>${escapeHtml(notice.message)}</p>
                    </div>
                    <button type="button" data-toast-dismiss="${notice.id}" aria-label="Dismiss notification">
                        ${moderatorIcon('x')}
                    </button>
                </section>`;
        }).join('')}
        ${hidden > 0 ? `<div class="toast-overflow" role="status"><span>+${hidden}</span> more notification${hidden === 1 ? '' : 's'} queued</div>` : ''}
    `;
    for (const button of toastRoot.querySelectorAll<HTMLButtonElement>('[data-toast-dismiss]')) {
        button.addEventListener('click', () => {
            const id = Number(button.dataset.toastDismiss);
            const index = toastQueue.findIndex((notice) => notice.id === id);
            if (index >= 0) toastQueue.splice(index, 1);
            renderToastQueue();
        });
    }
    renderModeratorIcons(toastRoot);
}

function toast(message: string, type: ToastType = 'info'): void {
    toastQueue.push({ id: nextToastId++, message, type });
    renderToastQueue();
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

function kindMarkup(kind: PublicAction['kind'], iconOnly = false): string {
    if (kind === 'warning') {
        return `<span class="kind-badge kind-warning"${iconOnly ? ' title="Warning" aria-label="Warning"' : ''}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.7 20h18.6L12 3Z"></path><path d="M12 9v5M12 17.5v.1"></path></svg>
            ${iconOnly ? '' : '<span>Warning</span>'}
        </span>`;
    }
    if (kind === 'timeout') {
        return `<span class="kind-badge kind-mute"${iconOnly ? ' title="Mute" aria-label="Mute"' : ''}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 4V5L9 9H5Z"></path><path d="m17 9 5 5M22 9l-5 5"></path></svg>
            ${iconOnly ? '' : '<span>Mute</span>'}
        </span>`;
    }
    if (kind === 'kick') {
        return `<span class="kind-badge kind-kick"${iconOnly ? ' title="Kick" aria-label="Kick"' : ''}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h11v18H4zM9 12h.1"></path><path d="M14 12h8M19 9l3 3-3 3"></path></svg>
            ${iconOnly ? '' : '<span>Kick</span>'}
        </span>`;
    }
    return `<span class="kind-badge kind-ban"${iconOnly ? ' title="Ban" aria-label="Ban"' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m5.7 5.7 12.6 12.6"></path></svg>
        ${iconOnly ? '' : '<span>Ban</span>'}
    </span>`;
}

function logoutIcon(): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"></path></svg>`;
}

function userChip(user: User, view: 'user' | 'moderation' = 'user'): string {
    const viewButton = user.access.moderator
        ? view === 'moderation'
            ? '<a class="mod-view-button" href="/my-history">User View</a>'
            : '<a class="mod-view-button" href="/moderation">Mod View</a>'
        : '';
    return `
        <div class="user-area">
            ${viewButton}
            <div class="user-chip">
                <img class="avatar" src="${escapeHtml(user.avatarUrl)}" alt="" />
                <span>
                    <strong>${escapeHtml(user.displayName)}</strong>
                    <small>@${escapeHtml(user.username)}</small>
                </span>
                <button class="icon-button" id="logout" type="button" aria-label="Log out">${logoutIcon()}</button>
            </div>
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
                ${error ? `<p class="inline-alert" role="alert">${escapeHtml(error)}</p>` : ''}
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
        toast(error instanceof Error ? error.message : 'Could not begin the appeal.', 'danger');
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
        const valueLabel = trigger.querySelector<HTMLElement>('[data-selected-label]') || trigger.querySelector<HTMLElement>('span')!;
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
                valueLabel.textContent =
                    option.querySelector<HTMLElement>('[data-option-label]')?.textContent ||
                    option.querySelector('span')!.textContent;
                options.forEach((item) => (item.ariaSelected = String(item === option)));
                select.classList.remove('invalid');
                close(select);
                trigger.focus();
                input.dispatchEvent(new Event('change', { bubbles: true }));
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
            toast(error instanceof Error ? error.message : 'Could not submit your appeal.', 'danger');
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
            toast(error instanceof Error ? error.message : 'No invite is available.', 'danger');
        }
    });
}

type ModeratorAction = PublicAction & {
    subjectUserId: string;
    subjectUsername: string | null;
    subjectDisplayName: string | null;
    privateNote: string | null;
    moderatorUserId: string | null;
    moderatorUsername: string | null;
    moderatorDisplayName: string | null;
    modLogUrl: string | null;
    modThreadUrl: string | null;
    activityCount: number;
    latestActivity: { label: string; at: string } | null;
};

type Paginated<T> = {
    items: T[];
    total: number;
    page: number;
    limit: 10 | 25;
    pages: number;
};

type ModerationAuditEntry = {
    id: string;
    actionId: string;
    actionKind: PublicAction['kind'];
    activity: string;
    details: string;
    moderatorUserId: string | null;
    moderatorUsername: string | null;
    moderatorDisplayName: string | null;
    subjectUserId: string;
    subjectUsername: string | null;
    subjectDisplayName: string | null;
    createdAt: string;
};

function moderationSidebar(active: string, showManagementTools: boolean): string {
    const items: Array<[string, string, string, string]> = [
        ['dashboard', '/moderation', 'Dashboard', 'layout-dashboard'],
        ['radar', '/moderation/radar', 'User Radar', 'radar'],
        ['logs', '/moderation/logs', 'Mod Logs', 'clipboard-list'],
        ['actions', '/moderation/actions', 'Actions DB', 'database'],
    ];
    if (showManagementTools) {
        items.push(['tools', '/moderation/tools', 'Management Tools', 'wrench']);
        items.push(['settings', '/moderation/settings', 'Bot Settings', 'settings']);
    }
    return `
        <aside class="moderation-sidebar">
            <a class="moderation-brand" href="/moderation">
                <img src="/assets/dfd-logo.png" alt="" />
                <span><strong>ATC</strong><small>Moderator Console</small></span>
            </a>
            <nav>
                ${items.map(([id, href, label, icon]) => `
                    <a class="${active === id ? 'active' : ''}" href="${href}">
                        <span class="nav-symbol">${moderatorIcon(icon)}</span><span>${label}</span>
                    </a>`).join('')}
            </nav>
        </aside>
    `;
}

function moderationShell(
    user: User,
    active: string,
    title: string,
    subtitle: string,
    content: string,
    headerPrefix = '',
): void {
    app.innerHTML = `
        <div class="moderation-root page-enter">
            ${moderationSidebar(active, user.access.management)}
            <section class="moderation-workspace">
                <header class="moderation-topbar">
                    <div>
                        ${headerPrefix}
                        <h1>${escapeHtml(title)}</h1>
                        ${subtitle ? `<p class="lede">${escapeHtml(subtitle)}</p>` : ''}
                    </div>
                    ${userChip(user, 'moderation')}
                </header>
                ${content}
            </section>
        </div>
    `;
    attachLogout();
    renderModeratorIcons();
}

function moderatorActionRows(actions: ModeratorAction[], showActivity = false): string {
    if (!actions.length) return `<div class="mod-empty">No matching moderation actions.</div>`;
    return `
        <div class="mod-table-wrap">
            <table class="mod-table">
                <thead><tr>
                    <th>Action</th><th>User</th><th>Type</th><th>Status</th><th>Reason</th>
                    ${showActivity ? '<th>Latest activity</th>' : ''}
                    <th>Issued</th><th></th>
                </tr></thead>
                <tbody>
                    ${actions.map((action) => `
                        <tr>
                            <td><a class="action-link" href="/moderation/actions/${encodeURIComponent(action.actionId)}">${escapeHtml(action.actionId)}</a></td>
                            <td>
                                <a class="subject-link" href="/moderation/radar/${encodeURIComponent(action.subjectUserId)}">
                                    <strong>${escapeHtml(action.subjectDisplayName || action.subjectUsername || action.subjectUserId)}</strong>
                                    <small>${escapeHtml(action.subjectUserId)}</small>
                                </a>
                            </td>
                            <td>${kindMarkup(action.kind)}</td>
                            <td>${statusMarkup(action)}</td>
                            <td class="mod-reason">${escapeHtml(action.reason)}</td>
                            ${showActivity ? `<td>${action.latestActivity
                                ? `<strong class="activity-label">${escapeHtml(action.latestActivity.label)}</strong><small>${formatDate(action.latestActivity.at, true)} · ${action.activityCount} update${action.activityCount === 1 ? '' : 's'}</small>`
                                : '<span class="muted-value">Action created</span>'}</td>` : ''}
                            <td class="nowrap">${formatDate(action.createdAt, true)}</td>
                            <td>${action.modLogUrl ? `<a class="row-arrow" href="${escapeHtml(action.modLogUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open Discord log">↗</a>` : ''}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

function paginationMarkup(data: Paginated<unknown>): string {
    const first = data.total ? (data.page - 1) * data.limit + 1 : 0;
    const last = Math.min(data.total, data.page * data.limit);
    return `
        <footer class="table-pagination">
            <span>${first}–${last} of ${data.total}</span>
            <div class="pagination-actions">
                <label>Rows
                    <select data-pagination-limit>
                        <option value="10" ${data.limit === 10 ? 'selected' : ''}>10</option>
                        <option value="25" ${data.limit === 25 ? 'selected' : ''}>25</option>
                    </select>
                </label>
                <button type="button" data-pagination-previous aria-label="Previous page" ${data.page <= 1 ? 'disabled' : ''}>
                    ${moderatorIcon('chevron-left')}
                </button>
                <strong>Page ${data.page} of ${data.pages}</strong>
                <button type="button" data-pagination-next aria-label="Next page" ${data.page >= data.pages ? 'disabled' : ''}>
                    ${moderatorIcon('chevron-right')}
                </button>
            </div>
        </footer>`;
}

function bindPagination(
    root: HTMLElement,
    data: Paginated<unknown>,
    load: (page: number, limit: 10 | 25) => Promise<void>,
): void {
    root.querySelector<HTMLSelectElement>('[data-pagination-limit]')?.addEventListener('change', (event) => {
        const limit = (event.currentTarget as HTMLSelectElement).value === '25' ? 25 : 10;
        void load(1, limit);
    });
    root.querySelector<HTMLButtonElement>('[data-pagination-previous]')?.addEventListener('click', () => {
        void load(Math.max(1, data.page - 1), data.limit);
    });
    root.querySelector<HTMLButtonElement>('[data-pagination-next]')?.addEventListener('click', () => {
        void load(Math.min(data.pages, data.page + 1), data.limit);
    });
}

async function renderModerationDashboard(): Promise<void> {
    const [user, data] = await Promise.all([
        loadUser(),
        fetchJson<{
            metrics: { totalActions: number; actions30d: number; users30d: number; openAppeals: number };
            latestActions: ModeratorAction[];
        }>('/api/moderation/dashboard'),
    ]);
    moderationShell(user, 'dashboard', 'Dashboard', 'A live operational overview of community moderation.', `
        <section class="metric-grid">
            <article><span>Total actions</span><strong>${data.metrics.totalActions}</strong><small>All recorded time</small></article>
            <article><span>Last 30 days</span><strong>${data.metrics.actions30d}</strong><small>New actions issued</small></article>
            <article><span>Users involved</span><strong>${data.metrics.users30d}</strong><small>Unique users · 30 days</small></article>
            <article class="${data.metrics.openAppeals ? 'attention' : ''}"><span>Open appeals</span><strong>${data.metrics.openAppeals}</strong><small>Awaiting a decision</small></article>
        </section>
        <section class="mod-panel">
            <div class="mod-panel-heading"><div><p class="eyebrow">Live feed</p><h2>Latest actions</h2></div><a href="/moderation/logs">View all logs →</a></div>
            ${moderatorActionRows(data.latestActions)}
        </section>
    `);
}

function radarBleeps(): string {
    const positions = Array.from({ length: 12 }, (_, index) => index).sort(() => Math.random() - 0.5).slice(0, 7);
    return positions.map((position) => `<i class="radar-bleep bleep-position-${position}"></i>`).join('');
}

function radarTerrain(): string {
    const contours = Array.from({ length: 18 }, (_, index) => {
        const baseline = 8 + (index * 84) / 17;
        const points = Array.from({ length: 9 }, (_, pointIndex) => {
            const x = pointIndex * 12.5;
            const y = baseline + Math.sin(pointIndex * 1.35 + index * .7) * 2.5 + (Math.random() - .5) * 3.5;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        return `<polyline points="${points.join(' ')}" style="--terrain-delay: -${(index * .32).toFixed(2)}s" />`;
    }).join('');
    return `
        <svg class="radar-terrain" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${contours}</svg>
        <span class="radar-greece" aria-hidden="true">
            <img src="/assets/athens-radar.svg?v=3" alt="" />
            <img class="radar-airport-dots" src="/assets/athens-airport-dots.svg?v=1" alt="" />
        </span>
    `;
}

const radarRateFrames = new WeakMap<Animation, number>();

function setRadarPlaybackRate(stage: HTMLElement, rate: number, duration = 650): void {
    const sweep = stage.querySelector<HTMLElement>('.radar-sweep');
    const animation = sweep?.getAnimations()[0];
    if (!animation) return;

    const previousFrame = radarRateFrames.get(animation);
    if (previousFrame !== undefined) cancelAnimationFrame(previousFrame);

    const startingRate = animation.playbackRate;
    const startedAt = performance.now();
    const update = (now: number): void => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress * progress * (3 - (2 * progress));
        animation.updatePlaybackRate(startingRate + ((rate - startingRate) * eased));
        if (progress < 1) {
            radarRateFrames.set(animation, requestAnimationFrame(update));
        } else {
            radarRateFrames.delete(animation);
        }
    };
    radarRateFrames.set(animation, requestAnimationFrame(update));
}

function radarContacts(users: Array<DiscordMemberProfile & { databaseOnly?: boolean }>): string {
    const shuffle = (values: number[]) => values.sort(() => Math.random() - 0.5);
    const positions = [
        ...shuffle([0, 1]),
        ...shuffle([2, 3]),
        ...shuffle([4, 5]),
        ...shuffle([6, 7, 8]),
        9,
    ];

    return users.slice(0, 10).map((result, index) => {
        const profileName = result.globalName && result.globalName !== result.displayName
            ? `<span class="radar-contact-profile">${escapeHtml(result.globalName)}</span>`
            : '';
        const roles = result.roles.slice(0, 3);
        const roleList = roles.length
            ? roles.map((role) => {
                const color = role.color > 0 && role.color <= 0xFFFFFF
                    ? `#${role.color.toString(16).padStart(6, '0')}`
                    : '#747b87';
                return `<span class="discord-role" style="--role-color: ${color}">${escapeHtml(role.name)}</span>`;
            }).join('')
            : '<span class="discord-role empty">No server roles</span>';
        const databaseWarning = result.databaseOnly
            ? '<span class="radar-database-warning">Could not find this user on the Discord server, displaying the database record</span>'
            : '';

        return `
            <a class="radar-contact radar-contact-position-${positions[index]}" href="/moderation/radar/${encodeURIComponent(result.id)}">
                <span class="radar-contact-stem" aria-hidden="true"></span>
                <span class="radar-contact-leader" aria-hidden="true"></span>
                <span class="radar-contact-dot" aria-hidden="true"></span>
                <span class="radar-contact-main">
                    ${result.databaseOnly
                        ? '<span class="avatar-placeholder database-avatar"><i data-lucide="database"></i></span>'
                        : result.avatarUrl
                        ? `<img src="${escapeHtml(result.avatarUrl)}" alt="" />`
                        : `<span class="avatar-placeholder">${escapeHtml(result.displayName.slice(0, 1))}</span>`}
                    <span class="radar-contact-names">
                        <strong>${escapeHtml(result.displayName)}</strong>
                        ${profileName}
                        <small>@${escapeHtml(result.username)}</small>
                        ${databaseWarning}
                    </span>
                </span>
                <span class="radar-contact-detail">
                    <span class="radar-contact-id"><small>Discord ID</small><code>${escapeHtml(result.id)}</code></span>
                    <span class="radar-contact-roles">${roleList}</span>
                </span>
            </a>`;
    }).join('');
}

async function renderUserRadar(): Promise<void> {
    const user = await loadUser();
    moderationShell(user, 'radar', 'User Radar', 'Find a Discord member or a historical account record.', `
        <section class="radar-stage" id="radar-stage">
            ${radarTerrain()}
            <div class="radar-orbit" aria-hidden="true">
                <span class="radar-axis horizontal"></span>
                <span class="radar-axis vertical"></span>
                <span class="radar-sweep"></span>
                <span class="radar-bleeps">${radarBleeps()}</span>
            </div>
            <div class="radar-search-card">
                <h2>Who are you looking for?</h2>
                <p>Search by Discord username, server display name, or exact user ID.</p>
                <form class="mod-search-form" id="radar-search">
                    <input id="radar-query" type="search" minlength="2" maxlength="100" placeholder="Username or 18-digit Discord ID" autocomplete="off" required />
                    <button class="button" type="submit">Locate</button>
                </form>
            </div>
            <div id="radar-results" class="radar-contacts" aria-live="polite"></div>
        </section>
    `);
    let noLockResetTimer: number | undefined;
    let noLockHideTimer: number | undefined;
    document.querySelector<HTMLFormElement>('#radar-search')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const query = document.querySelector<HTMLInputElement>('#radar-query')!.value.trim();
        const results = document.querySelector<HTMLElement>('#radar-results')!;
        const stage = document.querySelector<HTMLElement>('#radar-stage')!;
        const form = event.currentTarget as HTMLFormElement;
        const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        const scanStartedAt = performance.now();
        if (noLockResetTimer !== undefined) window.clearTimeout(noLockResetTimer);
        if (noLockHideTimer !== undefined) window.clearTimeout(noLockHideTimer);
        stage.classList.remove('has-results', 'no-lock');
        stage.classList.add('is-scanning');
        setRadarPlaybackRate(stage, 7);
        button.disabled = true;
        results.innerHTML = '';
        try {
            const users = await fetchJson<Array<DiscordMemberProfile & {
                databaseOnly?: boolean;
                record?: { actionCount: number; latestActionAt: string | null } | null;
            }>>(
                `/api/moderation/users/search?q=${encodeURIComponent(query)}`,
            );
            const minimumScanTime = users.length ? 1_400 : 2_200;
            const remainingScanTime = Math.max(0, minimumScanTime - (performance.now() - scanStartedAt));
            await new Promise((resolve) => setTimeout(resolve, remainingScanTime));
            stage.classList.remove('is-scanning');
            stage.classList.toggle('has-results', users.length > 0);
            setRadarPlaybackRate(stage, users.length ? 2 : 1, 900);
            if (users.length) {
                results.innerHTML = radarContacts(users);
                renderModeratorIcons(results);
            } else {
                stage.classList.add('no-lock');
                results.innerHTML = `
                    <div class="radar-no-lock-card" role="status">
                        <strong>Could not get a lock on this user.</strong>
                        <small>Check spelling, or use less characters until you find the result you are looking for.</small>
                    </div>`;
                noLockResetTimer = window.setTimeout(() => {
                    stage.classList.remove('no-lock');
                    results.querySelector('.radar-no-lock-card')?.classList.add('is-hiding');
                    noLockHideTimer = window.setTimeout(() => {
                        results.innerHTML = '';
                    }, 350);
                }, 4_500);
            }
        } catch (error) {
            stage.classList.remove('is-scanning');
            setRadarPlaybackRate(stage, 1, 900);
            results.innerHTML = `<div class="radar-scan-status error-copy">${escapeHtml(error instanceof Error ? error.message : 'Search failed.')}</div>`;
        } finally {
            button.disabled = false;
        }
    });
}

function showProfileActionWizard(
    profile: DiscordMemberProfile,
    kind: 'warn' | 'timeout' | 'kick' | 'ban',
    presets: ModerationPreset[],
    onComplete: () => Promise<void>,
): void {
    const actions = {
        warn: { label: 'Warn', icon: 'triangle-alert', duration: false, durationRequired: false },
        timeout: { label: 'Mute', icon: 'volume-x', duration: true, durationRequired: true },
        kick: { label: 'Kick', icon: 'door-open', duration: false, durationRequired: false },
        ban: { label: 'Ban', icon: 'ban', duration: true, durationRequired: false },
    } as const;
    const action = actions[kind];
    const returnFocus = document.activeElement as HTMLElement | null;
    const close = () => {
        document.removeEventListener('keydown', handleKeyDown);
        modalRoot.innerHTML = '';
        returnFocus?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        const openExpiration = modalRoot.querySelector<HTMLElement>('#quick-expiration-popover:not([hidden])');
        if (openExpiration) {
            openExpiration.hidden = true;
            modalRoot.querySelector<HTMLElement>('#quick-expiration-picker')?.classList.remove('open');
            const trigger = modalRoot.querySelector<HTMLButtonElement>('#quick-expiration-trigger');
            if (trigger) {
                trigger.ariaExpanded = 'false';
                trigger.focus();
            }
            return;
        }
        close();
    };
    modalRoot.innerHTML = `
        <div class="modal-backdrop quick-action-backdrop" role="presentation">
            <section class="modal quick-action-modal quick-action-${kind}" role="dialog" aria-modal="true" aria-labelledby="quick-action-title" tabindex="-1">
                <header class="quick-action-header">
                    <span class="quick-action-icon">${moderatorIcon(action.icon)}</span>
                    <div><p class="eyebrow">Quick action</p><h2 id="quick-action-title">${action.label} this account</h2></div>
                    <button class="quick-action-close" type="button" aria-label="Close">${moderatorIcon('x')}</button>
                </header>
                <div class="quick-action-steps" aria-label="Action progress">
                    <span class="active" data-quick-marker="1"><i>1</i>Details</span>
                    <b></b>
                    <span data-quick-marker="2"><i>2</i>Review</span>
                </div>
                <form id="quick-action-form">
                    <section class="quick-action-pane" data-quick-step="1">
                        <div class="quick-action-target">
                            ${profile.avatarUrl
                                ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="" />`
                                : `<span>${escapeHtml(profile.displayName.slice(0, 1))}</span>`}
                            <div><strong>${escapeHtml(profile.displayName)}</strong><small>@${escapeHtml(profile.username)} · ${escapeHtml(profile.id)}</small></div>
                        </div>
                        <div class="quick-action-field quick-action-preset-field">
                            <span>Preset <small>Optional</small></span>
                            <div class="preset-combobox">
                                <div class="preset-search-control">
                                    ${moderatorIcon('search')}
                                    <input id="quick-preset-search" type="search" aria-label="Search moderation presets" autocomplete="off" placeholder="Search moderation presets…" />
                                </div>
                                <div class="preset-results" id="quick-preset-results" role="listbox" hidden></div>
                            </div>
                            <small>${presets.length ? `${presets.length} preset${presets.length === 1 ? '' : 's'} available` : 'No presets have been configured yet.'}</small>
                        </div>
                        ${action.duration ? `
                            <label class="quick-action-field">
                                <span>Duration ${action.durationRequired ? '' : '<small>Optional</small>'}</span>
                                <input name="duration" value="${kind === 'timeout' ? '1 hour' : ''}" placeholder="${kind === 'ban' ? 'Leave blank for permanent' : 'Example: 1 hour'}" ${action.durationRequired ? 'required' : ''} autocomplete="off" />
                                <small>${kind === 'timeout' ? 'How long the Discord mute lasts. Between one minute and 28 days.' : 'How long the Discord ban lasts. Leave blank to make it permanent.'}</small>
                            </label>` : ''}
                        <div class="quick-action-field quick-action-expiration-field">
                            <span>Expiration <small>Optional</small></span>
                            <div class="expiration-picker" id="quick-expiration-picker">
                                <input id="quick-action-expiration" name="expiration" type="hidden" />
                                <div class="expiration-control">
                                    <button class="expiration-trigger" id="quick-expiration-trigger" type="button" aria-haspopup="dialog"
                                        aria-expanded="false" aria-label="Choose action record expiration">
                                        ${moderatorIcon('calendar-days')}
                                        <span id="quick-expiration-display">Non set</span>
                                    </button>
                                    <button class="tool-clear-button" id="quick-clear-expiration" type="button" aria-label="Clear expiration" hidden>
                                        ${moderatorIcon('x')}
                                    </button>
                                </div>
                                <div class="expiration-popover" id="quick-expiration-popover" role="dialog" aria-label="Choose expiration date and time" hidden>
                                    <div class="expiration-picker-grid">
                                        <section class="expiration-date-pane">
                                            <header>
                                                <button id="quick-expiration-previous-month" type="button" aria-label="Previous month">${moderatorIcon('chevron-left')}</button>
                                                <strong id="quick-expiration-month"></strong>
                                                <button id="quick-expiration-next-month" type="button" aria-label="Next month">${moderatorIcon('chevron-right')}</button>
                                            </header>
                                            <div class="expiration-weekdays" aria-hidden="true">
                                                <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
                                            </div>
                                            <div class="expiration-days" id="quick-expiration-days"></div>
                                        </section>
                                        <div class="expiration-time">
                                            <span>Time</span>
                                            <div>
                                                <input id="quick-expiration-hour" inputmode="numeric" maxlength="2" aria-label="Hour in 24-hour time" />
                                                <i>:</i>
                                                <input id="quick-expiration-minute" inputmode="numeric" maxlength="2" aria-label="Minute" />
                                            </div>
                                            <small>24-hour</small>
                                        </div>
                                    </div>
                                    <footer>
                                        <button class="button secondary" id="quick-expiration-cancel" type="button">Cancel</button>
                                        <button class="button" id="quick-expiration-apply" type="button">Apply</button>
                                    </footer>
                                </div>
                            </div>
                            <small>When this ATC record expires. This does not change the moderation duration.</small>
                        </div>
                        <label class="quick-action-field">
                            <span>Public reason</span>
                            <textarea name="reason" minlength="3" maxlength="2000" rows="4" required placeholder="Why is this action being issued?"></textarea>
                        </label>
                        <label class="quick-action-field">
                            <span>Private note <small>Optional</small></span>
                            <textarea name="privateNote" maxlength="500" rows="2" placeholder="Only visible to moderators"></textarea>
                        </label>
                    </section>
                    <section class="quick-action-pane quick-action-review" data-quick-step="2" hidden>
                        <div class="quick-review-row"><span>Action</span><strong>${action.label}</strong></div>
                        <div class="quick-review-row"><span>Account</span><strong>${escapeHtml(profile.displayName)} <small>${escapeHtml(profile.id)}</small></strong></div>
                        ${action.duration ? '<div class="quick-review-row"><span>Duration</span><strong id="quick-review-duration"></strong></div>' : ''}
                        <div class="quick-review-row"><span>ATC expiration</span><strong id="quick-review-expiration"></strong></div>
                        <div class="quick-review-copy"><span>Public reason</span><p id="quick-review-reason"></p></div>
                        <div class="quick-review-copy" id="quick-review-note-row"><span>Private note</span><p id="quick-review-note"></p></div>
                    </section>
                    <footer class="quick-action-footer">
                        <button class="button secondary" id="quick-action-secondary" type="button">Cancel</button>
                        <button class="button quick-action-primary" id="quick-action-primary" type="submit">Review action</button>
                    </footer>
                </form>
            </section>
        </div>`;
    renderModeratorIcons(modalRoot);
    const backdrop = modalRoot.querySelector<HTMLElement>('.quick-action-backdrop')!;
    const form = modalRoot.querySelector<HTMLFormElement>('#quick-action-form')!;
    const modal = modalRoot.querySelector<HTMLElement>('.quick-action-modal')!;
    const secondaryButton = modalRoot.querySelector<HTMLButtonElement>('#quick-action-secondary')!;
    const primaryButton = modalRoot.querySelector<HTMLButtonElement>('#quick-action-primary')!;
    const durationInput = form.elements.namedItem('duration') as HTMLInputElement | null;
    const reasonInput = form.elements.namedItem('reason') as HTMLTextAreaElement;
    const presetSearch = modalRoot.querySelector<HTMLInputElement>('#quick-preset-search')!;
    const presetResults = modalRoot.querySelector<HTMLElement>('#quick-preset-results')!;
    const expirationInput = form.elements.namedItem('expiration') as HTMLInputElement;
    const expirationPicker = modalRoot.querySelector<HTMLElement>('#quick-expiration-picker')!;
    const expirationTrigger = modalRoot.querySelector<HTMLButtonElement>('#quick-expiration-trigger')!;
    const expirationDisplay = modalRoot.querySelector<HTMLElement>('#quick-expiration-display')!;
    const clearExpirationButton = modalRoot.querySelector<HTMLButtonElement>('#quick-clear-expiration')!;
    const expirationPopover = modalRoot.querySelector<HTMLElement>('#quick-expiration-popover')!;
    const expirationMonthLabel = modalRoot.querySelector<HTMLElement>('#quick-expiration-month')!;
    const expirationDays = modalRoot.querySelector<HTMLElement>('#quick-expiration-days')!;
    const expirationHour = modalRoot.querySelector<HTMLInputElement>('#quick-expiration-hour')!;
    const expirationMinute = modalRoot.querySelector<HTMLInputElement>('#quick-expiration-minute')!;
    let reviewing = false;
    let durationMs = 0;
    let pickerDraft = new Date();
    let pickerMonth = new Date(pickerDraft.getFullYear(), pickerDraft.getMonth(), 1);
    document.addEventListener('keydown', handleKeyDown);

    const formatExpiration = (date: Date) =>
        new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
    const setExpiration = (timestamp: number | null) => {
        const validTimestamp = timestamp && timestamp > Date.now() ? timestamp : 0;
        expirationInput.value = validTimestamp ? localDateTimeValue(validTimestamp) : '';
        expirationDisplay.textContent = validTimestamp ? formatExpiration(new Date(validTimestamp)) : 'Non set';
        clearExpirationButton.hidden = !validTimestamp;
        expirationDays.classList.remove('invalid');
    };
    const closeExpirationPicker = () => {
        expirationPopover.hidden = true;
        expirationTrigger.ariaExpanded = 'false';
        expirationPicker.classList.remove('open');
    };
    const renderExpirationCalendar = () => {
        expirationMonthLabel.textContent = new Intl.DateTimeFormat(undefined, {
            month: 'long',
            year: 'numeric',
        }).format(pickerMonth);
        const start = new Date(pickerMonth);
        start.setDate(1 - start.getDay());
        const today = new Date();
        const buttons: string[] = [];
        for (let index = 0; index < 42; index += 1) {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            const isOutside = date.getMonth() !== pickerMonth.getMonth();
            const isToday =
                date.getFullYear() === today.getFullYear() &&
                date.getMonth() === today.getMonth() &&
                date.getDate() === today.getDate();
            const isSelected =
                date.getFullYear() === pickerDraft.getFullYear() &&
                date.getMonth() === pickerDraft.getMonth() &&
                date.getDate() === pickerDraft.getDate();
            buttons.push(`
                <button type="button" data-picker-date="${date.getFullYear()}-${date.getMonth()}-${date.getDate()}"
                    class="${isOutside ? 'outside' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}"
                    aria-label="${escapeHtml(new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(date))}"
                    aria-pressed="${isSelected}">${date.getDate()}</button>`);
        }
        expirationDays.innerHTML = buttons.join('');
    };
    const openExpirationPicker = () => {
        const existing = expirationInput.value ? new Date(expirationInput.value) : new Date(Date.now() + 3_600_000);
        pickerDraft = Number.isNaN(existing.getTime()) ? new Date(Date.now() + 3_600_000) : existing;
        pickerMonth = new Date(pickerDraft.getFullYear(), pickerDraft.getMonth(), 1);
        expirationHour.value = String(pickerDraft.getHours()).padStart(2, '0');
        expirationMinute.value = String(pickerDraft.getMinutes()).padStart(2, '0');
        renderExpirationCalendar();
        expirationPopover.hidden = false;
        expirationTrigger.ariaExpanded = 'true';
        expirationPicker.classList.add('open');
    };
    const renderPresetResults = () => {
        const query = presetSearch.value.trim().toLocaleLowerCase();
        const matches = presets.filter((preset) => !query || preset.name.toLocaleLowerCase().includes(query)).slice(0, 8);
        presetResults.innerHTML = matches.length
            ? matches.map((preset) => `
                <button type="button" role="option" data-preset-id="${escapeHtml(preset.id)}">
                    <span><strong>${escapeHtml(preset.name)}</strong><small>${escapeHtml(preset.reason)}</small></span>
                    <span>${escapeHtml(formatDuration(preset.durationMs) || 'No duration')}</span>
                </button>`).join('')
            : `<p>${presets.length ? 'No matching presets.' : 'No presets configured.'}</p>`;
        presetResults.hidden = false;
    };

    presetSearch.addEventListener('focus', renderPresetResults);
    presetSearch.addEventListener('input', renderPresetResults);
    presetSearch.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            presetResults.hidden = true;
            presetSearch.blur();
        }
    });
    presetResults.addEventListener('mousedown', (event) => event.preventDefault());
    presetResults.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-preset-id]');
        const preset = presets.find((candidate) => candidate.id === button?.dataset.presetId);
        if (!preset) return;
        presetSearch.value = preset.name;
        reasonInput.value = preset.reason;
        if (durationInput) {
            durationInput.value = preset.durationMs ? formatNaturalDuration(preset.durationMs) : '';
            durationInput.setCustomValidity('');
        }
        presetResults.hidden = true;
    });
    presetSearch.addEventListener('blur', () => window.setTimeout(() => (presetResults.hidden = true)));

    expirationTrigger.addEventListener('click', () => {
        if (expirationPopover.hidden) openExpirationPicker();
        else closeExpirationPicker();
    });
    clearExpirationButton.addEventListener('click', () => setExpiration(null));
    modalRoot.querySelector<HTMLButtonElement>('#quick-expiration-previous-month')!.addEventListener('click', () => {
        pickerMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1);
        renderExpirationCalendar();
    });
    modalRoot.querySelector<HTMLButtonElement>('#quick-expiration-next-month')!.addEventListener('click', () => {
        pickerMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1);
        renderExpirationCalendar();
    });
    expirationDays.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-picker-date]');
        if (!button?.dataset.pickerDate) return;
        const [year, month, day] = button.dataset.pickerDate.split('-').map(Number);
        pickerDraft.setFullYear(year!, month!, day!);
        pickerMonth = new Date(year!, month!, 1);
        renderExpirationCalendar();
    });
    for (const input of [expirationHour, expirationMinute]) {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '').slice(0, 2);
            input.removeAttribute('aria-invalid');
        });
    }
    modalRoot.querySelector<HTMLButtonElement>('#quick-expiration-cancel')!.addEventListener('click', closeExpirationPicker);
    modalRoot.querySelector<HTMLButtonElement>('#quick-expiration-apply')!.addEventListener('click', () => {
        const hour = Number(expirationHour.value);
        const minute = Number(expirationMinute.value);
        const invalidHour = !Number.isInteger(hour) || hour < 0 || hour > 23;
        const invalidMinute = !Number.isInteger(minute) || minute < 0 || minute > 59;
        expirationHour.toggleAttribute('aria-invalid', invalidHour);
        expirationMinute.toggleAttribute('aria-invalid', invalidMinute);
        if (invalidHour || invalidMinute) {
            (invalidHour ? expirationHour : expirationMinute).focus();
            return;
        }
        pickerDraft.setHours(hour, minute, 0, 0);
        if (pickerDraft.getTime() <= Date.now()) {
            expirationDays.classList.add('invalid');
            return;
        }
        setExpiration(pickerDraft.getTime());
        closeExpirationPicker();
    });
    modal.addEventListener('pointerdown', (event) => {
        if (!expirationPopover.hidden && !expirationPicker.contains(event.target as Node)) closeExpirationPicker();
    });

    const showDetails = () => {
        reviewing = false;
        form.querySelector<HTMLElement>('[data-quick-step="1"]')!.hidden = false;
        form.querySelector<HTMLElement>('[data-quick-step="2"]')!.hidden = true;
        modalRoot.querySelector<HTMLElement>('[data-quick-marker="1"]')!.className = 'active';
        modalRoot.querySelector<HTMLElement>('[data-quick-marker="2"]')!.className = '';
        secondaryButton.textContent = 'Cancel';
        primaryButton.textContent = 'Review action';
        modal.scrollTop = 0;
    };
    const showReview = () => {
        const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
        const durationText = durationInput?.value.trim() || '';
        durationInput?.setCustomValidity('');
        durationMs = durationText ? parseNaturalDuration(durationText) || 0 : 0;
        if (durationInput && durationText && !durationMs) {
            durationInput.setCustomValidity('Enter a valid duration, such as “1 hour” or “3 days”.');
            durationInput.reportValidity();
            return;
        }
        if (kind === 'timeout' && (durationMs < 60_000 || durationMs > 2_419_200_000)) {
            durationInput?.setCustomValidity('Mutes must last between one minute and 28 days.');
            durationInput?.reportValidity();
            return;
        }
        presetResults.hidden = true;
        closeExpirationPicker();
        reviewing = true;
        form.querySelector<HTMLElement>('[data-quick-step="1"]')!.hidden = true;
        form.querySelector<HTMLElement>('[data-quick-step="2"]')!.hidden = false;
        modalRoot.querySelector<HTMLElement>('[data-quick-marker="1"]')!.className = 'complete';
        modalRoot.querySelector<HTMLElement>('[data-quick-marker="2"]')!.className = 'active';
        modalRoot.querySelector<HTMLElement>('#quick-review-reason')!.textContent = values.reason || '';
        modalRoot.querySelector<HTMLElement>('#quick-review-note')!.textContent = values.privateNote || 'None';
        if (durationInput) {
            modalRoot.querySelector<HTMLElement>('#quick-review-duration')!.textContent = durationMs
                ? formatNaturalDuration(durationMs)
                : 'Permanent';
        }
        modalRoot.querySelector<HTMLElement>('#quick-review-expiration')!.textContent = expirationInput.value
            ? formatExpiration(new Date(expirationInput.value))
            : 'Not set';
        secondaryButton.textContent = 'Back';
        primaryButton.textContent = `Execute ${action.label.toLowerCase()}`;
        modal.scrollTop = 0;
    };

    modalRoot.querySelector<HTMLButtonElement>('.quick-action-close')!.addEventListener('click', close);
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) close();
    });
    durationInput?.addEventListener('input', () => durationInput.setCustomValidity(''));
    secondaryButton.addEventListener('click', () => reviewing ? showDetails() : close());
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!reviewing) {
            if (form.reportValidity()) showReview();
            return;
        }
        const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
        primaryButton.disabled = true;
        secondaryButton.disabled = true;
        primaryButton.textContent = 'Executing…';
        try {
            const result = await fetchJson<{ actionId: string }>('/api/moderation/tools/action', {
                method: 'POST',
                body: JSON.stringify({
                    targetUserId: profile.id,
                    kind,
                    reason: values.reason,
                    privateNote: values.privateNote,
                    durationMs,
                    expiration: expirationInput.value ? new Date(expirationInput.value).toISOString() : '',
                }),
            });
            close();
            toast(`Action ${result.actionId} completed.`, 'success');
            void onComplete();
        } catch (error) {
            primaryButton.disabled = false;
            secondaryButton.disabled = false;
            primaryButton.textContent = `Execute ${action.label.toLowerCase()}`;
            toast(error instanceof Error ? error.message : 'The moderation action failed.', 'danger');
        }
    });
    modal.focus();
}

async function renderRadarProfile(userId: string): Promise<void> {
    const [user, data, presets] = await Promise.all([
        loadUser(),
        fetchJson<{ profile: DiscordMemberProfile; actions: ModeratorAction[] }>(`/api/moderation/users/${encodeURIComponent(userId)}`),
        fetchJson<ModerationPreset[]>('/api/moderation/tools/presets'),
    ]);
    const profile = data.profile;
    const actions = data.actions;
    const roleMarkup = profile.roles.length
        ? profile.roles.map((role) => {
            const color = role.color > 0 && role.color <= 0xFFFFFF
                ? `#${role.color.toString(16).padStart(6, '0')}`
                : '#747b87';
            return `<span class="discord-role" style="--role-color: ${color}">${escapeHtml(role.name)}</span>`;
        }).join('')
        : '<span class="discord-role empty">No server roles</span>';
    const actionButton = (kind: 'warn' | 'timeout' | 'kick' | 'ban', label: string, icon: string) => `
        <button class="profile-action-button action-${kind}" type="button" data-profile-action="${kind}">
            ${moderatorIcon(icon)}<span>${label}</span>
        </button>`;
    const cameFromRadar = (() => {
        try {
            const referrer = new URL(document.referrer);
            return referrer.origin === location.origin && referrer.pathname === '/moderation/radar';
        } catch {
            return false;
        }
    })();
    moderationShell(user, 'radar', profile.displayName, '', `
        <section class="profile-command-card">
            <div class="profile-summary-row">
                <div class="profile-identity">
                    ${profile.avatarUrl ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="" />` : ''}
                    <div><p class="eyebrow">${profile.isMember ? 'Current member' : 'Not currently in server'}</p><h2>${escapeHtml(profile.displayName)}</h2><p>@${escapeHtml(profile.username)}</p></div>
                </div>
                <div class="profile-action-buttons" aria-label="Moderation actions">
                    ${actionButton('warn', 'Warn', 'triangle-alert')}
                    ${actionButton('timeout', 'Mute', 'volume-x')}
                    ${actionButton('kick', 'Kick', 'door-open')}
                    ${actionButton('ban', 'Ban', 'ban')}
                </div>
            </div>
            <dl class="profile-facts">
                <div><dt>Discord ID</dt><dd><code>${escapeHtml(profile.id)}</code></dd></div>
                <div><dt>Account created</dt><dd>${formatDate(profile.createdAt, true)}</dd></div>
                <div><dt>Joined server</dt><dd>${profile.joinedAt ? formatDate(profile.joinedAt, true) : 'Not available'}</dd></div>
                <div><dt>ATC record</dt><dd>${data.actions.length} action${data.actions.length === 1 ? '' : 's'}</dd></div>
            </dl>
            <div class="role-cloud">${roleMarkup}</div>
        </section>
        <section class="mod-panel profile-actions-panel">
            <div class="mod-panel-heading"><div><h2>Actions on Account</h2></div><span id="profile-actions-count"></span></div>
            <div class="profile-actions-filter">
                ${moderatorIcon('search')}
                <input id="profile-actions-query" type="search" placeholder="Filter by action ID, type, status, or reason" autocomplete="off" />
            </div>
            <div id="profile-actions-results"></div>
        </section>
    `, `<div class="header-navigation"><a class="back-link header-back-link" href="${cameFromRadar ? '/moderation/radar' : '#'}"${cameFromRadar ? '' : ' data-radar-history-back'}>← ${cameFromRadar ? 'New Search' : 'Back'}</a>${cameFromRadar ? '' : '<a class="header-dotted-link" href="/moderation/radar">New Radar Search</a>'}</div>`);
    if (!cameFromRadar) {
        document.querySelector<HTMLAnchorElement>('[data-radar-history-back]')?.addEventListener('click', (event) => {
            event.preventDefault();
            if (history.length > 1) history.back();
            else location.href = '/moderation/radar';
        });
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-profile-action]')) {
        button.addEventListener('click', () => {
            const kind = button.dataset.profileAction as 'warn' | 'timeout' | 'kick' | 'ban';
            showProfileActionWizard(profile, kind, presets, () => renderRadarProfile(profile.id));
        });
    }
    const queryInput = document.querySelector<HTMLInputElement>('#profile-actions-query')!;
    const results = document.querySelector<HTMLElement>('#profile-actions-results')!;
    const count = document.querySelector<HTMLElement>('#profile-actions-count')!;
    let page = 1;
    const renderActions = () => {
        const query = queryInput.value.trim().toLocaleLowerCase();
        const filtered = actions.filter((action) => !query || [
            action.actionId,
            action.kind,
            action.kind === 'timeout' ? 'mute' : '',
            actionStatus(action),
            action.reason,
        ].some((value) => value.toLocaleLowerCase().includes(query)));
        const pages = Math.max(1, Math.ceil(filtered.length / 10));
        page = Math.min(page, pages);
        const first = filtered.length ? (page - 1) * 10 + 1 : 0;
        const last = Math.min(filtered.length, page * 10);
        count.textContent = `${filtered.length} action${filtered.length === 1 ? '' : 's'}`;
        results.innerHTML = `
            ${moderatorActionRows(filtered.slice(first ? first - 1 : 0, last))}
            ${filtered.length ? `
                <footer class="table-pagination">
                    <span>${first}–${last} of ${filtered.length}</span>
                    <div class="pagination-actions">
                        <button type="button" data-profile-previous aria-label="Previous page" ${page <= 1 ? 'disabled' : ''}>${moderatorIcon('chevron-left')}</button>
                        <strong>Page ${page} of ${pages}</strong>
                        <button type="button" data-profile-next aria-label="Next page" ${page >= pages ? 'disabled' : ''}>${moderatorIcon('chevron-right')}</button>
                    </div>
                </footer>` : ''}`;
        results.querySelector<HTMLButtonElement>('[data-profile-previous]')?.addEventListener('click', () => {
            page = Math.max(1, page - 1);
            renderActions();
        });
        results.querySelector<HTMLButtonElement>('[data-profile-next]')?.addEventListener('click', () => {
            page = Math.min(pages, page + 1);
            renderActions();
        });
        renderModeratorIcons(results);
    };
    queryInput.addEventListener('input', () => {
        page = 1;
        renderActions();
    });
    renderActions();
}

async function renderModerationLogs(): Promise<void> {
    const user = await loadUser();
    moderationShell(user, 'logs', 'Mod Logs', 'An audit trail of moderator activity across every recorded action.', `
        <section class="mod-panel" id="moderation-log-results">
            <div class="loading-inline"><span class="spinner"></span>Loading moderator activity…</div>
        </section>
    `);
    const load = async (page = 1, limit: 10 | 25 = 10) => {
        const target = document.querySelector<HTMLElement>('#moderation-log-results')!;
        target.innerHTML = `<div class="loading-inline"><span class="spinner"></span>Loading moderator activity…</div>`;
        try {
            const data = await fetchJson<Paginated<ModerationAuditEntry>>(
                `/api/moderation/logs?page=${page}&limit=${limit}`,
            );
            target.innerHTML = `
                <div class="mod-panel-heading">
                    <div><p class="eyebrow">Moderator audit</p><h2>Recorded activity</h2></div>
                    <span>${data.total} event${data.total === 1 ? '' : 's'}</span>
                </div>
                ${
                    data.items.length
                        ? `<div class="mod-table-wrap">
                            <table class="mod-table audit-table">
                                <thead><tr><th>Action</th><th>Moderator</th><th>Activity</th><th>Target</th><th>Details</th><th>Time</th></tr></thead>
                                <tbody>${data.items.map((entry) => `
                                    <tr>
                                        <td><span class="audit-action"><span class="audit-action-kind">${kindMarkup(entry.actionKind, true)}</span><a class="action-link" href="/moderation/actions/${encodeURIComponent(entry.actionId)}">${escapeHtml(entry.actionId)}</a></span></td>
                                        <td>
                                            ${entry.moderatorUserId
                                                ? `<a class="subject-link" href="/moderation/radar/${encodeURIComponent(entry.moderatorUserId)}"><strong>${escapeHtml(entry.moderatorDisplayName || entry.moderatorUsername || entry.moderatorUserId)}</strong><small>${escapeHtml(entry.moderatorUserId)}</small></a>`
                                                : '<span class="muted-value">Automated system</span>'}
                                        </td>
                                        <td><strong class="audit-activity">${escapeHtml(entry.activity)}</strong></td>
                                        <td><a class="subject-link" href="/moderation/radar/${encodeURIComponent(entry.subjectUserId)}"><strong>${escapeHtml(entry.subjectDisplayName || entry.subjectUsername || entry.subjectUserId)}</strong><small>${escapeHtml(entry.subjectUserId)}</small></a></td>
                                        <td class="mod-reason">${escapeHtml(entry.details)}</td>
                                        <td class="nowrap">${formatDate(entry.createdAt, true)}</td>
                                    </tr>`).join('')}</tbody>
                            </table>
                        </div>`
                        : '<div class="mod-empty">No moderator activity has been recorded.</div>'
                }
                ${paginationMarkup(data)}`;
            bindPagination(target, data, load);
            renderModeratorIcons(target);
        } catch (error) {
            target.innerHTML = `<div class="mod-empty error-copy">${escapeHtml(error instanceof Error ? error.message : 'Could not load moderator activity.')}</div>`;
        }
    };
    await load();
}

async function renderActionsDatabase(): Promise<void> {
    const user = await loadUser();
    moderationShell(user, 'actions', 'Actions DB', 'Search every moderation action by ID, user, or reason.', `
        <section class="database-search">
            <form class="mod-search-form" id="actions-search">
                <input id="actions-query" type="search" placeholder="Action ID, user ID, username, or reason" autocomplete="off" />
                <button class="button" type="submit">Search database</button>
            </form>
        </section>
        <section class="mod-panel" id="actions-results"><div class="loading-inline"><span class="spinner"></span>Loading actions…</div></section>
    `);
    const load = async (page = 1, limit: 10 | 25 = 10) => {
        const query = document.querySelector<HTMLInputElement>('#actions-query')!.value.trim();
        const target = document.querySelector<HTMLElement>('#actions-results')!;
        target.innerHTML = `<div class="loading-inline"><span class="spinner"></span>Querying actions…</div>`;
        try {
            const data = await fetchJson<Paginated<ModeratorAction>>(
                `/api/moderation/actions?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
            );
            target.innerHTML = `
                <div class="mod-panel-heading"><div><p class="eyebrow">Database results</p><h2>Actions</h2></div><span>${data.total} found</span></div>
                ${moderatorActionRows(data.items)}
                ${paginationMarkup(data)}`;
            bindPagination(target, data, load);
            renderModeratorIcons(target);
        } catch (error) {
            target.innerHTML = `<div class="mod-empty error-copy">${escapeHtml(error instanceof Error ? error.message : 'Search failed.')}</div>`;
        }
    };
    document.querySelector<HTMLFormElement>('#actions-search')?.addEventListener('submit', (event) => {
        event.preventDefault();
        void load(1, 10);
    });
    await load();
}

async function renderModeratorAction(actionId: string): Promise<void> {
    const [user, data] = await Promise.all([
        loadUser(),
        fetchJson<{
            action: ModeratorAction;
            audits: Array<{ id: string; label: string; oldValue: string | null; newValue: string | null; rationale: string; moderatorUserId: string; createdAt: string }>;
            appeals: Array<{ id: string; status: AppealStatus; submittedAt: string; reviewStartedAt: string | null; decidedAt: string | null }>;
        }>(`/api/moderation/actions/${encodeURIComponent(actionId)}`),
    ]);
    const action = data.action;
    const currentProfile = await fetchJson<DiscordMemberProfile>(
        `/api/moderation/tools/member/${encodeURIComponent(action.subjectUserId)}`,
    ).catch(() => null);
    const moderatorProfile = action.moderatorUserId
        ? await fetchJson<DiscordMemberProfile>(
              `/api/moderation/tools/member/${encodeURIComponent(action.moderatorUserId)}`,
          ).catch(() => null)
        : null;
    const subjectDisplayName = currentProfile?.displayName || action.subjectDisplayName || action.subjectUsername || action.subjectUserId;
    const subjectUsername = currentProfile?.username || action.subjectUsername || action.subjectUserId;
    const subjectRoles = currentProfile?.isMember && currentProfile.roles.length
        ? currentProfile.roles.map((role) => {
              const color = role.color > 0 && role.color <= 0xFFFFFF
                  ? `#${role.color.toString(16).padStart(6, '0')}`
                  : '#747b87';
              return `<span class="discord-role" style="--role-color: ${color}">${escapeHtml(role.name)}</span>`;
          }).join('')
        : '<span class="discord-role empty">Not in server</span>';
    const moderatorDisplayName = moderatorProfile?.displayName || action.moderatorDisplayName || 'Automated system';
    const moderatorUsername = moderatorProfile?.username || action.moderatorUsername || action.moderatorUserId || 'system';
    const moderatorName = escapeHtml(moderatorDisplayName);
    const moderatorMarkup = action.moderatorUserId
        ? `<a href="/moderation/radar/${encodeURIComponent(action.moderatorUserId)}">${moderatorName}</a>`
        : moderatorName;
    const auditModeratorIds = [...new Set(data.audits.map((audit) => audit.moderatorUserId).filter(Boolean))];
    const auditModeratorProfiles = new Map<string, DiscordMemberProfile>();
    await Promise.all(auditModeratorIds.map(async (id) => {
        const profile = await fetchJson<DiscordMemberProfile>(`/api/moderation/tools/member/${encodeURIComponent(id)}`).catch(() => null);
        if (profile) auditModeratorProfiles.set(id, profile);
    }));
    const auditPreview = (value: string | null): string => {
        const words = (value || '').trim().split(/\s+/).filter(Boolean);
        return words.length ? words.slice(0, 8).join(' ') + (words.length > 8 ? '…' : '') : 'Cleared';
    };
    const appealActivity = data.appeals.flatMap((appeal) => [
        { label: 'Appeal submitted', at: appeal.submittedAt, detail: `Appeal ${appeal.id}`, moderatorUserId: null },
        ...(appeal.reviewStartedAt
            ? [{ label: 'Appeal entered review', at: appeal.reviewStartedAt, detail: `Appeal ${appeal.id}`, moderatorUserId: null }]
            : []),
        ...(appeal.decidedAt
            ? [{
                  label: appeal.status === 'approved' ? 'Appeal approved' : 'Appeal denied',
                  at: appeal.decidedAt,
                  detail: `Appeal ${appeal.id}`,
                  moderatorUserId: null,
              }]
            : []),
    ]);
    const activity = [
        { label: 'Action created', at: action.createdAt, detail: null as string | null, moderatorUserId: null as string | null },
        ...data.audits.map((audit) => ({
            label: audit.label.toLowerCase().includes('note') ? `New note: ${auditPreview(audit.newValue)}` : audit.label,
            at: audit.createdAt,
            detail: audit.rationale,
            moderatorUserId: audit.moderatorUserId,
        })),
        ...appealActivity,
    ].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
    const timelinePageSize = window.matchMedia('(max-width: 700px)').matches ? 7 : 10;
    const timelineMarkup = (page: number): string => {
        const pages = Math.max(1, Math.ceil(activity.length / timelinePageSize));
        const currentPage = Math.min(Math.max(page, 1), pages);
        const items = activity.slice((currentPage - 1) * timelinePageSize, currentPage * timelinePageSize);
        const firstVisible = activity.length ? (currentPage - 1) * timelinePageSize + 1 : 0;
        const lastVisible = Math.min(currentPage * timelinePageSize, activity.length);
        const pageSummary = pages > 1 ? `Visible: ${firstVisible}-${lastVisible} (Total: ${activity.length})` : `Total: ${activity.length}`;
        const pageButtons = pages > 1
            ? Array.from({ length: pages }, (_, index) => index + 1)
                  .map((value) => `<button type="button" class="${value === currentPage ? 'active' : ''}" data-timeline-page="${value}">${value}</button>`)
                  .join('')
            : '';
        const preview = (value: string): string => {
            const words = value.trim().split(/\s+/);
            return escapeHtml(words.slice(0, 8).join(' ') + (words.length > 8 ? '…' : ''));
        };
        return `
            <div class="timeline-list">
                ${items.map((item) => `<div class="timeline-item${item.label === 'Action created' ? ' created' : ''}"><i></i><div><strong>${escapeHtml(item.label)}</strong><small>${formatDate(item.at, true)}</small>${item.detail ? `<p>${preview(item.detail)}</p>` : ''}${item.moderatorUserId ? `<p class="timeline-moderator">Moderator: ${escapeHtml(auditModeratorProfiles.get(item.moderatorUserId)?.displayName || 'Unknown')} (@${escapeHtml(auditModeratorProfiles.get(item.moderatorUserId)?.username || item.moderatorUserId)} - ${escapeHtml(item.moderatorUserId)})</p>` : ''}</div>${item.detail ? `<button class="timeline-detail-button" type="button" data-timeline-detail="${activity.indexOf(item)}" aria-label="View full details" title="View full details">${moderatorIcon('eye')}</button>` : ''}</div>`).join('')}
            </div>
            <footer class="timeline-pagination"><span>${pageSummary}</span><div>${pageButtons}</div></footer>`;
    };
    moderationShell(user, 'actions', `Action ${action.actionId}`, '', `
        <article class="mod-panel action-user-card">
            <div class="action-user-layout">
                <a class="action-user-avatar action-user-avatar-link" href="/moderation/radar/${encodeURIComponent(action.subjectUserId)}" aria-label="Open user radar profile">
                    ${currentProfile?.avatarUrl ? `<img src="${escapeHtml(currentProfile.avatarUrl)}" alt="" />` : '<span class="action-user-avatar-fallback">?</span>'}
                </a>
                <div class="action-user-content">
                    <h2>${escapeHtml(subjectDisplayName)}</h2>
                    <span class="action-user-username">@${escapeHtml(subjectUsername)}</span>
                    <a class="action-user-profile-link" href="/moderation/radar/${encodeURIComponent(action.subjectUserId)}" aria-label="Open user radar profile" title="Open user radar profile">${moderatorIcon('radar')}</a>
                    <code class="action-user-id">${escapeHtml(action.subjectUserId)}</code>
                </div>
                <div class="action-user-roles"><span class="eyebrow">Server roles</span><div class="role-cloud">${subjectRoles}</div></div>
            </div>
        </article>
        <section class="mod-panel action-quick-actions">
            <button type="button" class="button secondary quick-action-edit" data-action-scroll="action-record">Edit Data</button>
            <button type="button" class="button secondary quick-action-note" data-quick-private-note>Quick Private Note</button>
            <button type="button" class="button secondary quick-action-revoke" data-action-scroll="action-record">Revoke</button>
            <a class="button secondary quick-action-appeals" href="/moderation/actions/${encodeURIComponent(action.actionId)}/appeals">Appeals</a>
        </section>
        <section class="action-inspector-grid">
            <article class="mod-panel inspector-summary" id="action-record">
                <div class="mod-panel-heading action-record-heading"><p class="eyebrow">Action record</p>${action.modThreadUrl ? `<a href="${escapeHtml(action.modThreadUrl)}" target="_blank" rel="noopener noreferrer">Discord discussion thread ↗</a>` : ''}</div>
                <div class="action-record-status">
                    <div><p class="eyebrow action-record-type-label">Action Type</p><h2 class="action-record-title">${kindMarkup(action.kind)}</h2></div>
                    <div>${statusMarkup(action)}</div>
                </div>
                <dl class="profile-facts">
                    <div><dt>Moderator</dt><dd>${moderatorMarkup} (@${escapeHtml(moderatorUsername)} - ${escapeHtml(action.moderatorUserId || 'system')})</dd></div>
                    <div><dt>Issued</dt><dd>${formatDate(action.createdAt, true)}</dd></div>
                    <div><dt>Expires</dt><dd>${action.expiresAt ? formatDate(action.expiresAt, true) : 'Never'}</dd></div>
                    <div><dt>Appeals</dt><dd>${data.appeals.length}</dd></div>
                </dl>
                <div class="inspector-reason" id="private-note"><span>Private note</span><p>${action.privateNote ? escapeHtml(action.privateNote) : '<span class="muted-value">No private note</span>'}</p></div>
                <div class="inspector-reason"><span>Reason</span><p>${escapeHtml(action.reason)}</p></div>
            </article>
            <article class="mod-panel activity-timeline">
                <div class="mod-panel-heading action-record-heading"><p class="eyebrow">Timeline</p></div>
                <div id="action-timeline">${timelineMarkup(1)}</div>
            </article>
        </section>
    `, '<a class="back-link header-back-link" href="/moderation/actions">← Actions database</a>');
    document.querySelectorAll<HTMLAnchorElement>('.action-user-avatar-link, .action-user-profile-link').forEach((link) => {
        link.addEventListener('click', (event) => {
            if (event.button !== 0) event.preventDefault();
        });
    });
    document.querySelector<HTMLButtonElement>('[data-quick-private-note]')?.addEventListener('click', () => {
        const close = () => { modalRoot.innerHTML = ''; };
        modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal action-edit-modal quick-private-note-modal" role="dialog" aria-modal="true" aria-labelledby="quick-private-note-title"><button class="modal-close" type="button" aria-label="Close">${moderatorIcon('x')}</button><p class="eyebrow">Quick action</p><h2 id="quick-private-note-title">Quick private note</h2><p class="edit-step-help">Only visible to moderators.</p><button type="button" class="edit-inject-button" data-note-inject>Inject existing value</button><textarea id="quick-private-note" rows="5" maxlength="500" autofocus></textarea><footer><button type="button" class="button secondary" data-note-cancel>Cancel</button><button type="button" class="button" data-note-save>Save note</button></footer></section></div>`;
        renderModeratorIcons(modalRoot);
        modalRoot.querySelectorAll<HTMLButtonElement>('.modal-close, [data-note-cancel]').forEach((button) => button.addEventListener('click', close));
        modalRoot.querySelector<HTMLButtonElement>('[data-note-inject]')?.addEventListener('click', () => {
            const textarea = modalRoot.querySelector<HTMLTextAreaElement>('#quick-private-note');
            if (textarea) textarea.value = action.privateNote || '';
        });
        modalRoot.querySelector<HTMLButtonElement>('[data-note-save]')?.addEventListener('click', async (event) => {
            const button = event.currentTarget as HTMLButtonElement;
            const note = modalRoot.querySelector<HTMLTextAreaElement>('#quick-private-note')?.value.trim() || '';
            button.disabled = true;
            try {
                await fetchJson(`/api/moderation/actions/${encodeURIComponent(action.actionId)}/private-note`, {
                    method: 'PUT',
                    body: JSON.stringify({ note }),
                });
                close();
                toast('Private note saved.', 'success');
                await renderModeratorAction(actionId);
            } catch (error) {
                toast(error instanceof Error ? error.message : 'Could not save the private note.', 'danger');
                button.disabled = false;
            }
        });
    });
    document.querySelector<HTMLButtonElement>('.quick-action-edit')?.addEventListener('click', () => {
        type EditField = 'reason' | 'private-note' | 'duration' | 'expiration';
        const labels: Record<EditField, string> = { reason: 'Reason', 'private-note': 'Private note', duration: 'Duration', expiration: 'Expiration' };
        const descriptions: Record<EditField, string> = { reason: 'Visible to the user', 'private-note': 'Visible to moderators only', duration: 'Actual moderation duration', expiration: 'ATC record visibility' };
        const icons: Record<EditField, string> = { reason: 'clipboard-list', 'private-note': 'pencil-line', duration: 'hourglass', expiration: 'calendar-days' };
        const durationAllowed = action.kind === 'ban' || action.kind === 'timeout';
        let step = 1;
        let field: EditField | null = null;
        let value = '';
        let rationale = '';
        let notification: 'no' | 'silent-edit' | 'notify' = 'notify';
        let modal: HTMLElement | null = null;
        const rationaleRequired = () => field !== 'private-note';
        const close = () => { modalRoot.innerHTML = ''; modal = null; };
        const render = () => {
            const body = step === 1
                ? `<p class="eyebrow">Step 1 of 5</p><h2 id="action-edit-title">What do you want to edit?</h2><div class="edit-field-grid">${(Object.keys(labels) as EditField[]).map((key) => { const disabled = key === 'duration' && !durationAllowed; return `<button type="button" class="button secondary edit-field-button${disabled ? ' is-disabled' : ''}" data-edit-field="${key}"${disabled ? ' disabled' : ''}>${moderatorIcon(icons[key])}<span>${labels[key]}</span><small>${disabled ? 'Not applicable' : descriptions[key]}</small></button>`; }).join('')}</div>`
                : step === 2
                  ? `<p class="eyebrow">Step 2 of 5 · ${labels[field!]}</p><h2>Enter the new value <span class="required-mark" aria-hidden="true">*</span></h2><p class="edit-step-help">${descriptions[field!]}</p>${field === 'reason' || field === 'private-note' ? '<button type="button" class="edit-inject-button" data-edit-inject>Inject existing value</button>' : ''}<textarea id="edit-value" rows="5" required autofocus>${escapeHtml(value)}</textarea><footer><button type="button" class="button secondary" data-edit-back>Back</button><button type="button" class="button" data-edit-next>Confirm value</button></footer>`
                  : step === 3
                  ? `<p class="eyebrow">Step 3 of 5</p><h2>Why is this being changed?${rationaleRequired() ? ' <span class="required-mark" aria-hidden="true">*</span>' : ''}</h2><p class="edit-step-help">${rationaleRequired() ? 'A reason is required for this edit.' : 'Optional for private notes.'}</p><textarea id="edit-rationale" rows="4"${rationaleRequired() ? ' required' : ''} autofocus>${escapeHtml(rationale)}</textarea><footer><button type="button" class="button secondary" data-edit-back>Back</button><button type="button" class="button" data-edit-next>Confirm reason</button></footer>`
                  : step === 4
                    ? `<p class="eyebrow">Step 4 of 5</p><h2>Notification</h2><p class="edit-step-help">Should the user be notified about this edit?</p><div class="edit-notification-options">${[['notify', 'Yes (attempt to send a new DM)'], ['silent-edit', 'Silently edit original DM message'], ['no', 'No notification']].map(([key, label]) => `<button type="button" class="button secondary ${notification === key ? 'selected' : ''}" data-edit-notification="${key}">${label}</button>`).join('')}</div><footer><button type="button" class="button secondary" data-edit-back>Back</button><button type="button" class="button" data-edit-next>Continue</button></footer>`
                    : `<p class="eyebrow">Step 5 of 5 · Review</p><h2>Review edit</h2><dl class="edit-review"><div><dt>Field</dt><dd>${labels[field!]}</dd></div><div><dt>New value</dt><dd>${escapeHtml(value)}</dd></div><div><dt>Reason</dt><dd>${escapeHtml(rationale)}</dd></div>${field === 'private-note' || field === 'expiration' ? '' : `<div><dt>Notification</dt><dd>${notification === 'notify' ? 'Notify user' : notification === 'silent-edit' ? 'Silent edit' : 'No notification'}</dd></div>`}</dl><footer><button type="button" class="button secondary" data-edit-back>Back</button><button type="button" class="button" data-edit-submit>Submit edit</button></footer>`;
            if (!modal) {
                modalRoot.innerHTML = '<div class="modal-backdrop"><section class="modal action-edit-modal" role="dialog" aria-modal="true" aria-labelledby="action-edit-title"></section></div>';
                modal = modalRoot.querySelector<HTMLElement>('.action-edit-modal');
            }
            if (!modal) return;
            modal.innerHTML = `<button class="modal-close" type="button" aria-label="Close">${moderatorIcon('x')}</button>${body}`;
            renderModeratorIcons(modalRoot);
            modalRoot.querySelector<HTMLButtonElement>('.modal-close')?.addEventListener('click', close);
            modalRoot.querySelectorAll<HTMLButtonElement>('[data-edit-field]').forEach((button) => button.addEventListener('click', () => { field = button.dataset.editField as EditField; notification = field === 'private-note' || field === 'expiration' ? 'no' : 'notify'; step = 2; render(); }));
            modalRoot.querySelector<HTMLButtonElement>('[data-edit-back]')?.addEventListener('click', () => { step = step === 5 && (field === 'private-note' || field === 'expiration') ? 3 : step - 1; render(); });
            modalRoot.querySelector<HTMLButtonElement>('[data-edit-inject]')?.addEventListener('click', () => { value = field === 'reason' ? action.reason : action.privateNote || ''; const textarea = modalRoot.querySelector<HTMLTextAreaElement>('#edit-value'); if (textarea) textarea.value = value; });
            modalRoot.querySelectorAll<HTMLButtonElement>('[data-edit-notification]').forEach((button) => button.addEventListener('click', () => { notification = button.dataset.editNotification as typeof notification; modalRoot.querySelectorAll('[data-edit-notification]').forEach((item) => item.classList.toggle('selected', item === button)); }));
            modalRoot.querySelector<HTMLButtonElement>('[data-edit-next]')?.addEventListener('click', () => { if (step === 2) value = modalRoot.querySelector<HTMLTextAreaElement>('#edit-value')?.value.trim() || ''; else if (step === 3) rationale = modalRoot.querySelector<HTMLTextAreaElement>('#edit-rationale')?.value.trim() || ''; if ((step === 2 && !value) || (step === 3 && rationaleRequired() && !rationale)) return; step = step === 3 && (field === 'private-note' || field === 'expiration') ? 5 : step + 1; render(); });
            modalRoot.querySelector<HTMLButtonElement>('[data-edit-submit]')?.addEventListener('click', async (event) => {
                const button = event.currentTarget as HTMLButtonElement;
                button.disabled = true;
                try {
                    await fetchJson(`/api/moderation/actions/${encodeURIComponent(action.actionId)}/edit`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            kind: field === 'private-note' ? 'note' : field,
                            newValue: value,
                            rationale,
                            notificationMode: field === 'private-note' || field === 'expiration' ? 'no' : notification,
                        }),
                    });
                    close();
                    toast('Action updated.', 'success');
                    await renderModeratorAction(actionId);
                } catch (error) {
                    toast(error instanceof Error ? error.message : 'Could not update the action.', 'danger');
                    button.disabled = false;
                }
            });
        };
        render();
    });
    document.querySelectorAll<HTMLElement>('[data-action-scroll]').forEach((button) => {
        button.addEventListener('click', () => document.getElementById(button.dataset.actionScroll || '')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
    const timeline = document.querySelector<HTMLElement>('#action-timeline');
    timeline?.addEventListener('click', (event) => {
        const detailButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-timeline-detail]');
        if (detailButton) {
            const item = activity[Number(detailButton.dataset.timelineDetail)];
            if (!item) return;
            modalRoot.innerHTML = `<div class="modal-backdrop timeline-detail-backdrop"><section class="modal timeline-detail-modal" role="dialog" aria-modal="true"><button class="modal-close" type="button" aria-label="Close">${moderatorIcon('x')}</button><p class="eyebrow">${escapeHtml(item.label)}</p><h2>Full details</h2><p class="timeline-detail-full">${escapeHtml(item.detail || '')}</p>${item.moderatorUserId ? `<p class="timeline-detail-moderator">Moderator: ${escapeHtml(auditModeratorProfiles.get(item.moderatorUserId)?.displayName || 'Unknown')} (@${escapeHtml(auditModeratorProfiles.get(item.moderatorUserId)?.username || item.moderatorUserId)} - ${escapeHtml(item.moderatorUserId)})</p>` : ''}</section></div>`;
            modalRoot.querySelector<HTMLButtonElement>('.modal-close')?.addEventListener('click', () => { modalRoot.innerHTML = ''; });
            renderModeratorIcons(modalRoot);
            return;
        }
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-timeline-page]');
        if (!button || !timeline) return;
        timeline.innerHTML = timelineMarkup(Number(button.dataset.timelinePage));
    });
}

async function renderModeratorAppeals(actionId: string): Promise<void> {
    const [user, data] = await Promise.all([
        loadUser(),
        fetchJson<{ action: ModeratorAction; appeals: Array<{ id: string; status: AppealStatus; submittedAt: string; reviewStartedAt: string | null; decidedAt: string | null }> }>(
            `/api/moderation/actions/${encodeURIComponent(actionId)}`,
        ),
    ]);
    moderationShell(user, 'actions', `Appeals · ${data.action.actionId}`, '', `
        <section class="mod-panel appeals-panel">
            <div class="mod-panel-heading action-record-heading"><p class="eyebrow">Appeals</p><a href="/moderation/actions/${encodeURIComponent(data.action.actionId)}">← Action record</a></div>
            ${data.appeals.length ? `<div class="mod-table-wrap"><table class="mod-table"><thead><tr><th>Appeal ID</th><th>Status</th><th>Submitted</th><th>Review started</th><th>Decided</th></tr></thead><tbody>${data.appeals.map((appeal) => `<tr><td><code>${escapeHtml(appeal.id)}</code></td><td>${appealStatusMarkup(appeal.status)}</td><td>${formatDate(appeal.submittedAt, true)}</td><td>${appeal.reviewStartedAt ? formatDate(appeal.reviewStartedAt, true) : '—'}</td><td>${appeal.decidedAt ? formatDate(appeal.decidedAt, true) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="mod-empty">No appeals have been submitted for this action.</div>'}
        </section>
    `, '<a class="back-link header-back-link" href="/moderation/actions">← Actions database</a>');
}

function toolCard(id: string, title: string, eyebrow: string, body: string): string {
    return `<article class="tool-card tool-panel" data-tool-panel="${escapeHtml(id)}" ${id === 'send' ? '' : 'hidden'}>
        <p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2>${body}
    </article>`;
}

function localDateTimeValue(timestamp: number): string {
    const date = new Date(timestamp);
    const part = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
}

function parseDiscordMessageUrl(value: string): { channelId: string; messageId: string } | null {
    const match = /^https?:\/\/(?:www\.)?(?:discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/channels\/\d{17,20}\/(\d{17,20})\/(\d{17,20})\/?(?:[?#].*)?$/i.exec(value.trim());
    return match?.[1] && match[2] ? { channelId: match[1], messageId: match[2] } : null;
}

const defaultEmbedColor = '#07a7b9';
const embedColorPalette = [
    '#07a7b9', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ef476f',
    '#f97316', '#eab308', '#22c55e', '#14b8a6', '#64748b', '#111827',
];

function embedFieldMarkup(): string {
    return `<div class="embed-field-row" data-embed-field-row>
        <span class="embed-field-number" data-field-number></span>
        <div class="embed-field-row-inputs">
            <label>Name<input data-field-key="name" maxlength="256" placeholder="Field name" /></label>
            <label>Value<textarea data-field-key="value" maxlength="1024" rows="2" placeholder="Field value"></textarea></label>
        </div>
        <label class="embed-inline-toggle"><input type="checkbox" data-field-key="inline" /> <span>Inline</span></label>
        <button class="embed-remove-button embed-remove-field" type="button" data-remove-field aria-label="Remove field">${moderatorIcon('x')}</button>
    </div>`;
}

function embedCardMarkup(index: number): string {
    return `<article class="embed-card" data-embed-card>
        <header class="embed-card-header">
            <div class="embed-card-heading">
                <span class="embed-card-index" data-embed-index>${String(index + 1).padStart(2, '0')}</span>
                <div><strong data-embed-label>Embed ${index + 1}</strong><small>Rich message block</small></div>
            </div>
            <button class="embed-remove-button" type="button" data-remove-embed aria-label="Remove embed">${moderatorIcon('x')}<span>Remove</span></button>
        </header>
        <div class="embed-card-body">
            <div class="embed-color-field">
                <div><span class="embed-control-label">Accent color</span><small>Optional sidebar color</small></div>
                <div class="embed-color-controls">
                    <button class="embed-color-swatch" type="button" data-toggle-color-picker aria-haspopup="dialog" aria-expanded="false" aria-label="Choose embed accent color">
                        <span class="embed-color-swatch-dot" data-embed-color-swatch></span><span data-embed-color-value>${defaultEmbedColor}</span><span class="embed-color-caret">⌄</span>
                    </button>
                    <button class="embed-clear-color" type="button" data-clear-embed-color>None</button>
                </div>
                <div class="embed-color-popover" data-embed-color-popover role="dialog" aria-label="Embed color picker" hidden>
                    <strong>Choose a color</strong>
                    <div class="embed-color-palette">
                        ${embedColorPalette.map((color) => `<button type="button" data-color-value="${color}" style="--picker-color: ${color}" aria-label="Use ${color}"><span></span></button>`).join('')}
                    </div>
                    <label>Hex<input class="embed-color-text" data-embed-field="color" type="text" value="${defaultEmbedColor}" maxlength="7" placeholder="#07a7b9" spellcheck="false" /></label>
                </div>
            </div>
            <div class="embed-grid-two">
                <label>Title<input data-embed-field="title" maxlength="256" placeholder="Optional title" /></label>
                <label>Title URL<input data-embed-field="url" type="url" maxlength="2048" placeholder="https://…" /></label>
            </div>
            <label>Description<textarea data-embed-field="description" maxlength="4096" rows="4" placeholder="Write the main embed copy…"></textarea></label>

            <details class="embed-disclosure" open>
                <summary><span><strong>Fields</strong><small>Structured name/value rows</small></span><em data-field-count>0 / 25</em></summary>
                <div class="embed-fields-list" data-embed-fields><p class="embed-fields-empty" data-fields-empty>No fields added yet.</p></div>
                <button class="button secondary embed-add-field" type="button" data-add-field>+ Add field</button>
            </details>

            <details class="embed-disclosure">
                <summary><span><strong>Author</strong><small>Attribution line above the title</small></span></summary>
                <div class="embed-grid-two">
                    <label>Name<input data-embed-field="author.name" maxlength="256" placeholder="Author name" /></label>
                    <label>Profile URL<input data-embed-field="author.url" type="url" maxlength="2048" placeholder="https://…" /></label>
                    <label>Icon URL<input data-embed-field="author.icon_url" type="url" maxlength="2048" placeholder="https://…" /></label>
                </div>
            </details>

            <details class="embed-disclosure">
                <summary><span><strong>Media & timestamp</strong><small>Images, thumbnails, and time context</small></span></summary>
                <div class="embed-grid-two">
                    <label>Thumbnail URL<input data-embed-field="thumbnail.url" type="url" maxlength="2048" placeholder="https://…" /></label>
                    <label>Image URL<input data-embed-field="image.url" type="url" maxlength="2048" placeholder="https://…" /></label>
                    <label>Timestamp
                        <div class="embed-date-picker" data-embed-date-picker>
                            <input data-embed-field="timestamp" type="hidden" />
                            <button class="embed-date-trigger" type="button" data-toggle-date-picker aria-haspopup="dialog" aria-expanded="false">
                                ${moderatorIcon('calendar-days')}<span data-embed-date-value>Not set</span>
                            </button>
                            <div class="embed-date-popover" data-embed-date-popover role="dialog" aria-label="Embed timestamp picker" hidden>
                                <div class="embed-date-calendar">
                                    <header><button type="button" data-date-previous aria-label="Previous month">${moderatorIcon('chevron-left')}</button><strong data-date-month></strong><button type="button" data-date-next aria-label="Next month">${moderatorIcon('chevron-right')}</button></header>
                                    <div class="embed-date-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
                                    <div class="embed-date-days" data-date-days></div>
                                </div>
                                <div class="embed-date-time">
                                    <span>Time</span>
                                    <div><input type="number" min="0" max="23" data-date-hour aria-label="Hour" /><i>:</i><input type="number" min="0" max="59" data-date-minute aria-label="Minute" /></div>
                                </div>
                                <footer><button class="button secondary" type="button" data-clear-date>Clear</button><button class="button" type="button" data-apply-date>Apply</button></footer>
                            </div>
                        </div>
                    </label>
                </div>
            </details>

            <details class="embed-disclosure">
                <summary><span><strong>Footer</strong><small>Small closing note and icon</small></span></summary>
                <div class="embed-grid-two">
                    <label>Text<input data-embed-field="footer.text" maxlength="2048" placeholder="Footer text" /></label>
                    <label>Icon URL<input data-embed-field="footer.icon_url" type="url" maxlength="2048" placeholder="https://…" /></label>
                </div>
            </details>
        </div>
    </article>`;
}

function embedBuilderMarkup(): string {
    return `<fieldset class="embed-builder" data-embed-builder>
        <div class="embed-builder-header">
            <div><p class="eyebrow">Embed generator</p><h3>Rich message blocks</h3><p>Compose up to 10 Discord embeds with the full layout toolkit.</p></div>
            <button class="button secondary embed-add-button" type="button" data-add-embed>+ Add embed</button>
        </div>
        <div class="embed-builder-meta"><span data-embed-count>0 / 10 embeds</span><small>Discord limit · 6,000 combined characters</small></div>
        <div class="embed-list" data-embed-list><p class="embed-list-empty" data-embed-list-empty>No embeds added yet. Use “Add embed” to start building.</p></div>
        <p class="embed-builder-hint">Blank cards are ignored. Content can be sent on its own, or alongside any number of embeds.</p>
    </fieldset>`;
}

function embedListEmptyMarkup(): string {
    return '<p class="embed-list-empty" data-embed-list-empty>No embeds added yet. Use “Add embed” to start building.</p>';
}

function inputValue(root: HTMLElement, key: string): string {
    return root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-embed-field="${key}"]`)?.value.trim() || '';
}

function normalizeEmbedColor(value: string): string {
    if (!value) return '';
    const normalized = value.startsWith('#') ? value : `#${value}`;
    return /^#[\da-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : normalized;
}

function colorHex(value: string | number | undefined): string {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
        return `#${value.toString(16).padStart(6, '0')}`;
    }
    const normalized = normalizeEmbedColor(typeof value === 'string' ? value : '');
    return /^#[\da-f]{6}$/i.test(normalized) ? normalized : defaultEmbedColor;
}

function serializeModerationEmbeds(builder: HTMLElement): ModerationEmbed[] {
    return [...builder.querySelectorAll<HTMLElement>('[data-embed-card]')].flatMap((card, embedIndex) => {
        const title = inputValue(card, 'title');
        const url = inputValue(card, 'url');
        const description = inputValue(card, 'description');
        const color = normalizeEmbedColor(inputValue(card, 'color'));
        const timestampInput = inputValue(card, 'timestamp');
        const authorName = inputValue(card, 'author.name');
        const authorUrl = inputValue(card, 'author.url');
        const authorIcon = inputValue(card, 'author.icon_url');
        const footerText = inputValue(card, 'footer.text');
        const footerIcon = inputValue(card, 'footer.icon_url');
        const thumbnailUrl = inputValue(card, 'thumbnail.url');
        const imageUrl = inputValue(card, 'image.url');
        const fieldValues = [...card.querySelectorAll<HTMLElement>('[data-embed-field-row]')].flatMap((row, fieldIndex) => {
            const name = row.querySelector<HTMLInputElement>('[data-field-key="name"]')?.value.trim() || '';
            const value = row.querySelector<HTMLTextAreaElement>('[data-field-key="value"]')?.value.trim() || '';
            if (!name && !value) return [];
            if (!name || !value) throw new Error(`Embed ${embedIndex + 1} field ${fieldIndex + 1} needs both a name and a value.`);
            return [{
                name,
                value,
                inline: Boolean(row.querySelector<HTMLInputElement>('[data-field-key="inline"]')?.checked),
            }];
        });
        if (fieldValues.length > 25) throw new Error(`Embed ${embedIndex + 1} can contain up to 25 fields.`);
        if (color && !/^#[\da-f]{6}$/i.test(color)) throw new Error(`Embed ${embedIndex + 1} accent color must be a six-digit hex value.`);

        let timestamp = '';
        if (timestampInput) {
            const parsed = new Date(timestampInput);
            if (!Number.isFinite(parsed.getTime())) throw new Error(`Embed ${embedIndex + 1} timestamp is invalid.`);
            timestamp = parsed.toISOString();
        }
        const author = authorName
            ? { name: authorName, ...(authorUrl ? { url: authorUrl } : {}), ...(authorIcon ? { icon_url: authorIcon } : {}) }
            : authorUrl || authorIcon
                ? (() => { throw new Error(`Embed ${embedIndex + 1} author name is required.`); })()
                : undefined;
        const footer = footerText
            ? { text: footerText, ...(footerIcon ? { icon_url: footerIcon } : {}) }
            : footerIcon
                ? (() => { throw new Error(`Embed ${embedIndex + 1} footer text is required.`); })()
                : undefined;
        const hasContent = Boolean(title || description || fieldValues.length || author || footer || thumbnailUrl || imageUrl);
        const hasOptionalInput = Boolean(url || timestamp || authorUrl || authorIcon || footerIcon || thumbnailUrl || imageUrl || fieldValues.length);
        if (!hasContent && hasOptionalInput) {
            throw new Error(`Embed ${embedIndex + 1} needs a title, description, field, author, footer, image, or thumbnail.`);
        }
        if (!hasContent) return [];
        return [{
            ...(title ? { title } : {}),
            ...(url ? { url } : {}),
            ...(description ? { description } : {}),
            ...(color ? { color } : {}),
            ...(timestamp ? { timestamp } : {}),
            ...(author ? { author } : {}),
            ...(footer ? { footer } : {}),
            ...(thumbnailUrl ? { thumbnail: { url: thumbnailUrl } } : {}),
            ...(imageUrl ? { image: { url: imageUrl } } : {}),
            ...(fieldValues.length ? { fields: fieldValues } : {}),
        }];
    });
}

function setupEmbedBuilder(form: HTMLFormElement | null): EmbedBuilderController | null {
    const builder = form?.querySelector<HTMLElement>('[data-embed-builder]');
    const list = builder?.querySelector<HTMLElement>('[data-embed-list]');
    if (!builder || !list) return null;

    const closeColorPopovers = () => {
        for (const popover of builder.querySelectorAll<HTMLElement>('[data-embed-color-popover]')) {
            popover.hidden = true;
            popover.closest<HTMLElement>('.embed-color-field')?.classList.remove('color-open');
        }
        for (const trigger of builder.querySelectorAll<HTMLButtonElement>('[data-toggle-color-picker]')) {
            trigger.setAttribute('aria-expanded', 'false');
        }
    };
    const closeDatePickers = () => {
        for (const popover of builder.querySelectorAll<HTMLElement>('[data-embed-date-popover]')) {
            popover.hidden = true;
            popover.closest<HTMLElement>('[data-embed-date-picker]')?.classList.remove('date-open');
        }
        for (const trigger of builder.querySelectorAll<HTMLButtonElement>('[data-toggle-date-picker]')) {
            trigger.setAttribute('aria-expanded', 'false');
        }
    };
    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        return Number.isFinite(date.getTime())
            ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
            : 'Not set';
    };
    const syncColorPicker = (card: HTMLElement) => {
        const input = card.querySelector<HTMLInputElement>('[data-embed-field="color"]');
        const swatch = card.querySelector<HTMLElement>('[data-embed-color-swatch]');
        const value = card.querySelector<HTMLElement>('[data-embed-color-value]');
        const normalized = normalizeEmbedColor(input?.value.trim() || '');
        const valid = /^#[\da-f]{6}$/i.test(normalized);
        swatch?.style.setProperty('--embed-color', valid ? normalized : defaultEmbedColor);
        swatch?.classList.toggle('empty', !valid);
        if (value) value.textContent = valid ? normalized : input?.value ? 'Invalid' : 'None';
        if (swatch) swatch.setAttribute('aria-label', valid ? `Embed color ${normalized}` : 'No embed accent color');
    };
    const syncDatePicker = (card: HTMLElement) => {
        const input = card.querySelector<HTMLInputElement>('[data-embed-field="timestamp"]');
        const display = card.querySelector<HTMLElement>('[data-embed-date-value]');
        if (display) display.textContent = input?.value ? formatTimestamp(input.value) : 'Not set';
    };
    const draftForPicker = (picker: HTMLElement): Date => {
        const draft = picker.dataset.draftTimestamp ? new Date(picker.dataset.draftTimestamp) : new Date();
        return Number.isFinite(draft.getTime()) ? draft : new Date();
    };
    const monthForPicker = (picker: HTMLElement): Date => {
        const year = Number(picker.dataset.dateYear);
        const month = Number(picker.dataset.dateMonth);
        return Number.isInteger(year) && Number.isInteger(month) ? new Date(year, month, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    };
    const renderDatePicker = (picker: HTMLElement, draft: Date, month: Date) => {
        const monthLabel = picker.querySelector<HTMLElement>('[data-date-month]');
        const days = picker.querySelector<HTMLElement>('[data-date-days]');
        if (!monthLabel || !days) return;
        picker.dataset.dateYear = String(month.getFullYear());
        picker.dataset.dateMonth = String(month.getMonth());
        monthLabel.textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month);
        const start = new Date(month.getFullYear(), month.getMonth(), 1);
        start.setDate(1 - start.getDay());
        const today = new Date();
        const buttons: string[] = [];
        for (let index = 0; index < 42; index += 1) {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const outside = date.getMonth() !== month.getMonth();
            const todayClass = date.toDateString() === today.toDateString();
            const selected = date.toDateString() === draft.toDateString();
            buttons.push(`<button type="button" data-date-value="${value}" class="${outside ? 'outside ' : ''}${todayClass ? 'today ' : ''}${selected ? 'selected' : ''}" aria-label="${escapeHtml(new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(date))}" aria-pressed="${selected}">${date.getDate()}</button>`);
        }
        days.innerHTML = buttons.join('');
    };
    const openDatePicker = (card: HTMLElement) => {
        const picker = card.querySelector<HTMLElement>('[data-embed-date-picker]');
        const input = card.querySelector<HTMLInputElement>('[data-embed-field="timestamp"]');
        if (!picker || !input) return;
        closeDatePickers();
        closeColorPopovers();
        const existing = input.value ? new Date(input.value) : new Date();
        const draft = Number.isFinite(existing.getTime()) ? existing : new Date();
        picker.dataset.draftTimestamp = draft.toISOString();
        const hour = picker.querySelector<HTMLInputElement>('[data-date-hour]');
        const minute = picker.querySelector<HTMLInputElement>('[data-date-minute]');
        if (hour) hour.value = String(draft.getHours()).padStart(2, '0');
        if (minute) minute.value = String(draft.getMinutes()).padStart(2, '0');
        renderDatePicker(picker, draft, new Date(draft.getFullYear(), draft.getMonth(), 1));
        picker.querySelector<HTMLElement>('[data-embed-date-popover]')!.hidden = false;
        picker.classList.add('date-open');
        picker.querySelector<HTMLButtonElement>('[data-toggle-date-picker]')!.setAttribute('aria-expanded', 'true');
    };
    const updateBuilder = () => {
        const cards = [...list.querySelectorAll<HTMLElement>('[data-embed-card]')];
        const count = builder.querySelector<HTMLElement>('[data-embed-count]');
        const addEmbed = builder.querySelector<HTMLButtonElement>('[data-add-embed]');
        if (count) count.textContent = `${cards.length} / 10 embeds`;
        if (addEmbed) addEmbed.disabled = cards.length >= 10;
        for (const [index, card] of cards.entries()) {
            card.querySelector<HTMLElement>('[data-embed-index]')!.textContent = String(index + 1).padStart(2, '0');
            card.querySelector<HTMLElement>('[data-embed-label]')!.textContent = `Embed ${index + 1}`;
            const fieldRows = card.querySelectorAll('[data-embed-field-row]');
            const fieldCount = card.querySelector<HTMLElement>('[data-field-count]');
            const addField = card.querySelector<HTMLButtonElement>('[data-add-field]');
            const empty = card.querySelector<HTMLElement>('[data-fields-empty]');
            if (fieldCount) fieldCount.textContent = `${fieldRows.length} / 25`;
            if (addField) addField.disabled = fieldRows.length >= 25;
            if (empty) empty.hidden = fieldRows.length > 0;
            [...fieldRows].forEach((row, fieldIndex) => {
                row.querySelector<HTMLElement>('[data-field-number]')!.textContent = String(fieldIndex + 1).padStart(2, '0');
            });
            syncColorPicker(card);
            syncDatePicker(card);
        }
    };
    const load = (embeds: ModerationEmbed[]) => {
        list.innerHTML = embeds.length ? embeds.map((_, index) => embedCardMarkup(index)).join('') : embedListEmptyMarkup();
        const cards = [...list.querySelectorAll<HTMLElement>('[data-embed-card]')];
        embeds.forEach((embed, index) => {
            const card = cards[index];
            if (!card) return;
            const embedTimestamp = embed.timestamp ? new Date(embed.timestamp) : null;
            const values: Array<[string, string]> = [
                ['title', embed.title || ''],
                ['url', embed.url || ''],
                ['description', embed.description || ''],
                ['color', embed.color === undefined ? '' : colorHex(embed.color)],
                ['timestamp', embedTimestamp && Number.isFinite(embedTimestamp.getTime()) ? embedTimestamp.toISOString() : ''],
                ['author.name', embed.author?.name || ''],
                ['author.url', embed.author?.url || ''],
                ['author.icon_url', embed.author?.icon_url || ''],
                ['footer.text', embed.footer?.text || ''],
                ['footer.icon_url', embed.footer?.icon_url || ''],
                ['thumbnail.url', embed.thumbnail?.url || ''],
                ['image.url', embed.image?.url || ''],
            ];
            for (const [key, value] of values) {
                const field = card.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-embed-field="${key}"]`);
                if (field) field.value = value;
            }
            const fields = card.querySelector<HTMLElement>('[data-embed-fields]');
            if (fields && embed.fields?.length) {
                fields.innerHTML = embed.fields.map(() => embedFieldMarkup()).join('');
                [...fields.querySelectorAll<HTMLElement>('[data-embed-field-row]')].forEach((row, fieldIndex) => {
                    const field = embed.fields?.[fieldIndex];
                    if (!field) return;
                    row.querySelector<HTMLInputElement>('[data-field-key="name"]')!.value = field.name;
                    row.querySelector<HTMLTextAreaElement>('[data-field-key="value"]')!.value = field.value;
                    row.querySelector<HTMLInputElement>('[data-field-key="inline"]')!.checked = field.inline;
                });
            }
        });
        updateBuilder();
        renderModeratorIcons(builder);
    };
    builder.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        const addEmbed = target.closest<HTMLButtonElement>('[data-add-embed]');
        if (addEmbed && list.querySelectorAll('[data-embed-card]').length < 10) {
            list.querySelector<HTMLElement>('[data-embed-list-empty]')?.remove();
            list.insertAdjacentHTML('beforeend', embedCardMarkup(list.querySelectorAll('[data-embed-card]').length));
            updateBuilder();
            renderModeratorIcons(builder);
            return;
        }
        const removeEmbed = target.closest<HTMLButtonElement>('[data-remove-embed]');
        if (removeEmbed) {
            removeEmbed.closest<HTMLElement>('[data-embed-card]')?.remove();
            if (!list.querySelector('[data-embed-card]')) list.innerHTML = embedListEmptyMarkup();
            updateBuilder();
            return;
        }
        const toggleColor = target.closest<HTMLButtonElement>('[data-toggle-color-picker]');
        if (toggleColor) {
            const field = toggleColor.closest<HTMLElement>('.embed-color-field');
            const popover = field?.querySelector<HTMLElement>('[data-embed-color-popover]');
            if (!field || !popover) return;
            const open = popover.hidden;
            closeColorPopovers();
            if (open) {
                popover.hidden = false;
                field.classList.add('color-open');
                toggleColor.setAttribute('aria-expanded', 'true');
                field.querySelector<HTMLInputElement>('[data-embed-field="color"]')?.focus();
            }
            return;
        }
        const paletteColor = target.closest<HTMLButtonElement>('[data-color-value]');
        if (paletteColor?.dataset.colorValue) {
            const card = paletteColor.closest<HTMLElement>('[data-embed-card]');
            const color = card?.querySelector<HTMLInputElement>('[data-embed-field="color"]');
            if (color) color.value = paletteColor.dataset.colorValue;
            if (card) syncColorPicker(card);
            closeColorPopovers();
            return;
        }
        const clearColor = target.closest<HTMLButtonElement>('[data-clear-embed-color]');
        if (clearColor) {
            const card = clearColor.closest<HTMLElement>('[data-embed-card]');
            const color = card?.querySelector<HTMLInputElement>('[data-embed-field="color"]');
            if (color) color.value = '';
            if (card) syncColorPicker(card);
            closeColorPopovers();
            return;
        }
        const toggleDate = target.closest<HTMLButtonElement>('[data-toggle-date-picker]');
        if (toggleDate) {
            const card = toggleDate.closest<HTMLElement>('[data-embed-card]');
            const picker = card?.querySelector<HTMLElement>('[data-embed-date-picker]');
            const popover = picker?.querySelector<HTMLElement>('[data-embed-date-popover]');
            if (card && popover?.hidden) openDatePicker(card);
            else if (picker) closeDatePickers();
            return;
        }
        const previousMonth = target.closest<HTMLButtonElement>('[data-date-previous]');
        const nextMonth = target.closest<HTMLButtonElement>('[data-date-next]');
        if (previousMonth || nextMonth) {
            const picker = (previousMonth || nextMonth)?.closest<HTMLElement>('[data-embed-date-picker]');
            if (!picker) return;
            const month = monthForPicker(picker);
            month.setMonth(month.getMonth() + (previousMonth ? -1 : 1));
            renderDatePicker(picker, draftForPicker(picker), month);
            return;
        }
        const day = target.closest<HTMLButtonElement>('[data-date-value]');
        if (day?.dataset.dateValue) {
            const picker = day.closest<HTMLElement>('[data-embed-date-picker]');
            if (!picker) return;
            const [year, month, date] = day.dataset.dateValue.split('-').map(Number);
            const draft = draftForPicker(picker);
            draft.setFullYear(year!, month! - 1, date);
            picker.dataset.draftTimestamp = draft.toISOString();
            renderDatePicker(picker, draft, new Date(year!, month! - 1, 1));
            return;
        }
        const clearDate = target.closest<HTMLButtonElement>('[data-clear-date]');
        if (clearDate) {
            const card = clearDate.closest<HTMLElement>('[data-embed-card]');
            const input = card?.querySelector<HTMLInputElement>('[data-embed-field="timestamp"]');
            if (input) input.value = '';
            if (card) syncDatePicker(card);
            closeDatePickers();
            return;
        }
        const applyDate = target.closest<HTMLButtonElement>('[data-apply-date]');
        if (applyDate) {
            const picker = applyDate.closest<HTMLElement>('[data-embed-date-picker]');
            const card = applyDate.closest<HTMLElement>('[data-embed-card]');
            if (!picker || !card) return;
            const hour = Number(picker.querySelector<HTMLInputElement>('[data-date-hour]')?.value);
            const minute = Number(picker.querySelector<HTMLInputElement>('[data-date-minute]')?.value);
            const invalidHour = !Number.isInteger(hour) || hour < 0 || hour > 23;
            const invalidMinute = !Number.isInteger(minute) || minute < 0 || minute > 59;
            picker.querySelector<HTMLInputElement>('[data-date-hour]')?.toggleAttribute('aria-invalid', invalidHour);
            picker.querySelector<HTMLInputElement>('[data-date-minute]')?.toggleAttribute('aria-invalid', invalidMinute);
            if (invalidHour || invalidMinute) return;
            const draft = draftForPicker(picker);
            draft.setHours(hour, minute, 0, 0);
            card.querySelector<HTMLInputElement>('[data-embed-field="timestamp"]')!.value = draft.toISOString();
            syncDatePicker(card);
            closeDatePickers();
            return;
        }
        const addField = target.closest<HTMLButtonElement>('[data-add-field]');
        if (addField) {
            const card = addField.closest<HTMLElement>('[data-embed-card]');
            const fields = card?.querySelector<HTMLElement>('[data-embed-fields]');
            if (card && fields && fields.querySelectorAll('[data-embed-field-row]').length < 25) {
                fields.insertAdjacentHTML('beforeend', embedFieldMarkup());
                updateBuilder();
                renderModeratorIcons(builder);
            }
            return;
        }
        const removeField = target.closest<HTMLButtonElement>('[data-remove-field]');
        if (removeField) {
            removeField.closest<HTMLElement>('[data-embed-field-row]')?.remove();
            updateBuilder();
        }
    });
    builder.addEventListener('input', (event) => {
        const target = event.target as HTMLInputElement;
        const card = target.closest<HTMLElement>('[data-embed-card]');
        if (card && target.matches('[data-embed-field="color"]')) syncColorPicker(card);
    });
    document.addEventListener('pointerdown', (event) => {
        const target = event.target as Node | null;
        if (!target || !builder.contains(target)) {
            closeColorPopovers();
            closeDatePickers();
            return;
        }
        const element = target as HTMLElement;
        if (!element.closest('[data-embed-color-popover], [data-toggle-color-picker]')) closeColorPopovers();
        if (!element.closest('[data-embed-date-popover], [data-toggle-date-picker]')) closeDatePickers();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeColorPopovers();
            closeDatePickers();
        }
    });
    load([]);
    return {
        serialize: () => serializeModerationEmbeds(builder),
        reset: () => load([]),
        load,
    };
}

async function renderModerationTools(): Promise<void> {
    const user = await loadUser();
    if (!user.access.management) {
        location.replace('/moderation');
        return;
    }
    const channels = user.access.messageTools
        ? await fetchJson<ManagementChannel[]>('/api/moderation/tools/channels')
        : [];
    moderationShell(user, 'tools', 'Management Tools', 'Send and edit bot messages without leaving ATC.', `
        <div class="tool-layout">
            <nav class="tool-tabs" aria-label="Management tools">
                <button class="active" type="button" data-tool-tab="send" aria-selected="true">${moderatorIcon('send')}<span>Send bot message</span></button>
                <button type="button" data-tool-tab="edit" aria-selected="false">${moderatorIcon('pencil-line')}<span>Edit bot message</span></button>
            </nav>
            <div class="tool-panels">
            ${toolCard('send', 'Send bot message', 'Management / Developer', `
                ${user.access.messageTools ? `<form class="tool-form" id="message-tool">
                    <div class="tool-field channel-field">
                        <label for="send-channel-trigger">Destination channel</label>
                        <div class="channel-picker" id="send-channel-picker">
                            <input id="send-channel-id" name="channelId" type="hidden" />
                            <button class="channel-picker-trigger" id="send-channel-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="send-channel-options" aria-required="true">
                                <span class="channel-picker-value"><span class="channel-picker-hash" aria-hidden="true">#</span><span id="send-channel-name">Choose a channel</span></span>
                                ${moderatorIcon('chevron-down')}
                            </button>
                            <div class="channel-picker-menu" id="send-channel-menu" hidden>
                                <div class="channel-picker-search">
                                    ${moderatorIcon('search')}
                                    <input id="send-channel-search" type="search" placeholder="Search channels…" autocomplete="off" aria-label="Search channels" />
                                </div>
                                <div class="channel-picker-options" id="send-channel-options" role="listbox" aria-label="Server channels"></div>
                            </div>
                        </div>
                        <small>Choose a server channel. Channels are grouped by category.</small>
                    </div>
                    <label>Plain content<textarea name="content" maxlength="2000"></textarea></label>
                    ${embedBuilderMarkup()}
                    <button class="button" type="submit">Send message</button>
                </form>` : '<p class="locked-tool">Your role can view this tool, but only management and developers can use it.</p>'}`)}
            ${toolCard('edit', 'Edit bot message', 'Management / Developer', `
                ${user.access.messageTools ? `<form class="tool-form" id="message-edit-tool">
                    <label>Message URL<input name="messageUrl" type="url" placeholder="https://discord.com/channels/..." required /></label>
                    <button class="button secondary" id="fetch-message" type="button">Fetch message</button>
                    <fieldset class="message-edit-fields" data-message-edit-fields disabled>
                        <label>Plain content<textarea name="content" maxlength="2000"></textarea></label>
                        ${embedBuilderMarkup()}
                    </fieldset>
                    <button class="button" type="submit" disabled>Save changes</button>
                </form>` : '<p class="locked-tool">Management or developer access is required.</p>'}`)}
            </div>
        </div>
    `);
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-tool-tab]')];
    const panels = [...document.querySelectorAll<HTMLElement>('[data-tool-panel]')];
    for (const tab of tabs) {
        tab.addEventListener('click', () => {
            const selected = tab.dataset.toolTab;
            for (const candidate of tabs) {
                const active = candidate === tab;
                candidate.classList.toggle('active', active);
                candidate.setAttribute('aria-selected', String(active));
            }
            for (const panel of panels) panel.hidden = panel.dataset.toolPanel !== selected;
        });
    }
    let resetChannelPicker: () => void = () => {};
    let resetSendEmbedBuilder: () => void = () => {};
    let resetEditEmbedBuilder: () => void = () => {};
    let resetMessageFetchState: () => void = () => {};
    const bindTool = (
        selector: string,
        url: string,
        transform?: (data: Record<string, string>, form: HTMLFormElement) => Record<string, unknown>,
    ) => {
        document.querySelector<HTMLFormElement>(selector)?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget as HTMLFormElement;
            const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
            const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
            button.disabled = true;
            try {
                const payload = transform ? transform(values, form) : values;
                const result = await fetchJson<{ url?: string; actionId?: string }>(url, { method: 'POST', body: JSON.stringify(payload) });
                toast(
                    result.url ? `Done: ${result.url}` : result.actionId ? `Action ${result.actionId} completed.` : 'Operation completed.',
                    'success',
                );
                form.reset();
                if (form.id === 'message-tool') {
                    resetChannelPicker();
                    resetSendEmbedBuilder();
                }
                if (form.id === 'message-edit-tool') {
                    resetEditEmbedBuilder();
                    form.querySelector<HTMLFieldSetElement>('[data-message-edit-fields]')!.disabled = true;
                    resetMessageFetchState();
                    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled = true;
                }
            } catch (error) {
                toast(error instanceof Error ? error.message : 'Operation failed.', 'danger');
            } finally {
                button.disabled = false;
            }
        });
    };

    const channelPicker = document.querySelector<HTMLElement>('#send-channel-picker');
    const channelPickerTrigger = document.querySelector<HTMLButtonElement>('#send-channel-trigger');
    const channelPickerMenu = document.querySelector<HTMLElement>('#send-channel-menu');
    const channelPickerSearch = document.querySelector<HTMLInputElement>('#send-channel-search');
    const channelPickerOptions = document.querySelector<HTMLElement>('#send-channel-options');
    const channelPickerId = document.querySelector<HTMLInputElement>('#send-channel-id');
    const channelPickerName = document.querySelector<HTMLElement>('#send-channel-name');

    if (
        channelPicker &&
        channelPickerTrigger &&
        channelPickerMenu &&
        channelPickerSearch &&
        channelPickerOptions &&
        channelPickerId &&
        channelPickerName
    ) {
        const closeChannelPicker = () => {
            channelPickerMenu.hidden = true;
            channelPickerTrigger.setAttribute('aria-expanded', 'false');
            channelPicker.classList.remove('open');
        };
        const setChannelPickerOpen = (open: boolean) => {
            channelPickerMenu.hidden = !open;
            channelPickerTrigger.setAttribute('aria-expanded', String(open));
            channelPicker.classList.toggle('open', open);
            if (open) channelPickerSearch.focus();
        };
        const renderChannelOptions = () => {
            const query = channelPickerSearch.value.trim().toLocaleLowerCase();
            const groups = new Map<string, ManagementChannel[]>();
            for (const channel of channels) {
                const category = channel.category || 'Uncategorized';
                if (query && !`${channel.name} ${category}`.toLocaleLowerCase().includes(query)) continue;
                const group = groups.get(category) || [];
                group.push(channel);
                groups.set(category, group);
            }
            channelPickerOptions.innerHTML = groups.size
                ? [...groups.entries()].map(([category, entries]) => `
                    <section class="channel-picker-group">
                        <p class="channel-picker-category">${escapeHtml(category)}</p>
                        <div class="channel-picker-group-options">
                            ${entries.map((channel) => `
                                <button class="channel-picker-option" type="button" role="option" data-channel-id="${escapeHtml(channel.id)}" data-channel-name="${escapeHtml(channel.name)}" aria-selected="${channel.id === channelPickerId.value}">
                                    <span class="channel-option-hash" aria-hidden="true">#</span>
                                    <span class="channel-option-name">${escapeHtml(channel.name)}</span>
                                    <span class="channel-option-check">${moderatorIcon('check')}</span>
                                </button>`).join('')}
                        </div>
                    </section>`).join('')
                : '<p class="channel-picker-empty">No matching channels.</p>';
            renderModeratorIcons(channelPickerOptions);
        };
        resetChannelPicker = () => {
            channelPickerId.value = '';
            channelPickerName.textContent = 'Choose a channel';
            channelPickerSearch.value = '';
            channelPickerTrigger.classList.remove('invalid');
            channelPickerTrigger.setAttribute('aria-invalid', 'false');
            closeChannelPicker();
            renderChannelOptions();
        };
        renderChannelOptions();
        channelPickerTrigger.addEventListener('click', () => setChannelPickerOpen(channelPickerMenu.hidden));
        channelPickerSearch.addEventListener('input', renderChannelOptions);
        channelPickerOptions.addEventListener('click', (event) => {
            const option = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-channel-id]');
            if (!option?.dataset.channelId || !option.dataset.channelName) return;
            channelPickerId.value = option.dataset.channelId;
            channelPickerName.textContent = option.dataset.channelName;
            channelPickerTrigger.classList.remove('invalid');
            channelPickerTrigger.setAttribute('aria-invalid', 'false');
            closeChannelPicker();
            channelPickerTrigger.focus();
        });
        document.addEventListener('pointerdown', (event) => {
            if (!channelPicker.contains(event.target as Node)) closeChannelPicker();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !channelPickerMenu.hidden) {
                closeChannelPicker();
                channelPickerTrigger.focus();
            }
        });
    }

    const sendEmbedBuilder = setupEmbedBuilder(document.querySelector<HTMLFormElement>('#message-tool'));
    const editEmbedBuilder = setupEmbedBuilder(document.querySelector<HTMLFormElement>('#message-edit-tool'));
    resetSendEmbedBuilder = () => sendEmbedBuilder?.reset();
    resetEditEmbedBuilder = () => editEmbedBuilder?.reset();

    bindTool('#message-tool', '/api/moderation/tools/message', (values) => {
        if (!values.channelId) {
            channelPicker?.classList.add('invalid');
            channelPickerTrigger?.classList.add('invalid');
            channelPickerTrigger?.setAttribute('aria-invalid', 'true');
            channelPickerTrigger?.focus();
            throw new Error('Choose a destination channel before sending.');
        }
        return { ...values, embeds: sendEmbedBuilder?.serialize() || [] };
    });
    bindTool('#message-edit-tool', '/api/moderation/tools/message-edit', (values) => {
        const target = parseDiscordMessageUrl(values.messageUrl || '');
        if (!target) throw new Error('Enter a valid Discord message URL.');
        return { ...values, ...target, embeds: editEmbedBuilder?.serialize() || [] };
    });

    const messageEditForm = document.querySelector<HTMLFormElement>('#message-edit-tool');
    const messageUrl = messageEditForm?.elements.namedItem('messageUrl') as HTMLInputElement | null;
    const fetchMessageButton = messageEditForm?.querySelector<HTMLButtonElement>('#fetch-message');
    let loadedMessageUrl = '';
    const syncMessageFetchState = () => {
        if (!messageUrl || !fetchMessageButton) return;
        const hasNewUrl = !loadedMessageUrl || messageUrl.value !== loadedMessageUrl;
        fetchMessageButton.disabled = !hasNewUrl;
        fetchMessageButton.textContent = hasNewUrl ? 'Fetch message' : 'Message loaded · change URL';
    };
    resetMessageFetchState = () => {
        loadedMessageUrl = '';
        if (messageUrl) {
            messageUrl.readOnly = false;
            messageUrl.setCustomValidity('');
        }
        syncMessageFetchState();
    };
    messageUrl?.addEventListener('input', () => {
        messageUrl.setCustomValidity('');
        syncMessageFetchState();
    });

    fetchMessageButton?.addEventListener('click', async (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const form = button.closest<HTMLFormElement>('form')!;
        if (!form.reportValidity()) return;
        const input = form.elements.namedItem('messageUrl') as HTMLInputElement;
        const target = parseDiscordMessageUrl(input.value);
        input.setCustomValidity(target ? '' : 'Enter a valid Discord message URL.');
        if (!target || !form.reportValidity()) return;
        button.disabled = true;
        button.textContent = 'Fetching…';
        try {
            const message = await fetchJson<{ content: string; embeds: ModerationEmbed[] }>(
                '/api/moderation/tools/message-get',
                {
                    method: 'POST',
                    body: JSON.stringify(target),
                },
            );
            form.querySelector<HTMLFieldSetElement>('[data-message-edit-fields]')!.disabled = false;
            (form.elements.namedItem('content') as HTMLTextAreaElement).value = message.content;
            editEmbedBuilder?.load(message.embeds || []);
            loadedMessageUrl = input.value;
            input.readOnly = false;
            syncMessageFetchState();
            form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled = false;
        } catch (error) {
            button.disabled = false;
            button.textContent = 'Fetch message';
            toast(error instanceof Error ? error.message : 'Could not fetch the message.', 'danger');
        }
    });

}

async function renderBotSettings(): Promise<void> {
    const user = await loadUser();
    if (!user.access.management) {
        location.replace('/moderation');
        return;
    }
    const data = await fetchJson<{ settings: ManagedBotSetting[] }>('/api/moderation/settings');
    const weatherSetting = data.settings.find((setting) => setting.key === 'weather.avwx_api_key');
    if (!weatherSetting) throw new Error('Weather settings are unavailable.');

    const renderSettingStatus = (setting: ManagedBotSetting) => {
        const status = setting.configured
            ? `<span class="settings-status configured">Configured${setting.maskedValue ? ` · ${escapeHtml(setting.maskedValue)}` : ''}</span>`
            : '<span class="settings-status">Not configured</span>';
        const updated = setting.updatedAt ? `Last updated ${formatDate(setting.updatedAt, true)}` : 'No saved value yet';
        return { status, updated };
    };
    const initialStatus = renderSettingStatus(weatherSetting);
    moderationShell(user, 'settings', 'Bot Settings', 'Manage runtime integrations and advanced bot configuration.', `
        <div class="settings-page">
            <section class="settings-intro">
                <div class="settings-intro-mark">${moderatorIcon('settings')}</div>
                <div>
                    <p class="eyebrow">Management only</p>
                    <h2>Runtime configuration, kept out of deployment files.</h2>
                    <p>Credentials saved here are scoped to this Discord server. Secret values are masked after saving and are never sent back to the browser.</p>
                </div>
            </section>
            <form class="settings-form" id="bot-settings-form">
                <article class="settings-card">
                    <header class="settings-card-header">
                        <span class="settings-card-icon">${moderatorIcon('key-round')}</span>
                        <div>
                            <p class="eyebrow">${escapeHtml(weatherSetting.category)}</p>
                            <h2>Weather integrations</h2>
                            <p>Connect the bot to aviation weather services used by its Discord commands.</p>
                        </div>
                    </header>
                    <div class="settings-row">
                        <div class="settings-copy">
                            <strong>${escapeHtml(weatherSetting.label)}</strong>
                            <p>${escapeHtml(weatherSetting.description)}</p>
                            <small>${escapeHtml(weatherSetting.help)}</small>
                        </div>
                        <div class="settings-control">
                            <label>Secret value
                                <input name="${escapeHtml(weatherSetting.key)}" type="password" autocomplete="new-password" placeholder="Paste a new API key" maxlength="512" />
                            </label>
                            <div class="settings-control-meta">
                                <span data-setting-status>${initialStatus.status}</span>
                                <span data-setting-updated>${initialStatus.updated}</span>
                            </div>
                            <label class="settings-clear"><input name="clear-${escapeHtml(weatherSetting.key)}" type="checkbox" /> Remove saved key</label>
                        </div>
                    </div>
                </article>
                <aside class="settings-note">
                    <span>${moderatorIcon('triangle-alert')}</span>
                    <div><strong>Handle credentials carefully</strong><p>Only management members can view this page or change these values. Rotate an exposed key with its provider before saving the replacement here.</p></div>
                </aside>
                <footer class="settings-footer">
                    <span>Changes take effect the next time the related command runs.</span>
                    <button class="button" type="submit">Save settings</button>
                </footer>
            </form>
        </div>
    `);

    const form = document.querySelector<HTMLFormElement>('#bot-settings-form');
    const input = form?.elements.namedItem(weatherSetting.key) as HTMLInputElement | null;
    const clear = form?.elements.namedItem(`clear-${weatherSetting.key}`) as HTMLInputElement | null;
    if (!form || !input || !clear) return;
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        button.disabled = true;
        try {
            const result = await fetchJson<{ settings: ManagedBotSetting[] }>('/api/moderation/settings', {
                method: 'POST',
                body: JSON.stringify({
                    settings: {
                        [weatherSetting.key]: {
                            value: input.value,
                            clear: clear.checked,
                        },
                    },
                }),
            });
            const updatedSetting = result.settings.find((setting) => setting.key === weatherSetting.key) || weatherSetting;
            const status = renderSettingStatus(updatedSetting);
            form.querySelector<HTMLElement>('[data-setting-status]')!.innerHTML = status.status;
            form.querySelector<HTMLElement>('[data-setting-updated]')!.textContent = status.updated;
            if (input) input.value = '';
            if (clear) clear.checked = false;
            toast('Bot settings saved.', 'success');
        } catch (error) {
            toast(error instanceof Error ? error.message : 'Could not save bot settings.', 'danger');
        } finally {
            button.disabled = false;
        }
    });
}

async function renderRoute(): Promise<void> {
    const moderatorRoute = location.pathname.startsWith('/moderation');
    document.body.classList.toggle('moderation-mode', moderatorRoute);
    document.body.classList.toggle('radar-mode', location.pathname === '/moderation/radar');
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
        if (location.pathname === '/moderation') {
            await renderModerationDashboard();
            return;
        }
        if (location.pathname === '/moderation/radar') {
            await renderUserRadar();
            return;
        }
        if (location.pathname === '/moderation/logs') {
            await renderModerationLogs();
            return;
        }
        if (location.pathname === '/moderation/actions') {
            await renderActionsDatabase();
            return;
        }
        const moderatorActionMatch = location.pathname.match(/^\/moderation\/actions\/([^/]+)\/?$/);
        if (moderatorActionMatch?.[1]) {
            await renderModeratorAction(decodeURIComponent(moderatorActionMatch[1]));
            return;
        }
        const moderatorAppealsMatch = location.pathname.match(/^\/moderation\/actions\/([^/]+)\/appeals\/?$/);
        if (moderatorAppealsMatch?.[1]) {
            await renderModeratorAppeals(decodeURIComponent(moderatorAppealsMatch[1]));
            return;
        }
        if (location.pathname === '/moderation/tools') {
            await renderModerationTools();
            return;
        }
        if (location.pathname === '/moderation/settings') {
            await renderBotSettings();
            return;
        }
        const radarMatch = location.pathname.match(/^\/moderation\/radar\/(\d{17,20})\/?$/);
        if (radarMatch?.[1]) {
            await renderRadarProfile(radarMatch[1]);
            return;
        }
        const actionAppealMatch = location.pathname.match(/^\/action\/([^/]+)\/appeal\/([^/]+)\/?$/);
        if (actionAppealMatch?.[1] && actionAppealMatch[2]) {
            await renderAppeal(decodeURIComponent(actionAppealMatch[1]), decodeURIComponent(actionAppealMatch[2]));
            return;
        }
        const actionMatch = location.pathname.match(/^\/action\/([^/]+)\/?$/);
        if (actionMatch?.[1]) {
            const viewer = await loadUser();
            if (viewer.access.moderator) {
                location.replace(`/moderation/actions/${encodeURIComponent(decodeURIComponent(actionMatch[1]))}`);
                return;
            }
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
