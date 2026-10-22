import { Suspense } from "react";
import LocationInventoryReport
  from "@/components/accounting/LocationInventoryReport";

type Props = {
  searchParams: Promise<{
    q?: string;
    location?: string;
    availability?: string;
  }>;
};

async function Content({ searchParams }: Props) {
  const filters = await searchParams;

  return (
    <LocationInventoryReport
      scope="CENTRAL"
      filters={filters}
    />
  );
}

export default function WarehouseInventoryPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading warehouse inventory...</p>}>
      <Content {...props} />
    </Suspense>
  );
}
