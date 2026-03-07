import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import ProposalBuilder from "./pages/ProposalBuilder";
import ProposalView from "./pages/ProposalView";
import LeadForm from "./pages/LeadForm";
import FloorPlanBuilder from "./pages/FloorPlanBuilder";
import Checklist from "./pages/Checklist";
import RunsheetBuilder from "./pages/RunsheetBuilder";
import PaymentTracker from "./pages/PaymentTracker";
import Analytics from "./pages/Analytics";
import ExpressBook from "./pages/ExpressBook";
import MenuManagement from "./pages/MenuManagement";
import EventDetail from "./pages/EventDetail";
import ClientPortal from "./pages/ClientPortal";

function Router() {
  return (
    <Switch>
      {/* Public pages */}
      <Route path="/" component={Home} />
      <Route path="/enquire" component={LeadForm} />
      <Route path="/enquire/:slug" component={LeadForm} />
      <Route path="/proposal/:token" component={ProposalView} />

      {/* Venue owner dashboard */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/proposals/new" component={ProposalBuilder} />
      <Route path="/floor-plan" component={FloorPlanBuilder} />
      <Route path="/checklist" component={Checklist} />
      <Route path="/runsheet" component={RunsheetBuilder} />
      <Route path="/payments" component={PaymentTracker} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/book" component={ExpressBook} />
      <Route path="/event/:id" component={EventDetail} />
      <Route path="/portal/:token" component={ClientPortal} />
      <Route path="/menu" component={MenuManagement} />

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
