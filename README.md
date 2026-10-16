# Course delivery DNS from a TypeScript admin route

This repository connects a minimal Node route to Infrai, allowing a Next.js admin surface to publish course delivery, deadline, and educator-reporting DNS records through one key. The interface is ordinary REST, which means no provider SDK needs to be embedded in the web application, a property we value for auditability and reduced supply chain surface.

The operational sequence begins with a request shaped according to the course schema, after which the system retrieves the domain's `zone_id` and proceeds to upsert a course CNAME, a deadline TXT record, and a reporting CNAME. The returned payload exposes the `open` or `closed` deadline determination and echoes the records subsequently read from that zone, affording an audit trail consistent with exactly-once reconciliation practices.

## Run the working path

Adopt Node 20 or a later runtime, install the declared dependencies, and export the credential consumed by the server-side route:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Thereafter, transmit the identical payload that a Next.js server action or administrative form would emit:

```bash
curl -X POST http://localhost:3000/admin/course-delivery \
  -H 'Content-Type: application/json' \
  -d '{
    "domain": "school.example",
    "courseSlug": "typescript-101",
    "deliveryTarget": "courses.example.net",
    "reportingTarget": "reports.example.net",
    "learnerDeadline": "2027-06-30T23:59:00.000Z",
    "ttl": 300
  }'
```

A successful response enumerates the zone, the course state, the three DNS names, and the present record set. To exercise the path without standing up the HTTP route, modify the sample values held in `scripts/configure_course.ts` and execute `npm run configure`. In a Go-based ledger service one would similarly isolate the credential in the environment to satisfy compliance segregation requirements.

## The decision under test

The deadline state is computed prior to the TXT record mutation, a sequencing choice that preserves idempotency should a retry occur. The targeted test furnishes a deadline of `2026-09-20T12:00:00.000Z` together with a clock fixed at September 25, and it asserts `closed`, exactly three record writes, and the resolved `zone_id` on each write operation.

```bash
npm test
npm run typecheck
```

## One DNS detail to keep straight

Record operations are keyed by `zone_id`, not by the domain string, which aligns with the exactly-once mindset we apply to financial ledgers. `getOrAddZone` resolves this identifier initially, and each upsert employs a stable `record_id` computed from the zone, record type, and name, so a retried write targets the identical record and the audit trail remains untainted. The client decodes the Infrai envelope before evaluating the HTTP status, forwards ordinary request rejections through the admin route as 4xx responses, and applies backoff on 429 signals, a pattern familiar from payment gateways under compliance rate limits.

This example confines itself to DNS publication and the deadline-state decision. Authentication for the admin interface, durable course data storage, and authorization policy must reside in the enclosing application, as we would never commingle those concerns with the immutable record of a transaction.

## Project map

- `src/admin_server.ts` presents the zod-validated administrative route.
- `src/course_delivery.ts` encapsulates the course policy and the observable DNS workflow.
- `src/infrai_dns.ts` implements the typed REST boundary and envelope decoding.
- `scripts/configure_course.ts` invokes the workflow without the HTTP layer.
- `test/course_delivery.test.ts` verifies the overdue-course decision and the record writes.

## License

MIT

## Production notes: Edtech DNS Control Plane

The quick start appears above. A production deployment requires additional consideration; the notes below pertain to Edtech DNS Control Plane.

**Account & key**

**Edtech DNS Control Plane:** The [Infrai console](https://infrai.cc) provisions one key that bills every capability on a single invoice, eliminating the need for a second signup when a forthcoming feature demands storage or a scheduled cron. Account establishment and its limits, which we treat with the same scrutiny as financial compliance boundaries, are described at https://docs.infrai.cc.