import { describe, expect, it } from "vitest";
import { sanitizeMonitoringEvent } from "../../src/monitoring.js";

describe("monitoring privacy filter", () => {
  it("drops identity, request data, breadcrumbs and user-provided exception text", () => {
    const input = {
      user: { email: "private@example.test" },
      request: { url: "https://example.test/?token=secret", data: "private content" },
      breadcrumbs: [{ message: "private content" }],
      extra: { token: "secret" },
      contexts: { private: "content" },
      logentry: { message: "private content" },
      culprit: "private route",
      message: "private content",
      exception: { values: [{ type: "Error", value: "secret token/private content", stacktrace: { frames: [] } }] }
    };
    const sanitized = sanitizeMonitoringEvent(input);
    expect(sanitized.user).toBeUndefined();
    expect(sanitized.request).toBeUndefined();
    expect(sanitized.breadcrumbs).toBeUndefined();
    expect(sanitized.extra).toBeUndefined();
    expect(sanitized.contexts).toBeUndefined();
    expect(sanitized.logentry).toBeUndefined();
    expect(sanitized.culprit).toBeUndefined();
    expect(sanitized.message).toBe("Application event");
    expect(sanitized.exception.values[0].value).toBe("Application error");
    expect(JSON.stringify(sanitized)).not.toMatch(/private content|private@example|secret token/);
  });

  it("preserves only the allowlisted numeric Web Vitals fields", () => {
    const sanitized = sanitizeMonitoringEvent({
      message: "web-vital",
      tags: { metric: "LCP", rating: "good", token: "private" },
      extra: { value: 1240, delta: 24, prompt: "private content" }
    });
    expect(sanitized.message).toBe("web-vital");
    expect(sanitized.tags).toEqual({ metric: "LCP", rating: "good" });
    expect(sanitized.extra).toEqual({ value: 1240, delta: 24 });
  });
});
