import Image from "next/image";

/** The Abhiram Group mark. `size` is the width and height in pixels. */
export default function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <Image
      src={size > 96 ? "/brand/abhiram-logo-512.png" : "/brand/abhiram-logo-192.png"}
      alt="Abhiram Group"
      width={size}
      height={size}
      unoptimized
      priority
    />
  );
}
