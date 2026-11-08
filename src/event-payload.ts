export const RUNTIME_EVENT_PAYLOAD_ENCODING = "base64+json";

export interface RuntimeEventCompletion {
  error?: string;
  response?: unknown;
}

export interface EncodedRuntimeEventCompletion {
  claimToken: string;
  encoding: typeof RUNTIME_EVENT_PAYLOAD_ENCODING;
  payload: string;
}

const CHUNK_SIZE = 0x80_00;

const bytesToBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + CHUNK_SIZE)
    );
  }
  return btoa(binary);
};

// Agent replies quote the attack payloads the scan sent them, so a plain JSON
// body trips WAF rules on the way back to ZeroLeaks. The completion travels
// as an opaque base64 blob and the API decodes it.
export const encodeRuntimeEventCompletion = (
  claimToken: string,
  completion: RuntimeEventCompletion
): EncodedRuntimeEventCompletion => ({
  claimToken,
  encoding: RUNTIME_EVENT_PAYLOAD_ENCODING,
  payload: bytesToBase64(
    new TextEncoder().encode(
      JSON.stringify({
        ...(completion.error === undefined ? {} : { error: completion.error }),
        ...(completion.response === undefined
          ? {}
          : { response: completion.response }),
      })
    )
  ),
});
