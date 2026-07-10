import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWireFetch } from "./playground-logic";

afterEach(() => vi.unstubAllGlobals());

describe("playground provider wire requests", () => {
  it.each([
    {
      name: "Responses",
      path: "/v1/responses",
      auth: ["authorization", "Bearer secret"],
      model: () => createOpenAI({ baseURL: "/v1", apiKey: "secret", fetch: createWireFetch({ temperature: 0.7, seed: 4 }) }).responses("test-model"),
      response: {
        id: "resp_1", object: "response", created_at: 1, model: "test-model", status: "completed",
        output: [{ id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ok", annotations: [] }] }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    },
    {
      name: "Chat Completions",
      path: "/v1/chat/completions",
      auth: ["authorization", "Bearer secret"],
      model: () => createOpenAI({ baseURL: "/v1", apiKey: "secret", fetch: createWireFetch({ temperature: 0.7, seed: 4 }) }).chat("test-model"),
      response: {
        id: "chat_1", object: "chat.completion", created: 1, model: "test-model",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
    },
    {
      name: "Messages",
      path: "/v1/messages",
      auth: ["x-api-key", "secret"],
      model: () => createAnthropic({ baseURL: "/v1", apiKey: "secret", fetch: createWireFetch({ temperature: 0.7, metadata: { test: true } }) })("test-model"),
      response: {
        id: "msg_1", type: "message", role: "assistant", model: "test-model",
        content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    },
  ])("uses the $name path, auth and merged non-streaming body", async ({ auth, model, path, response }) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
    });

    const result = await generateText({ model: model(), prompt: "hello", maxRetries: 0 });
    expect(result.text).toBe("ok");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(path);
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get(auth[0]!)).toBe(auth[1]);
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.model).toBe("test-model");
    expect(body).not.toHaveProperty("stream");
    expect(body.temperature).toBe(0.7);
    if (path === "/v1/messages") expect(body.metadata).toEqual({ test: true });
    else expect(body.seed).toBe(4);
  });

  it("sets stream true for streaming calls", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      const events = [
        'data: {"id":"chat_1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"ok"},"finish_reason":null}]}',
        'data: {"id":"chat_1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        "data: [DONE]",
        "",
      ].join("\n\n");
      return new Response(events, { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    const model = createOpenAI({ baseURL: "/v1", apiKey: "secret", fetch: createWireFetch({ seed: 9 }) }).chat("test-model");
    const result = streamText({ model, prompt: "hello", maxRetries: 0 });
    let text = "";
    for await (const delta of result.textStream) text += delta;
    expect(text).toBe("ok");
    expect(JSON.parse(String(calls[0]!.body))).toMatchObject({ model: "test-model", stream: true, seed: 9 });
  });
});
