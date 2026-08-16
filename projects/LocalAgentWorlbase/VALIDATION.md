# Validation status

The generated package was validated with the checks available in the generation environment.

## Passed

- 46 executable TypeScript/TSX source files parse with the TypeScript compiler API; `next-env.d.ts` is intentionally excluded from the parser count.
- All 47 TypeScript/TSX/declaration files resolve every local `@/…` import to an existing project file.
- An additional project-wide structural TypeScript pass completed successfully using temporary declarations only for unavailable external packages. This catches internal prop/type/signature mismatches without pretending external library typings were installed.
- Cloud API-key provider detection tests pass for OpenAI-, Anthropic-, and Gemini-style keys plus invalid input.
- SSE parsing passes LF/CRLF and split-chunk boundary tests.
- Ollama-style NDJSON parsing passes split-chunk boundary tests.
- Crawler private-address classification tests pass for loopback, RFC1918/link-local/ULA examples and public IPv4/IPv6 examples.
- `scripts/start-llama.sh` passes `bash -n`.
- `package.json` parses as valid JSON.
- Source scan contains no TODO/FIXME/lorem/dummy implementation markers in application source.

## Environment limitation

A dependency-installed `next build` was not executed in the generation environment because its sandbox package registry does not provide the required public npm packages and no dependency cache was available. Therefore this package does **not** claim a successful dependency-installed production build in this sandbox.

The included GitHub Actions workflow performs the normal release checks in a networked environment:

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

Run those commands after extracting the package and require a green CI run before deploying a release tag.
