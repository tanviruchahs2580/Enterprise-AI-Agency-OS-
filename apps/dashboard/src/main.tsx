import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App.tsx";
import Overview from "./pages/Overview.tsx";
import Projects from "./pages/Projects.tsx";
import Tasks from "./pages/Tasks.tsx";
import Delivery from "./pages/Delivery.tsx";
import Agents from "./pages/Agents.tsx";
import Models from "./pages/Models.tsx";
import Security from "./pages/Security.tsx";
import Approvals from "./pages/Approvals.tsx";
import Deployments from "./pages/Deployments.tsx";
import Knowledge from "./pages/Knowledge.tsx";
import Audit from "./pages/Audit.tsx";
import Settings from "./pages/Settings.tsx";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Overview /> },
      { path: "projects", element: <Projects /> },
      { path: "tasks", element: <Tasks /> },
      { path: "delivery", element: <Delivery /> },
      { path: "agents", element: <Agents /> },
      { path: "models", element: <Models /> },
      { path: "security", element: <Security /> },
      { path: "approvals", element: <Approvals /> },
      { path: "deployments", element: <Deployments /> },
      { path: "knowledge", element: <Knowledge /> },
      { path: "audit", element: <Audit /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
