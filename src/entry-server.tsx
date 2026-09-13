import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import App from "./App";

export { publicPages, SITE_URL, renderSeoHead } from "./marketing/seo";

export function render(pathname: string) {
  return renderToString(
    <StrictMode><StaticRouter location={pathname}><App /></StaticRouter></StrictMode>,
  );
}
