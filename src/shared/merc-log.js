// The same logger works in MAIN and isolated worlds. Persisting is owned by content.js.
export function mercLog(...args) {
    const explicitLevel = args.length > 1 && ['info', 'success', 'warn', 'error'].includes(args.at(-1)) ? args.pop() : null;
    console.log(...args);
    const msg = args.map(arg => {
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg); } catch { return String(arg); }
    }).join(' ').replace(/^\[COR3 Helper\]\s*/, '');
    const level = explicitLevel || (/failed|error|insufficient|giving up|aborting|失败|错误|停止/i.test(msg) ? 'error'
        : /timeout|unreachable|skipp|blocked|no fitting|not available/i.test(msg) ? 'warn'
        : /complete|collected|launched|claimed|完成|成功|已确认/i.test(msg) ? 'success' : 'info');
    window.postMessage({ type: 'COR3_MERC_LOG', msg, level, timestamp: new Date().toISOString() }, '*');
}
