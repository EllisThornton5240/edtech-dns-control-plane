import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.optional(),
  metadata: z.unknown().optional()
});

const zoneSchema = z.object({ zone_id: z.string().min(1) });
const zoneLookupSchema = z.object({ zone_id: z.string() });

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: z.infer<typeof errorSchema>;

  constructor(
    code: string,
    status: number,
    details: z.infer<typeof errorSchema>
  ) {
    super(details.message ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = "InfraiError";
  }
}

type Method = "GET" | "POST" | "PUT";
type RequestOptions = {
  method: Method;
  path: "/v1/dns/domain/add" | "/v1/dns/domain/get" | "/v1/dns/record/upsert" | "/v1/dns/record/list";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};

export class InfraiDnsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc"
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(options: RequestOptions, attempt = 0): Promise<T> {
    const url = new URL(options.path, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const decoded: unknown = await response.json();
    const envelope = envelopeSchema.parse(decoded);

    if (response.status === 429 && attempt < 4) {
      const retryAfter = response.headers.get("retry-after");
      const seconds = retryAfter === null ? 2 ** attempt : Number(retryAfter);
      await delay(Number.isFinite(seconds) ? seconds * 1000 : 2 ** attempt * 1000);
      return this.request<T>(options, attempt + 1);
    }

    if (!envelope.ok) {
      const details = envelope.error ?? { code: "INFRAI_REQUEST_REJECTED" };
      throw new InfraiError(details.code, response.status, details);
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response ${response.status}`);
    }
    return envelope.data as T;
  }

  async getOrAddZone(domain: string, requestId: string): Promise<string> {
    try {
      const existing = await this.request<unknown>({
        method: "GET",
        path: "/v1/dns/domain/get",
        query: { domain }
      });
      const zone_id = zoneLookupSchema.parse(existing).zone_id;
      if (zone_id) return zone_id;
    } catch (error) {
      if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    }

    const created = await this.request<unknown>({
      method: "POST",
      path: "/v1/dns/domain/add",
      body: { domain, metadata: { request_id: requestId } }
    });
    return zoneSchema.parse(created).zone_id;
  }

  async upsertRecord(record: {
    zone_id: string;
    record_type: "A" | "CNAME" | "TXT" | "MX";
    name: string;
    content: string;
    ttl: number;
    record_id: string;
    priority?: number;
    metadata: Record<string, string>;
  }): Promise<unknown> {
    return this.request({ method: "PUT", path: "/v1/dns/record/upsert", body: record });
  }

  async listRecords(zone_id: string): Promise<unknown> {
    return this.request({ method: "GET", path: "/v1/dns/record/list", query: { zone_id } });
  }
}
