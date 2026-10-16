# A-S13 — a plan upload's size is declared, not enforced

Track A, 2026-10-15 night, on `track-a-night`. Source: Track C's security
sweep (`security-sweep.md` on `track-c`, "For Track A"), parked in
`security-parked-a.md`. **Plan plus prepared code only. Nothing is wired,
and no real bucket was touched.**

## 1. The finding (measured)

- `createUploadTicket` and `createMultipartUpload` (`bidPdfsRouter.ts`) check
  the browser's DECLARED `byteSize` against `MAX_PDF_BYTES` (2 GB), then sign
  a URL. **Measured 2026-10-15 with an offline signer:** today's signed PUT
  carries `X-Amz-SignedHeaders=host`, so it binds no size. A signed piece
  (`signParts`) is the same.
- So anyone signed in can put an object of any size on the URL, and
  `confirmAttach` records whatever `byteSize` the caller states. Tickets are
  also unlimited.
- **The harm:** storage cost, paid by us, from someone who already has an
  account. No other company's data is exposed: the key prefix is checked.
- **The disk backend** (local and dev) already counts bytes as they arrive
  (`writeDiskObjectStream`, `received` against the declared size). This is
  R2 only.

## 2. Two independent closes, both prepared in `server/uploadSizeGuard.ts`

| Close | What | Proved without a bucket | Needs R2 to prove |
| --- | --- | --- | --- |
| **A. Bind the size into the signature** | `boundPutInput` / `boundPartInput` add `ContentLength` (each piece's exact length from `shared/multipartPlan.ts`). | Signed headers become `content-length;host` for a PUT and for a piece. Piece lengths sum to the file. | That R2 **refuses** a body whose length differs from the signed `content-length`. S3 does; R2 is S3-compatible, but this is exactly the kind of guess not to make about live. |
| **B. Check what actually landed** | `verifyUploadedSize(store, key, declared)` makes a HEAD at attach time. An object that is not exactly the declared size is refused **and deleted**; a missing one is refused. | Fake store: exact size kept; bigger refused and deleted; smaller (cut off) refused and deleted; over the limit refused; missing refused with nothing deleted. | Only that HEAD returns `ContentLength`, which `r2ObjectExists` already relies on. |

B works on its own, even if A turns out to be ignored by R2: an oversized
object never gets a row, and it is deleted within one request of its
upload. A stops the bytes landing at all. **Do both, B first.**

Tests: `server/uploadSizeGuard.test.ts` (9). The first test pins today's
finding (`host` only).

## 3. The staging proof — before anything reaches live

On `bidrender-plans-staging`, with `pnpm dev:r2`-style credentials **for the
staging bucket**, never the live `R2_PLANS_*`:

1. Sign a PUT with `boundPutInput` for 1,000 bytes. Send exactly 1,000:
   **expect 200**. Send 1,001: **expect 403** (`SignatureDoesNotMatch`).
   Send 999: **expect 403**.
2. The same for one piece of a multipart upload (16 MiB declared, send
   16 MiB + 1).
3. The real browser upload, single and multipart (a ≥ 64 MB set), with A
   and B wired on staging. Then **resume** a multipart upload part-way
   (close the tab, reopen), because resuming re-signs pieces.
4. Read the results into this file. **If any result differs from the
   expectation, stop and find out why before going on.** Either this plan is
   wrong about R2, or the upload is not doing what we think, and those want
   opposite responses.

## 4. Wiring, after the proof (code, no migration)

1. `confirmAttach`: call `verifyUploadedSize`, with a `SizedStore` built on
   `storage.ts`. That needs a new `storageSizeOf(key)` in the storage
   interface: disk `stat`, R2 `HeadObject.ContentLength`. Refuse with its
   message, so no row is written.
2. `r2PresignPut(key, contentType, byteSize)`: use `boundPutInput`.
   `storagePresignPut` passes the size through, and its two callers already
   have it.
3. `signUploadParts`: it receives only `partNumbers` today. Add `byteSize`
   to its input, re-check it against `MAX_PDF_BYTES`, and sign each piece
   with `boundPartInput`. The caller declares the size again, but every piece
   is then bound to a cut of at most 2 GB, and B catches a mismatch at the
   end. The browser (`client/src/lib/…` upload code) passes the size it
   already holds.
4. **A cap on open tickets:** for example 30 tickets per company per hour
   through `server/rateLimit.ts`, the same shape as the other limits. That
   bounds what one account can leave lying around unattached. Leftover
   multipart uploads cost nothing until completed. A lifecycle rule to abort
   incomplete uploads after 7 days is the bucket-side half (owner, Cloudflare
   dashboard).
5. Staging smoke, then live with the next release, in the release plan
   (`next-live-release-plan.md`).

## 5. Risks

- **A wrong guess about R2 breaks every plan upload on live.** That is why A
  waits for § 3.
- The proxy fallback (`planUpload.ts`, same-origin, used when CORS refuses)
  streams with a known `Content-Length` already. Keep B on that path too:
  `confirmAttach` is shared.
- A browser that sends `Transfer-Encoding: chunked` would not match a signed
  length. Browsers send a `Content-Length` for a `Blob` body, so this is not
  expected, but the § 3 browser run is what confirms it.

## 6. Order against the other parked items

Unchanged from `security-parked-a.md`: A-S12 switch first, then the health
check, then this on staging, then Q-SEC1.
