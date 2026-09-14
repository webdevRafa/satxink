import { Analytics } from "@vercel/analytics/react";
import { MarketingSite } from "./marketing/MarketingSite";

export default function App() {
  return (
    <>
      <MarketingSite />
      <Analytics mode={import.meta.env.DEV ? "development" : "production"} />
    </>
  );
}
