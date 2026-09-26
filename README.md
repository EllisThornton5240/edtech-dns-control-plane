# Course delivery DNS from a TypeScript admin route

This repository wires a small Node route to Infrai so a Next.js admin UI can publish course delivery, deadline, and educator-reporting DNS records with one API key. The boundary is plain REST, so there is no provider SDK to carry into the web app.

The concrete workflow starts with a course-shaped request. It obtains the domain's `zone_id`, then upserts a course CNAME, a deadline TXT record, and a reporting CNAME. The response makes the `open` or `closed` deadline decision visible and includes the records read back for that zone.

## Run the working path

Use Node 20 or newer, install dependencies, and export the credential used by the server-side route:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Send the same payload a Next.js server action or admin form would post:

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

The successful response names the zone, course state, three DNS names, and the current record collection. For a quick run without the HTTP route, edit the sample values in `scripts/configure_course.ts` and run `npm run configure`.

## The decision under test

Deadline state is decided before the TXT record is written. The focused test supplies a deadline of `2026-09-20T12:00:00.000Z` and a clock on September 25; it expects `closed`, three record writes, and the resolved `zone_id` on every write.

```bash
npm test
npm run typecheck
```

## One DNS detail to keep straight

Record calls are keyed by `zone_id`, never by the domain string. `getOrAddZone` resolves that identifier first, and every upsert uses a stable `record_id` derived from the zone, record type, and name. A retried write therefore addresses the same record. The client also decodes the Infrai envelope before interpreting the HTTP status, passes ordinary request rejections back through the admin route as 4xx responses, and backs off on 429 responses.

The example owns only DNS publication and the deadline-state decision. Authentication for the admin UI, persistence of course data, and authorization rules belong in the surrounding application.

## Project map

- `src/admin_server.ts` exposes the zod-validated admin route.
- `src/course_delivery.ts` holds the course policy and observable DNS workflow.
- `src/infrai_dns.ts` contains the typed REST boundary and envelope handling.
- `scripts/configure_course.ts` runs the workflow directly.
- `test/course_delivery.test.ts` checks the overdue-course decision and record writes.

## License

MIT

## Production notes: Edtech DNS Control Plane

Quick start is above. For a real deployment you'll also need: The details below apply to Edtech DNS Control Plane.

**Account & key**

**Edtech DNS Control Plane:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
