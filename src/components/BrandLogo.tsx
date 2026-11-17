import Image from "next/image";

import { getBrand } from "@/lib/brand";

/** The company's logo (brand settings). `size` is the width and height in pixels. */
export default async function BrandLogo({ size = 40 }: { size?: number }) {
  const brand = await getBrand();
  return (
    <Image
      src={size > 96 ? brand.logoLarge : brand.logoSmall}
      alt={brand.groupName}
      width={size}
      height={size}
      unoptimized
      priority
    />
  );
}
