import Hero from "@/components/Hero";

// Home, Tracks and Events share one Hero, so switching between them animates the stage
// (and keeps music playing) instead of loading a new page.
export default function StageLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Hero />
      {children}
    </>
  );
}
