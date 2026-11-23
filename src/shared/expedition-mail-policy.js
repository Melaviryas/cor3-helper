// Fail closed on unknown titles. These titles identify reward mail, not other inbox items.
export function isExpeditionMail(message) {
    if (!message || typeof message.id !== 'string' || !message.id || message.status === 'CLAIMED') return false;
    const title = String(message.title || '').trim();
    return /^(?:expedition (?:loot|spoils|rewards)|远征(?:战利品|奖励)|遠征(?:戰利品|獎勵))$/i.test(title)
        && pendingAttachments(message).length > 0;
}

export function pendingAttachments(message) {
    return (Array.isArray(message?.attachments) ? message.attachments : [])
        .filter(item => item && typeof item.id === 'string' && item.id && item.claimedAt === null);
}
