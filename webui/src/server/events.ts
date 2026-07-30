import type { AtcInternalEvent } from '../../../src/lib/atcEvents';
import { config } from './config';

export async function publishAtcEvent(event: AtcInternalEvent): Promise<void> {
    const response = await fetch(`${config.botInternalApiUrl}/internal/events`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${config.atcInternalApiKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) return;
    const body = (await response.text()).slice(0, 500);
    throw new Error(`Bot event API returned ${response.status}${body ? `: ${body}` : ''}`);
}
