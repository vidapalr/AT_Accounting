import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Abhiram Textiles | Abhiram Group",
  description: "Cotton sets, everyday essentials and traditional sarees at Abhiram Textiles, Kapra, Hyderabad.",
};

const collections = [
  { title: "Everyday cottons", detail: "Cotton sets · Tops · Leggings · Nighties", image: "cottons.webp", alt: "Soft cotton dress materials with indigo prints" },
  { title: "Traditional sarees", detail: "Cotton · Banaras · Mangalagiri Pattu · Uppada", image: "sarees.webp", alt: "Colourful silk sarees with woven gold borders" },
  { title: "Kalamkari favourites", detail: "Beautiful prints, rooted in tradition", image: "kalamkari.webp", alt: "Kalamkari inspired cotton fabric with botanical prints" },
];

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>Abhiram Textiles<span>A part of Abhiram Group</span></Link>
        <Link href="/login" prefetch={false} className={styles.login}>Login <span aria-hidden="true">↗</span></Link>
      </header>
      <section className={styles.intro} aria-labelledby="welcome">
        <p className={styles.eyebrow}>ELEGANCE IN EVERY THREAD</p>
        <h1 id="welcome">A little colour.<br />A lot of comfort.</h1>
        <p className={styles.description}>Welcome to Abhiram Textiles, your neighbourhood women’s wear shop in Kapra, Hyderabad. Explore comfortable cotton sets, everyday essentials and traditional sarees for moments big and small.</p>
        <p><Link href="/shop" className={styles.login}>Shop online <span aria-hidden="true">→</span></Link></p>
      </section>
      <section className={styles.gallery} aria-label="Our collections">
        {collections.map((collection) => (
          <figure key={collection.title} className={styles.collection}>
            <div className={styles.photo}><Image src={`/images/textiles/${collection.image}`} alt={collection.alt} fill sizes="(max-width: 640px) 100vw, 33vw" unoptimized /></div>
            <figcaption><h2>{collection.title}</h2><p>{collection.detail}</p></figcaption>
          </figure>
        ))}
      </section>
      <footer className={styles.footer}>
        <p>Abhiram Textiles <span>·</span> Kapra, Hyderabad</p>
        <a href="https://abhiraminc.com">Visit Abhiram Group <span aria-hidden="true">↗</span></a>
      </footer>
    </main>
  );
}
