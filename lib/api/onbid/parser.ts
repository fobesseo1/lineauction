import { parse } from "lossless-json";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { onbidEnvelopeSchema } from "./schemas";
export function parseOnbidResponse(raw: string) {
  let data: unknown;
  if (raw.trimStart().startsWith("<")) {
    if (/<!DOCTYPE|<!ENTITY/i.test(raw) || XMLValidator.validate(raw) !== true)
      throw new Error("Invalid API XML");
    const xml: unknown = new XMLParser({
      parseTagValue: false,
      processEntities: false,
    }).parse(raw);
    data =
      xml && typeof xml === "object" && "response" in xml ? xml.response : xml;
  } else {
    // Parse all numeric tokens to strings BEFORE JavaScript can round large integers.
    const json: unknown = parse(raw, undefined, (value) => value);
    data =
      json && typeof json === "object" && "response" in json
        ? json.response
        : json;
  }
  return onbidEnvelopeSchema.parse(data);
}
