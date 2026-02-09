import { Suspense, lazy, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/lib/clerkAuth";
import { LoadingSpinner } from "@/components/LoadingSpinner";


const Landing = lazy(() => import("@/pages/landing"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Profile = lazy(() => import("@/pages/profile"));
const Materials = lazy(() => import("@/pages/materials"));
const MaterialDetail = lazy(() => import("@/pages/material-detail"));
const Resources = lazy(() => import("@/pages/resources"));
const QuerySearch = lazy(() => import("@/pages/query-search"));
const Chat = lazy(() => import("@/pages/chat"));
const Flashcards = lazy(() => import("@/pages/flashcards"));
const Quizzes = lazy(() => import("@/pages/quizzes"));
const MindMaps = lazy(() => import("@/pages/mind-maps"));
const Summaries = lazy(() => import("@/pages/summaries"));
const AudioLibrary = lazy(() => import("@/pages/audio-library"));
const Todos = lazy(() => import("@/pages/todos"));
const Pomodoro = lazy(() => import("@/pages/pomodoro"));
const Concentration = lazy(() => import("@/pages/concentration"));
const Leaderboard = lazy(() => import("@/pages/leaderboard"));
const Analytics = lazy(() => import("@/pages/analytics"));
const Collab = lazy(() => import("@/pages/collab"));
const NotFound = lazy(() => import("@/pages/not-found"));

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  
  useEffect(() => {
    if (!isLoading && isAuthenticated && location === "/") {
      
      const urlParams = new URLSearchParams(window.location.search);
      if (!urlParams.has("__clerk_handshake")) {
        setLocation("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Switch>
          <Route path="/" component={Landing} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/profile" component={Profile} />
        <Route path="/materials/:id" component={MaterialDetail} />
        <Route path="/materials" component={Materials} />
        <Route path="/resources" component={Resources} />
        <Route path="/query-search" component={QuerySearch} />
        <Route path="/chat" component={Chat} />
        <Route path="/flashcards" component={Flashcards} />
        <Route path="/quizzes" component={Quizzes} />
        <Route path="/mind-maps" component={MindMaps} />
        <Route path="/summaries" component={Summaries} />
        <Route path="/audio-library" component={AudioLibrary} />
        <Route path="/todos" component={Todos} />
        <Route path="/pomodoro" component={Pomodoro} />
        <Route path="/concentration" component={Concentration} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/collab" component={Collab} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  if (isLoading) {
    return (
      <>
        <Toaster />
        <LoadingSpinner />
      </>
    );
  }

  return (
    <>
      <Toaster />
      {!isAuthenticated ? (
        <Router />
      ) : (
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              <header className="flex items-center justify-between p-4 border-b">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <ThemeToggle />
              </header>
              <main className="flex-1 overflow-y-auto">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
