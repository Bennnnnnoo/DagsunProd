import type { Metadata } from "next";
import MenuBar from "@/components/MenuBar";
import { display } from "@/lib/fonts";
import { site } from "@/lib/site";
import { themeInitScript } from "@/lib/themeScript";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: site.name, template: `%s | ${site.name}` },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme may be set by the init script before React hydrates.
    <html lang="en" className={display.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <MenuBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
