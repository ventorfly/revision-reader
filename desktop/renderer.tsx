import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RevisionReader from "../app/page";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Revision Reader could not find its application root.");
}

createRoot(root).render(
  <StrictMode>
    <RevisionReader />
  </StrictMode>,
);
