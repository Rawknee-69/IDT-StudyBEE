import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Clock, Target, Medal } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type LeaderboardUser = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  totalTime?: number;
  averageScore?: number;
  quizCount?: number;
  rank?: number;
};

export default function Leaderboard() {
  const { user, isAuthenticated } = useAuth();

  const { data: studyTimeLeaderboard, isLoading: studyTimeLoading } = useQuery<LeaderboardUser[]>({
    queryKey: ["/api/leaderboard/study-time"],
    enabled: isAuthenticated,
  });

  const { data: quizScoreLeaderboard, isLoading: quizScoreLoading } = useQuery<LeaderboardUser[]>({
    queryKey: ["/api/leaderboard/quiz-score"],
    enabled: isAuthenticated,
  });

  const getRankColor = (rank: number) => {
    if (rank === 1) return "text-warning";
    if (rank === 2) return "text-muted-foreground";
    if (rank === 3) return "text-warning/60";
    return "text-foreground";
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-6 w-6 text-warning" />;
    if (rank === 2) return <Medal className="h-6 w-6 text-muted-foreground" />;
    if (rank === 3) return <Medal className="h-6 w-6 text-warning/60" />;
    return <span className="text-xl font-bold text-muted-foreground">#{rank}</span>;
  };

  const getUserInitials = (user: LeaderboardUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`;
    }
    return user.email[0].toUpperCase();
  };

  const getUserName = (user: LeaderboardUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email;
  };

  const isCurrentUser = (leaderboardUser: LeaderboardUser) => {
    return leaderboardUser.userId === user?.id;
  };

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8 flex items-center gap-3">
        <Trophy className="h-8 w-8 text-primary" />
        <div className="flex-1">
          <h1 className="text-4xl font-heading font-bold mb-2" data-testid="text-page-title">
            Leaderboards
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Compete with fellow students and track your progress on the global rankings.
          </p>
        </div>
      </div>

      <Tabs defaultValue="study-time" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="study-time" data-testid="tab-study-time">
            <Clock className="h-4 w-4 mr-2" />
            Study Time
          </TabsTrigger>
          <TabsTrigger value="quiz-scores" data-testid="tab-quiz-scores">
            <Target className="h-4 w-4 mr-2" />
            Quiz Scores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="study-time">
          <Card className="p-6">
            <div className="space-y-4">
              {studyTimeLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading rankings...</div>
              ) : studyTimeLeaderboard && studyTimeLeaderboard.length > 0 ? (
                studyTimeLeaderboard.map((leaderUser, index) => (
                  <div
                    key={leaderUser.userId}
                    className={`flex items-center gap-4 p-4 rounded-md hover-elevate ${
                      isCurrentUser(leaderUser) ? "bg-primary/10 border-2 border-primary" : ""
                    }`}
                    data-testid={`leaderboard-item-${index}`}
                  >
                    <div className="w-12 text-center">
                      {getRankIcon(index + 1)}
                    </div>

                    <Avatar className="h-12 w-12">
                      <AvatarImage src={leaderUser.profileImageUrl || undefined} />
                      <AvatarFallback>{getUserInitials(leaderUser)}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <div className="font-semibold flex items-center gap-2">
                        {getUserName(leaderUser)}
                        {isCurrentUser(leaderUser) && (
                          <Badge variant="default" className="text-xs">You</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {leaderUser.email}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold" data-testid={`study-time-${index}`}>
                        {Math.floor((leaderUser.totalTime || 0) / 60)}h{" "}
                        {(leaderUser.totalTime || 0) % 60}m
                      </div>
                      <div className="text-sm text-muted-foreground">Total Study Time</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <Trophy className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground" data-testid="text-empty-state">
                    No study time recorded yet. Start studying to climb the leaderboard!
                  </p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="quiz-scores">
          <Card className="p-6">
            <div className="space-y-4">
              {quizScoreLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading rankings...</div>
              ) : quizScoreLeaderboard && quizScoreLeaderboard.length > 0 ? (
                quizScoreLeaderboard.map((leaderUser, index) => (
                  <div
                    key={leaderUser.userId}
                    className={`flex items-center gap-4 p-4 rounded-md hover-elevate ${
                      isCurrentUser(leaderUser) ? "bg-primary/10 border-2 border-primary" : ""
                    }`}
                    data-testid={`leaderboard-item-${index}`}
                  >
                    <div className="w-12 text-center">
                      {getRankIcon(index + 1)}
                    </div>

                    <Avatar className="h-12 w-12">
                      <AvatarImage src={leaderUser.profileImageUrl || undefined} />
                      <AvatarFallback>{getUserInitials(leaderUser)}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <div className="font-semibold flex items-center gap-2">
                        {getUserName(leaderUser)}
                        {isCurrentUser(leaderUser) && (
                          <Badge variant="default" className="text-xs">You</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {leaderUser.email}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold" data-testid={`quiz-score-${index}`}>
                        {Math.round(leaderUser.averageScore || 0)}%
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {leaderUser.quizCount || 0} {leaderUser.quizCount === 1 ? 'quiz' : 'quizzes'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <Target className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground" data-testid="text-empty-state">
                    No quiz scores yet. Take quizzes to appear on the leaderboard!
                  </p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
