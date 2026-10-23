import { Suspense } from "react";
import LocationInventoryReport from "@/components/accounting/LocationInventoryReport";

type Props = {
  searchParams: Promise<{ q?: string; location?: string; availability?: string }>;
};

async function Content({ searchParams }: Props) {
  const filters = await searchParams;
  return <LocationInventoryReport scope="ALL" filters={filters} />;
}

export default function StockOnHandPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading stock…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
