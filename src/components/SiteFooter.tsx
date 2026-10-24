import { site } from "@/lib/site";

export default async function SiteFooter() {
  "use cache";
  const year = new Date().getFullYear();

  return (
    <footer>
      <p>
        &copy; {year} {site.name}
      </p>
    </footer>
  );
}
