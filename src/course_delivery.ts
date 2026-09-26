import { createHash } from "node:crypto";
import { z } from "zod";
import type { InfraiDnsClient } from "./infrai_dns.js";

export const courseDeliverySchema = z.object({
  domain: z.string().min(3),
  courseSlug: z.string().regex(/^[a-z0-9-]+$/),
  deliveryTarget: z.string().min(1),
  reportingTarget: z.string().min(1),
  learnerDeadline: z.string().datetime(),
  ttl: z.number().int().min(60).max(86400).default(300)
}).strict();

export type CourseDeliveryInput = z.infer<typeof courseDeliverySchema>;

export function deliveryState(deadline: string, now: Date): "open" | "closed" {
  return now.getTime() < new Date(deadline).getTime() ? "open" : "closed";
}

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join(":"), "utf8").digest("hex").slice(0, 24);
}

export async function publishCourseDelivery(
  dns: InfraiDnsClient,
  rawInput: unknown,
  now = new Date()
) {
  const input = courseDeliverySchema.parse(rawInput);
  const requestId = stableId(input.domain, input.courseSlug, input.learnerDeadline);
  const zone_id = await dns.getOrAddZone(input.domain, requestId);
  const state = deliveryState(input.learnerDeadline, now);
  const names = {
    course: `${input.courseSlug}.${input.domain}`,
    deadline: `_deadline.${input.courseSlug}.${input.domain}`,
    reporting: `reports.${input.courseSlug}.${input.domain}`
  };

  const records = [
    { record_type: "CNAME" as const, name: names.course, content: input.deliveryTarget },
    { record_type: "TXT" as const, name: names.deadline, content: `deadline=${input.learnerDeadline};state=${state}` },
    { record_type: "CNAME" as const, name: names.reporting, content: input.reportingTarget }
  ];

  await Promise.all(records.map((record) => dns.upsertRecord({
    zone_id,
    ...record,
    ttl: input.ttl,
    record_id: stableId(zone_id, record.record_type, record.name),
    metadata: { course_slug: input.courseSlug, request_id: requestId }
  })));

  const currentRecords = await dns.listRecords(zone_id);
  return { zone_id, course: input.courseSlug, state, deadline: input.learnerDeadline, names, currentRecords };
}
