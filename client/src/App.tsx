import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import Home from "./pages/Home";
import EmbedDocs from "./pages/EmbedDocs";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Welcome from "./pages/Welcome";
import Dashboard from "./pages/Dashboard";
import ProposalBuilder from "./pages/ProposalBuilder";
import ProposalView from "./pages/ProposalView";
import LeadForm from "./pages/LeadForm";
import FloorPlanBuilder from "./pages/FloorPlanBuilder";
import FloorPlanShare from "./pages/FloorPlanShare";
import Checklist from "./pages/Checklist";
import RunsheetBuilder from "./pages/RunsheetBuilder";
import PaymentTracker from "./pages/PaymentTracker";
import EventDetail from "./pages/EventDetail";
import ClientPortal from "./pages/ClientPortal";
import StaffPortal from "./pages/StaffPortal";
import StaffChecklist from "./pages/StaffChecklist";
import DailyChecklists from "./pages/DailyChecklists";
import DailyChecklistLive from "./pages/DailyChecklistLive";
import ShiftRunsheetLive from "./pages/ShiftRunsheetLive";
import StaffLinks from "./pages/StaffLinks";
import WeddingChecklist from "./pages/WeddingChecklist";

function Router() {
  return (
    <Switch>
      {/* Public pages */}
      <Route path="/" component={Home} />
      <Route path="/embed-docs" component={EmbedDocs} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/welcome" component={Welcome} />
      <Route path="/enquire" component={LeadForm} />
      <Route path="/enquire/:slug" component={LeadForm} />
      <Route path="/proposal/:token" component={ProposalView} />

      {/* Venue owner dashboard */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/proposals/new" component={ProposalBuilder} />
      <Route path="/floor-plan" component={FloorPlanBuilder} />
      <Route path="/floor-plan/share/:token" component={FloorPlanShare} />
      <Route path="/checklist" component={Checklist} />
      <Route path="/runsheet" component={RunsheetBuilder} />
      <Route path="/payments" component={PaymentTracker} />
      {/* Analytics was folded into Reports as its Goals tab. */}
      <Route path="/analytics"><Redirect to="/dashboard?tab=reports&rtab=goals" /></Route>
      {/* Express Book is unfinished (it dropped the chosen space and package and
          could default to the wrong venue) — send any old link to the real
          enquiry form instead. */}
      <Route path="/book"><Redirect to="/enquire" /></Route>
      <Route path="/event/:id" component={EventDetail} />
      <Route path="/portal/:token" component={ClientPortal} />
      <Route path="/staff/:token" component={StaffPortal} />
      <Route path="/staff-checklist/:token" component={StaffChecklist} />
      <Route path="/daily-checklists" component={DailyChecklists} />
      <Route path="/daily/:token" component={DailyChecklistLive} />
      <Route path="/shift/:token" component={ShiftRunsheetLive} />
      <Route path="/staff-links" component={StaffLinks} />
      <Route path="/wedding-checklist/:token" component={WeddingChecklist} />
      <Route path="/menu"><Redirect to="/dashboard?tab=settings&sub=menu" /></Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <ConfirmProvider>
            <Toaster />
            <Router />
          </ConfirmProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
