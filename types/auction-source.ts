import type { PropertyInput } from "./property";
export interface AuctionPage {
  items: PropertyInput[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  rejected: number;
}
export interface AuctionSource {
  fetchActiveProperties(pageNo: number): Promise<AuctionPage>;
  fetchPropertyDetail(
    propertyId: string,
    conditionId?: string,
  ): Promise<PropertyInput>;
}
