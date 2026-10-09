import { z } from "zod";
// Names verified against the official portal's embedded Swagger snapshot.
const text = z
  .union([
    z.string(),
    z.number().refine(Number.isSafeInteger, "Unsafe API integer"),
  ])
  .transform(String);
const optionalText = text.nullish();
const count = text
  .pipe(z.string().regex(/^\d+$/))
  .transform(Number)
  .pipe(z.number().int().nonnegative().safe());
const optionalArea = z.preprocess(
  (value) => (value === "" ? null : value),
  z.coerce.number().nonnegative().nullable().optional(),
);
export const onbidItemSchema = z.object({
  cltrMngNo: text.pipe(z.string().min(1)),
  pbctCdtnNo: text.pipe(z.string().regex(/^\d+$/)),
  onbidPbancNo: optionalText,
  onbidCltrNm: optionalText,
  prptDivNm: optionalText,
  cltrUsgSclsCtgrNm: optionalText,
  cltrUsgMclsCtgrNm: optionalText,
  lctnSdnm: optionalText,
  lctnSggnm: optionalText,
  lctnEmdNm: optionalText,
  apslEvlAmt: optionalText,
  lowstBidPrcIndctCont: optionalText,
  usbdNft: count.nullish(),
  pbctsn: optionalText,
  pbctNsq: optionalText,
  cltrBidBgngDt: optionalText,
  cltrBidEndDt: optionalText,
  pbctStatNm: optionalText,
  pbctStatCd: optionalText,
  dspsMthodNm: optionalText,
  dspsMthodCd: optionalText,
  batcBidYn: z.enum(["Y", "N", ""]).nullish(),
  landSqms: optionalArea,
  bldSqms: optionalArea,
  ltnoPnu: optionalText,
  mdfcnDt: optionalText,
});
export type OnbidItem = z.infer<typeof onbidItemSchema>;
export const onbidEnvelopeSchema = z.object({
  header: z.object({ resultCode: text, resultMsg: z.string() }),
  body: z
    .object({
      totalCount: count,
      pageNo: count,
      numOfRows: count,
      items: z.union([
        z.object({
          item: z
            .union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
            .nullish(),
        }),
        z.literal(""),
        z.null(),
      ]),
    })
    .optional(),
});
