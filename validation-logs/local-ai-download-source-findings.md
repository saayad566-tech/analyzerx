# Local AI Download Source Findings — 2026-08-21

## Reported-device failure

The user device received a 137-byte response for the configured Gemma 3 1B download while the catalog expected 584,417,280 bytes. The app displayed an integrity-size mismatch.

## Reproduction

The existing Gemma URL was queried with a byte range:

`https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/6d54daa71cfbffba6b2843c08eeb1a27e7430bf0/gemma3-1b-it-int4.litertlm?download=true`

It returned HTTP 401, `content-type: text/plain; charset=utf-8`, `content-length: 137`, with this provider message:

> Access to model litert-community/Gemma3-1B-IT is restricted. You must have access to it and be authenticated to access it. Please log in.

Therefore this model must not be offered as an anonymous in-app download.

## Verified public replacement

Source page: https://huggingface.co/litert-community/Qwen3-0.6B

Chosen artifact:

- Repository: `litert-community/Qwen3-0.6B`
- Revision: `8414150f2e9dcc82449bcc9c5abc404b399a4d06`
- File: `qwen3_0_6b_mixed_int4.litertlm`
- Direct URL: `https://huggingface.co/litert-community/Qwen3-0.6B/resolve/8414150f2e9dcc82449bcc9c5abc404b399a4d06/qwen3_0_6b_mixed_int4.litertlm?download=true`
- Size: `497,664,000` bytes
- SHA-256 / Hugging Face LFS OID: `b1baab462f6be49d70eada79d715c2c52cd9ece0cad00bddf6a2c097d23498e9`
- License: Apache-2.0

A range request to this URL returned HTTP 206, `content-type: application/octet-stream`, `content-range: bytes 0-1023/497664000`, and binary `LITERTLM` header bytes. It is anonymous/public.

## Existing Gemma 4 entries

The existing Gemma 4 E2B and E4B artifact URLs both returned HTTP 206 with `application/octet-stream` and `LITERTLM` header bytes for a range request. They remain anonymously downloadable.

## References

- https://huggingface.co/litert-community/Qwen3-0.6B
- https://developers.google.com/edge/litert-lm/android
