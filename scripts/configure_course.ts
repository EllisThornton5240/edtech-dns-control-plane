import { publishCourseDelivery } from "../src/course_delivery.js";
import { InfraiDnsClient } from "../src/infrai_dns.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running this script");

const result = await publishCourseDelivery(new InfraiDnsClient(apiKey), {
  domain: "school.example",
  courseSlug: "typescript-101",
  deliveryTarget: "courses.example.net",
  reportingTarget: "reports.example.net",
  learnerDeadline: "2027-06-30T23:59:00.000Z",
  ttl: 300
});

console.log(JSON.stringify(result, null, 2));
