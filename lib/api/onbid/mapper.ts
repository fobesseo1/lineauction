import type { OnbidItem } from "./schemas";
import { propertyInputSchema, type PropertyInput } from "@/types/property";
import { parseWon } from "@/lib/utils/money";
import { parseKoreanDate } from "@/lib/utils/date";
const nonempty = (v: string | null | undefined) => v?.trim() || null;
export function mapOnbidItem(item: OnbidItem): PropertyInput {
  return propertyInputSchema.parse({
    source: "onbid",
    source_property_id: item.cltrMngNo,
    auction_condition_id: item.pbctCdtnNo,
    notice_id: nonempty(item.onbidPbancNo),
    title: nonempty(item.onbidCltrNm) || item.cltrMngNo,
    property_type: "real_estate",
    usage_type:
      nonempty(item.cltrUsgSclsCtgrNm) || nonempty(item.cltrUsgMclsCtgrNm),
    asset_type: nonempty(item.prptDivNm),
    // TODO: full lot/road address belongs to the separately documented detail API.
    address: null,
    sido: nonempty(item.lctnSdnm),
    sigungu: nonempty(item.lctnSggnm),
    dong: nonempty(item.lctnEmdNm),
    latitude: null,
    longitude: null,
    appraisal_price: parseWon(item.apslEvlAmt),
    minimum_bid_price: parseWon(item.lowstBidPrcIndctCont),
    failed_bid_count: item.usbdNft ?? null,
    auction_round: nonempty(item.pbctsn),
    auction_sequence: nonempty(item.pbctNsq),
    bid_start_at: parseKoreanDate(item.cltrBidBgngDt),
    bid_end_at: parseKoreanDate(item.cltrBidEndDt),
    status: nonempty(item.pbctStatNm),
    status_code: nonempty(item.pbctStatCd),
    disposal_method: nonempty(item.dspsMthodNm),
    disposal_code: nonempty(item.dspsMthodCd),
    bulk_bid: item.batcBidYn ? item.batcBidYn === "Y" : null,
    land_area: item.landSqms ?? null,
    building_area: item.bldSqms ?? null,
    exclusive_area: null,
    pnu: nonempty(item.ltnoPnu),
    source_updated_at: parseKoreanDate(item.mdfcnDt),
  });
}
