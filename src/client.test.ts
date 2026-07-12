import { describe, expect, test } from "bun:test";
import { ZeroLeaks } from "./client";
import { ZeroLeaksError } from "./errors";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("ZeroLeaks", () => {
  test("validates an API key", () => {
    expect(() => new ZeroLeaks({ apiKey: "invalid" })).toThrow(ZeroLeaksError);
  });

  test("creates scans with bearer authentication", async () => {
    let request: Request | undefined;
    const client = new ZeroLeaks({
      apiKey: "zl_live_test",
      baseUrl: "https://example.test",
      fetch: (input, init) => {
        request = new Request(input, init);
        return Promise.resolve(
          jsonResponse({
            scanId: "scan_1",
            userId: "user_1",
            status: "running",
            processingMethod: "workflow",
            scanMode: "dual",
            knowledgeProfile: "production",
          })
        );
      },
    });

    const result = await client.scans.create({
      systemPrompt: "You are a secure support assistant.",
    });

    expect(result.scanId).toBe("scan_1");
    expect(request?.url).toBe("https://example.test/api/v1/scans");
    expect(request?.headers.get("authorization")).toBe("Bearer zl_live_test");
  });

  test("waits for a completed scan", async () => {
    let polls = 0;
    const client = new ZeroLeaks({
      apiKey: "zl_live_test",
      fetch: () => {
        polls += 1;
        return Promise.resolve(
          jsonResponse({
            scan: {
              id: "scan_1",
              status: polls === 1 ? "running" : "completed",
              source: "dashboard",
              createdAt: 1,
            },
            report: polls === 1 ? null : { overallScore: 100 },
          })
        );
      },
    });

    const result = await client.scans.wait("scan_1", {
      pollIntervalMs: 1,
    });
    expect(result.scan.status).toBe("completed");
    expect(polls).toBe(2);
  });

  test("throws typed API errors", async () => {
    const client = new ZeroLeaks({
      apiKey: "zl_live_test",
      fetch: () =>
        Promise.resolve(
          jsonResponse(
            { error: "Rate limit exceeded", code: "RATE_LIMIT" },
            429
          )
        ),
    });

    try {
      await client.scans.list();
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ZeroLeaksError);
      expect((error as ZeroLeaksError).status).toBe(429);
      expect((error as ZeroLeaksError).code).toBe("RATE_LIMIT");
    }
  });

  test("does not send credentials to public capability discovery", async () => {
    let authorization: string | null = "not-called";
    const client = new ZeroLeaks({
      apiKey: "zl_live_test",
      fetch: (input, init) => {
        const request = new Request(input, init);
        authorization = request.headers.get("authorization");
        return Promise.resolve(
          jsonResponse({
            apiVersion: "v1",
            scanModes: ["dual"],
            targetModels: [],
            defaultTargetModel: "test",
            temperature: { minimum: 0, maximum: 1 },
            reasoningEfforts: [],
            knowledgeProfiles: [],
            attackSurfaces: [],
            limits: {
              minimumSystemPromptCharacters: 10,
              maximumAdaptiveCandidates: 24,
              maximumSkillArchiveBytes: 5_242_880,
            },
          })
        );
      },
    });

    await client.capabilities.get();
    expect(authorization).toBeNull();
  });

  test("encodes report-list pagination", async () => {
    let requestUrl = "";
    const client = new ZeroLeaks({
      apiKey: "zl_live_test",
      fetch: (input) => {
        requestUrl = String(input);
        return Promise.resolve(
          jsonResponse({ items: [], nextCursor: null, hasMore: false })
        );
      },
    });

    await client.reports.list({ cursor: "scan_1", limit: 10 });
    expect(requestUrl).toContain("cursor=scan_1");
    expect(requestUrl).toContain("limit=10");
  });
});
