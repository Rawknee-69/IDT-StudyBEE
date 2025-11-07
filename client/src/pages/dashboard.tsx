import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Brain, FileText, Target, Trophy, Timer, CheckSquare, Flame } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const needsProfile = !user.degree || !user.className;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="font-heading font-bold text-3xl md:text-4xl mb-2" data-testid="text-welcome">
          Welcome back, {user.firstName || user.email}!
        </h1>
        <p className="text-muted-foreground" data-testid="text-subtitle">
          {needsProfile ? "Complete your profile to get started" : "Ready to continue learning?"}
        </p>
      </div>

      {needsProfile && (
        <Card className="p-6 mb-8 bg-warning/10 border-warning" data-testid="card-complete-profile">
          <h3 className="font-heading font-semibold text-xl mb-2">Complete Your Profile</h3>
          <p className="text-muted-foreground mb-4">
            Add your degree and class information to unlock personalized study features.
          </p>
          <Button asChild data-testid="button-complete-profile">
            <Link href="/profile">Complete Profile</Link>
          </Button>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6" data-testid="card-study-time">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Timer className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-study-time">{user.totalStudyTime} min</p>
              <p className="text-sm text-muted-foreground">Total Study Time</p>
            </div>
          </div>
        </Card>

        <Card className="p-6" data-testid="card-streak">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-gamification/10">
              <Flame className="h-6 w-6 text-gamification" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-streak">{user.currentStreak} days</p>
              <p className="text-sm text-muted-foreground">Current Streak</p>
            </div>
          </div>
        </Card>

        <Card className="p-6" data-testid="card-quiz-score">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-success/10">
              <Trophy className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-quiz-score">{user.totalQuizScore}</p>
              <p className="text-sm text-muted-foreground">Total Quiz Score</p>
            </div>
          </div>
        </Card>
      </div>

      <h2 className="font-heading font-semibold text-2xl mb-6">Quick Access</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/materials">
          <Card className="p-6 hover-elevate cursor-pointer" data-testid="card-materials">
            <BookOpen className="h-10 w-10 text-primary mb-3" />
            <h3 className="font-heading font-semibold text-lg mb-1">Study Materials</h3>
            <p className="text-sm text-muted-foreground">Upload and manage PDFs</p>
          </Card>
        </Link>

        <Link href="/chat">
          <Card className="p-6 hover-elevate cursor-pointer" data-testid="card-ai-chat">
            <Brain className="h-10 w-10 text-secondary mb-3" />
            <h3 className="font-heading font-semibold text-lg mb-1">AI Chat</h3>
            <p className="text-sm text-muted-foreground">Ask study questions</p>
          </Card>
        </Link>

        <Link href="/flashcards">
          <Card className="p-6 hover-elevate cursor-pointer" data-testid="card-flashcards">
            <FileText className="h-10 w-10 text-warning mb-3" />
            <h3 className="font-heading font-semibold text-lg mb-1">Flashcards</h3>
            <p className="text-sm text-muted-foreground">Study with AI cards</p>
          </Card>
        </Link>

        <Link href="/quizzes">
          <Card className="p-6 hover-elevate cursor-pointer" data-testid="card-quizzes">
            <Target className="h-10 w-10 text-success mb-3" />
            <h3 className="font-heading font-semibold text-lg mb-1">Quizzes</h3>
            <p className="text-sm text-muted-foreground">Test your knowledge</p>
          </Card>
        </Link>

        <Link href="/leaderboard">
          <Card className="p-6 hover-elevate cursor-pointer" data-testid="card-leaderboard">
            <Trophy className="h-10 w-10 text-gamification mb-3" />
            <h3 className="font-heading font-semibold text-lg mb-1">Leaderboard</h3>
            <p className="text-sm text-muted-foreground">See your rankings</p>
          </Card>
        </Link>

        <Link href="/todos">
          <Card className="p-6 hover-elevate cursor-pointer" data-testid="card-todos">
            <CheckSquare className="h-10 w-10 text-primary mb-3" />
            <h3 className="font-heading font-semibold text-lg mb-1">To-Do List</h3>
            <p className="text-sm text-muted-foreground">Manage your tasks</p>
          </Card>
        </Link>

        <Link href="/pomodoro">
          <Card className="p-6 hover-elevate cursor-pointer" data-testid="card-pomodoro">
            <Timer className="h-10 w-10 text-destructive mb-3" />
            <h3 className="font-heading font-semibold text-lg mb-1">Pomodoro</h3>
            <p className="text-sm text-muted-foreground">Focus timer</p>
          </Card>
        </Link>

        <Link href="/concentration">
          <Card className="p-6 hover-elevate cursor-pointer" data-testid="card-concentration">
            <Brain className="h-10 w-10 text-secondary mb-3" />
            <h3 className="font-heading font-semibold text-lg mb-1">Concentration</h3>
            <p className="text-sm text-muted-foreground">Focus mode</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
