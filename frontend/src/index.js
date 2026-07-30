import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Prevent focused number inputs from updating values when scrolling the mouse wheel
document.addEventListener("wheel", () => {
  if (document.activeElement && document.activeElement.type === "number") {
    document.activeElement.blur();
  }
});
