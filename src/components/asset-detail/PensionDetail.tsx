import { PensionCapitalDetail } from "@/components/asset-detail/PensionCapitalDetail";
import { PensionIncomeDetail } from "@/components/asset-detail/PensionIncomeDetail";
import { isCapitalPension } from "@/lib/pension";
import type { StaticAsset } from "@/lib/supabase";

interface Props {
  asset: StaticAsset;
  birthYear: number | null;
}

// Pension detail dispatcher: capital (dc) pots get the projection layout;
// income (db/state) entitlements get the off-balance future-income layout.
export function PensionDetail({ asset, birthYear }: Props) {
  return isCapitalPension(asset)
    ? <PensionCapitalDetail asset={asset} birthYear={birthYear} />
    : <PensionIncomeDetail asset={asset} birthYear={birthYear} />;
}
