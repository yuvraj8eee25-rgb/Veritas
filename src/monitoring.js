import * as Sentry from "@sentry/browser";
import { onCLS, onINP, onLCP } from "web-vitals";

const dsn = import.meta.env.VITE_SENTRY_DSN;
export function sanitizeMonitoringEvent(event) {
  // Keep operational diagnostics while discarding request/user content.
  const isWebVital = event.message === "web-vital";
  const metric = ["CLS", "INP", "LCP"].includes(event.tags?.metric) ? event.tags.metric : null;
  const rating = ["good", "needs-improvement", "poor"].includes(event.tags?.rating) ? event.tags.rating : null;
  const value = Number(event.extra?.value);
  const delta = Number(event.extra?.delta);
  delete event.user;
  delete event.extra;
  delete event.contexts;
  delete event.breadcrumbs;
  delete event.request;
  delete event.culprit;
  delete event.logentry;
  event.transaction = "veritas";
  event.tags = isWebVital && metric ? { metric, ...(rating ? { rating } : {}) } : {};
  if (isWebVital && metric && Number.isFinite(value) && Number.isFinite(delta)) {
    event.extra = { value, delta };
  }
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map(value => ({
      type: value.type || "Error",
      value: "Application error",
      mechanism: value.mechanism
    }));
  }
  event.message = isWebVital && metric ? "web-vital" : event.message ? "Application event" : undefined;
  return event;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    beforeSend: sanitizeMonitoringEvent
  });

  const reportMetric = metric => Sentry.captureMessage("web-vital", {
    level: "info",
    tags: { metric: metric.name, rating: metric.rating },
    extra: { value: metric.value, delta: metric.delta }
  });
  onCLS(reportMetric);
  onINP(reportMetric);
  onLCP(reportMetric);
}

export const monitoringEnabled = Boolean(dsn);
