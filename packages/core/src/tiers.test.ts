import { inferTier } from "./tiers.js";

describe("inferTier", () => {
  it("maps Anthropic models correctly", () => {
    expect(inferTier("claude-opus-4-6")).toBe("frontier");
    expect(inferTier("claude-sonnet-4-6")).toBe("mid");
    expect(inferTier("claude-haiku-4-5")).toBe("local-large");
  });

  it("maps OpenAI models correctly", () => {
    expect(inferTier("gpt-4o")).toBe("frontier");
    expect(inferTier("gpt-4o-mini")).toBe("frontier"); // prefix match
    expect(inferTier("gpt-3.5-turbo")).toBe("mid");
    expect(inferTier("o1-preview")).toBe("frontier");
  });

  it("maps open-source Ollama models correctly", () => {
    expect(inferTier("llama3:70b")).toBe("mid");
    expect(inferTier("llama3:8b")).toBe("local-large");
    expect(inferTier("phi3:mini")).toBe("local-small");
    expect(inferTier("gemma3:1b")).toBe("local-small");
    expect(inferTier("gemma3:27b")).toBe("mid");
    expect(inferTier("mistral:7b")).toBe("local-large");
  });

  it("is case-insensitive", () => {
    expect(inferTier("Claude-Opus-4-6")).toBe("frontier");
    expect(inferTier("GPT-4O")).toBe("frontier");
    expect(inferTier("LLAMA3:70B")).toBe("mid");
  });

  it("respects user overrides over defaults", () => {
    // Override claude-sonnet to frontier
    expect(inferTier("claude-sonnet-4-6", { "claude-sonnet": "frontier" })).toBe("frontier");
  });

  it("defaults unknown models to local-large", () => {
    expect(inferTier("some-unknown-model-xyz")).toBe("local-large");
  });
});
