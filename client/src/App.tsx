import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Venues from "./pages/Venues";
import VenueDetail from "./pages/VenueDetail";
import OwnerDashboard from "./pages/OwnerDashboard";
import PlannerPortal from "./pages/PlannerPortal";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/venues" component={Venues} />
      <Route path="/venues/:slug" component={VenueDetail} />
      <Route path="/owner/dashboard" component={OwnerDashboard} />
      <Route path="/planner/portal" component={PlannerPortal} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
