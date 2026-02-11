import Transport from 'winston-transport';
import http from 'http';
import https from 'https';
import { URL } from 'url';

// ─── Configuration ──────────────────────────────────────────────────
interface HttpTransportOptions extends Transport.TransportStreamOptions {
    /** Full URL of the external log ingestion endpoint (e.g. https://logs.example.com/api/logs) */
    url: string;
    /** Optional API key sent as Authorization: Bearer <key> */
    apiKey?: string;
    /** Max entries to batch before flushing (default: 50) */
    batchSize?: number;
    /** Max ms to wait before flushing a partial batch (default: 5000) */
    flushInterval?: number;
    /** Request timeout in ms (default: 10000) */
    timeout?: number;
    /** Max retry attempts per batch (default: 3) */
    maxRetries?: number;
}

/**
 * Custom Winston transport that sends log entries to an external HTTP API.
 *
 * Features:
 * - Batches log entries to reduce HTTP overhead
 * - Auto-flushes on interval or when batch size is reached
 * - Non-blocking — failures are silently retried (never crashes the app)
 * - Supports Bearer token authentication via `LOG_API_KEY`
 * - Graceful flush on process exit
 */
export class HttpLogTransport extends Transport {
    private url: URL;
    private apiKey?: string;
    private batchSize: number;
    private flushInterval: number;
    private timeout: number;
    private maxRetries: number;

    private buffer: any[] = [];
    private timer: NodeJS.Timeout | null = null;
    private isFlushing = false;

    constructor(opts: HttpTransportOptions) {
        super(opts);

        this.url = new URL(opts.url);
        this.apiKey = opts.apiKey;
        this.batchSize = opts.batchSize ?? 50;
        this.flushInterval = opts.flushInterval ?? 5000;
        this.timeout = opts.timeout ?? 10000;
        this.maxRetries = opts.maxRetries ?? 3;

        // Start the periodic flush timer
        this.startTimer();

        // Flush remaining logs on graceful shutdown
        process.on('beforeExit', () => this.flush());
    }

    /**
     * Winston calls this for every log entry.
     */
    log(info: any, callback: () => void) {
        setImmediate(() => this.emit('logged', info));

        // Add to buffer
        this.buffer.push({
            timestamp: info.timestamp || new Date().toISOString(),
            level: info.level,
            message: info.message,
            service: 'payment-service',
            ...info,
        });

        // Flush if batch is full
        if (this.buffer.length >= this.batchSize) {
            this.flush();
        }

        callback();
    }

    /**
     * Flush the buffer — send accumulated logs to the external API.
     */
    private async flush() {
        if (this.buffer.length === 0 || this.isFlushing) return;

        this.isFlushing = true;
        const batch = this.buffer.splice(0, this.batchSize);

        try {
            await this.sendWithRetry(batch, 0);
        } catch {
            // Silently drop after max retries — we never crash the app for logging
        } finally {
            this.isFlushing = false;

            // If there are more entries queued, flush again
            if (this.buffer.length >= this.batchSize) {
                this.flush();
            }
        }
    }

    /**
     * POST a batch with retry logic.
     */
    private sendWithRetry(batch: any[], attempt: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (attempt >= this.maxRetries) {
                return reject(new Error(`Max retries (${this.maxRetries}) exceeded`));
            }

            const payload = JSON.stringify({ logs: batch });
            const isHttps = this.url.protocol === 'https:';
            const lib = isHttps ? https : http;

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload).toString(),
            };

            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }

            const req = lib.request(
                {
                    hostname: this.url.hostname,
                    port: this.url.port || (isHttps ? 443 : 80),
                    path: this.url.pathname + this.url.search,
                    method: 'POST',
                    headers,
                    timeout: this.timeout,
                },
                (res) => {
                    // Consume the response body to free memory
                    res.resume();

                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve();
                    } else {
                        // Retry on server errors (5xx) or rate limits (429)
                        if (res.statusCode && (res.statusCode >= 500 || res.statusCode === 429)) {
                            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                            setTimeout(() => {
                                this.sendWithRetry(batch, attempt + 1).then(resolve).catch(reject);
                            }, delay);
                        } else {
                            // Client errors (4xx except 429) — don't retry
                            resolve();
                        }
                    }
                }
            );

            req.on('error', () => {
                // Network error — retry with exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                setTimeout(() => {
                    this.sendWithRetry(batch, attempt + 1).then(resolve).catch(reject);
                }, delay);
            });

            req.on('timeout', () => {
                req.destroy();
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                setTimeout(() => {
                    this.sendWithRetry(batch, attempt + 1).then(resolve).catch(reject);
                }, delay);
            });

            req.write(payload);
            req.end();
        });
    }

    /**
     * Start the periodic auto-flush timer.
     */
    private startTimer() {
        this.timer = setInterval(() => {
            this.flush();
        }, this.flushInterval);

        // Don't let the timer prevent process exit
        if (this.timer.unref) {
            this.timer.unref();
        }
    }

    /**
     * Clean up on close.
     */
    close() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.flush();
    }
}
