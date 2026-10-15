/**
 * AnalyzerX assistant output guard.
 *
 * The assistant must show the user only the model's user-facing answer. Local
 * and hosted models can leak three kinds of internal material into the visible
 * reply:
 *
 *   1. Reasoning channels — `<think>…</think>` (and friends) that the model uses
 *      internally. An *unclosed* reasoning block (very common mid-stream) must be
 *      suppressed too, not just a balanced pair.
 *   2. Chat-template control tokens — `<|im_start|>`, `<|im_end|>`,
 *      `<|lim_start|>`, `<|lim_end|>`, `<start_of_turn>`, `<|eot_id|>`, and the
 *      rest of the family across the supported model runtimes.
 *   3. The system instruction itself, and native template-error dumps such as
 *      `new_string:` / the "rendered template" INTERNAL error.
 *
 * `sanitizeAssistantOutput` is the single-shot guard (used before a reply is
 * stored). `createStreamingSanitizer` is the streaming guard: it withholds
 * reasoning and control tokens *as they arrive* so nothing internal ever flashes
 * on screen, and holds back a trailing partial token (`<`, `<|im_e`, `<thi`) so a
 * control token is never shown split across two frames.
 *
 * It is deliberately conservative: it only removes material that cannot be part
 * of a legitimate financial answer, so real figures, names and prose are kept.
 */

export type AssistantOutputOptions = {
  /** The system instruction attached to the conversation; used to strip echoes. */
  systemInstruction?: string | null;
  /** Strip reasoning channels. Default true. */
  stripReasoning?: boolean;
  /** Hard cap on returned length, guarding against runaway output. */
  maxChars?: number;
};

/** Reasoning channel tags used by the supported model families. */
const REASONING_TAGS = ["think", "thinking", "reasoning", "analysis", "scratchpad", "reflection"] as const;
const REASONING_OPEN_RE = new RegExp(`<(${REASONING_TAGS.join("|")})>`, "i");
const REASONING_BLOCK_RE = new RegExp(`<(${REASONING_TAGS.join("|")})>[\\s\\S]*?</\\1>`, "gi");
const REASONING_UNCLOSED_RE = new RegExp(`<(${REASONING_TAGS.join("|")})>[\\s\\S]*$`, "i");

/**
 * Any `<|…|>` control token. The generic pattern is intentional: every supported
 * family wraps control tokens in `<|…|>`, and no legitimate financial text
 * contains that shape, so a catch-all cannot damage real content.
 */
const CONTROL_TOKEN_RE = /<\|[^|<>]*\|>/g;
/** Gemma-style turn markers are angle-bracketed without pipes. */
const ANGLE_TURN_RE = /<\/?(?:start_of_turn|end_of_turn|bos|eos)>/gi;
/** A thought/commentary channel block, e.g. `<|channel|>thought … <|message|>`. */
const CHANNEL_THOUGHT_RE = /<\|channel\|>\s*(?:thought|analysis|commentary|reasoning)\b[\s\S]*?(?=<\|message\|>|$)/gi;
/** The native LiteRT template error, including any dumped prompt after it. */
const NATIVE_TEMPLATE_ERROR_RE = /(?:Failed to start\s+)?nativeSendMessageAsync[\s\S]*$/i;
/** Template-diff labels that only appear in native error dumps. */
const TEMPLATE_LABEL_RE = /^\s*(?:old_string|new_string|old|new)\s*:\s*/gim;
/** A leading role label the template may echo at the very start of a reply. */
const ROLE_LINE_RE = /^\s*(?:assistant|model)\s*:?\s*\n/;
const ROLE_COLON_RE = /^\s*(?:assistant|model|analyzerx)\s*:\s*/i;

function stripLeadingRole(text: string): string {
  return text.replace(ROLE_LINE_RE, "").replace(ROLE_COLON_RE, "");
}

function stripControlTokens(text: string): string {
  return text.replace(CONTROL_TOKEN_RE, "").replace(ANGLE_TURN_RE, "");
}

function stripReasoning(text: string): string {
  return text.replace(CHANNEL_THOUGHT_RE, "").replace(REASONING_BLOCK_RE, "").replace(REASONING_UNCLOSED_RE, "");
}

function stripSystemEcho(text: string, systemInstruction?: string | null): string {
  if (!systemInstruction) return text;
  const system = systemInstruction.trim();
  if (!system) return text;
  let result = text;
  // Verbatim echo anywhere in the reply.
  if (result.includes(system)) result = result.split(system).join(" ");
  // A leading echo of the first instruction line (the model restating its brief).
  const firstLine = system.split("\n").map((line) => line.trim()).find((line) => line.length > 0);
  if (firstLine && firstLine.length >= 24) {
    const trimmed = result.trimStart();
    if (trimmed.startsWith(firstLine)) result = trimmed.slice(firstLine.length);
  }
  return result;
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** One-shot guard for a complete reply. */
export function sanitizeAssistantOutput(text: string, options: AssistantOutputOptions = {}): string {
  const { systemInstruction = null, stripReasoning: doReasoning = true, maxChars } = options;
  if (typeof text !== "string" || !text) return "";
  let result = text;
  result = result.replace(NATIVE_TEMPLATE_ERROR_RE, "");
  result = result.replace(TEMPLATE_LABEL_RE, "");
  if (doReasoning) result = stripReasoning(result);
  result = stripControlTokens(result);
  result = stripSystemEcho(result, systemInstruction);
  result = stripLeadingRole(result);
  result = tidy(result);
  if (typeof maxChars === "number" && maxChars > 0 && result.length > maxChars) result = result.slice(0, maxChars).trim();
  return result;
}

export type StreamingSanitizer = {
  /** Feed a raw token; returns only the safe text that may be shown now. */
  push(chunk: string): string;
  /** Emit anything still held back at end of stream. */
  flush(): string;
  /** True once a reasoning channel was withheld. */
  readonly suppressedReasoning: boolean;
};

const PARTIAL_TAG_RE = /<\|?[A-Za-z0-9_/|]{0,15}$/;

/**
 * Streaming guard. Withholds reasoning and control tokens as they stream and
 * holds back a trailing partial token so control syntax never flashes.
 */
export function createStreamingSanitizer(options: AssistantOutputOptions = {}): StreamingSanitizer {
  const { systemInstruction = null, stripReasoning: doReasoning = true, maxChars } = options;
  let buffer = "";
  let inReasoning = false;
  let suppressedReasoning = false;
  let emittedLength = 0;

  function findEarliest(regexes: RegExp[]): { index: number; length: number; kind: "reasoning" | "token" } | null {
    let best: { index: number; length: number; kind: "reasoning" | "token" } | null = null;
    const sources: Array<{ re: RegExp; kind: "reasoning" | "token" }> = [
      ...regexes.map((re) => ({ re, kind: "reasoning" as const })),
      { re: CONTROL_TOKEN_RE, kind: "token" as const },
      { re: ANGLE_TURN_RE, kind: "token" as const },
      { re: CHANNEL_THOUGHT_RE, kind: "token" as const },
    ];
    for (const { re, kind } of sources) {
      re.lastIndex = 0;
      const match = re.exec(buffer);
      if (match && match.index >= 0 && (!best || match.index < best.index)) {
        best = { index: match.index, length: match[0].length, kind };
      }
    }
    return best;
  }

  function drain(final: boolean): string {
    let out = "";
    for (;;) {
      if (inReasoning) {
        const closeRe = new RegExp(`</(?:${REASONING_TAGS.join("|")})>`, "i");
        const close = closeRe.exec(buffer);
        if (close && close.index >= 0) {
          buffer = buffer.slice(close.index + close[0].length);
          inReasoning = false;
          continue;
        }
        // No close yet: discard, but keep a short tail to catch a partial close tag.
        buffer = final ? "" : buffer.slice(Math.max(0, buffer.length - 12));
        break;
      }

      const hit = findEarliest(doReasoning ? [REASONING_OPEN_RE] : []);
      if (hit) {
        out += buffer.slice(0, hit.index);
        const matched = buffer.slice(hit.index, hit.index + hit.length);
        if (hit.kind === "reasoning") {
          inReasoning = true;
          suppressedReasoning = true;
          buffer = buffer.slice(hit.index + matched.length);
        } else {
          buffer = buffer.slice(hit.index + matched.length);
        }
        continue;
      }

      if (final) {
        out += buffer;
        buffer = "";
        break;
      }

      // Hold back a trailing partial control token / reasoning tag.
      const partial = PARTIAL_TAG_RE.exec(buffer);
      if (partial && partial.index >= 0 && partial.index + partial[0].length === buffer.length) {
        out += buffer.slice(0, partial.index);
        buffer = buffer.slice(partial.index);
        break;
      }

      out += buffer;
      buffer = "";
      break;
    }
    return out;
  }

  const normalizedSystem = systemInstruction ? systemInstruction.replace(/\s+/g, " ").trimStart() : "";
  let leadBuffer = "";
  let emitted = false;

  function finalize(text: string, leading: boolean): string {
    const stripped = stripControlTokens(text);
    return leading ? stripLeadingRole(stripSystemEcho(stripped, systemInstruction)) : stripped;
  }

  function cap(text: string): string {
    if (typeof maxChars === "number" && maxChars > 0) {
      const remaining = maxChars - emittedLength;
      if (remaining <= 0) return "";
      if (text.length > remaining) return text.slice(0, remaining);
    }
    return text;
  }

  return {
    push(chunk: string): string {
      if (typeof chunk !== "string" || !chunk) return "";
      buffer += chunk;
      const drained = drain(false);

      // Before anything is emitted, hold the opening text while it could still
      // be a system-instruction echo, so the prompt never flashes on screen.
      if (!emitted && normalizedSystem) {
        leadBuffer += drained;
        const normalizedPending = leadBuffer.replace(/\s+/g, " ").trimStart();
        const stillEcho = normalizedSystem.startsWith(normalizedPending) && leadBuffer.length <= normalizedSystem.length + 4;
        if (stillEcho) return "";
        const out = cap(finalize(leadBuffer, true));
        emitted = true;
        emittedLength += out.length;
        leadBuffer = "";
        return out;
      }

      const out = cap(finalize(drained, false));
      emitted = true;
      emittedLength += out.length;
      return out;
    },
    flush(): string {
      const drained = drain(true);
      const wasLeading = !emitted;
      const pending = wasLeading ? leadBuffer + drained : drained;
      const out = finalize(pending, wasLeading);
      emitted = true;
      leadBuffer = "";
      return out;
    },
    get suppressedReasoning() {
      return suppressedReasoning;
    },
  };
}
