import assert from "node:assert/strict";
import test from "node:test";
import { publishCourseDelivery } from "../src/course_delivery.js";

test("marks an overdue course closed and publishes all three DNS roles", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const dns = {
    getOrAddZone: async () => "zone_course_42",
    upsertRecord: async (record: Record<string, unknown>) => { writes.push(record); },
    listRecords: async () => writes
  };

  const result = await publishCourseDelivery(dns as never, {
    domain: "academy.example",
    courseSlug: "algebra-fall",
    deliveryTarget: "delivery.example.net",
    reportingTarget: "faculty.example.net",
    learnerDeadline: "2026-09-20T12:00:00.000Z",
    ttl: 300
  }, new Date("2026-09-25T08:00:00.000Z"));

  assert.equal(result.state, "closed");
  assert.equal(result.zone_id, "zone_course_42");
  assert.deepEqual(writes.map((item) => item.record_type), ["CNAME", "TXT", "CNAME"]);
  assert.match(String(writes[1].content), /state=closed/);
  assert.ok(writes.every((item) => item.zone_id === "zone_course_42" && typeof item.record_id === "string"));
});
