import { useState, useMemo } from "react";
import { useAuth } from "@/lib/clerkAuth";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import {  Target, Clock,  Flame, BarChart3 } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { LineChart, Line,  AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { format, addDays, isSameDay, getHours } from "date-fns";

type UserStats = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  degree: string | null;
  className: string | null;
  totalStudyTime: number; 
  currentStreak: number; 
  longestStreak: number; 
  totalQuizScore: number;
  quizzesCompleted: number;
};

type QuizAttempt = {
  id: string;
  quizId: string;
  score: number;
  totalQuestions: number;
  completedAt: string;
  isCancelled: boolean;
};

type StudySession = {
  id: string;
  startTime: string;
  endTime: string | null;
  duration: number; 
  tabSwitches: number;
  timeWasted: number; 
  isConcentrationMode: boolean;
  pauseCount: number;
  pauseDuration: number; 
};

export default function Analytics() {
  const { user, isAuthenticated } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"days" | "weeks" | "months">("days");

  const { data: userStats, isLoading: userStatsLoading } = useQuery<UserStats>({
    queryKey: ["/api/auth/user"],
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: quizAttempts, isLoading: quizAttemptsLoading } = useQuery<QuizAttempt[]>({
    queryKey: ["/api/quiz-attempts"],
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: studySessions, isLoading: studySessionsLoading } = useQuery<StudySession[]>({
    queryKey: ["/api/study-sessions"],
    enabled: isAuthenticated,
    retry: false,
  });

  
  const getQuizAccuracyForDay = (day: Date): number | null => {
    if (!quizAttempts) return null;
    const dayAttempts = quizAttempts.filter(a => {
      if (a.isCancelled) return false;
      try {
        const attemptDate = new Date(a.completedAt);
        return isSameDay(attemptDate, day);
      } catch {
        return false;
      }
    });
    if (dayAttempts.length === 0) return null;
    const totalScore = dayAttempts.reduce((sum, a) => sum + a.score, 0);
    return Math.round(totalScore / dayAttempts.length);
  };

  
  const dateList = useMemo(() => {
    const dates = [];
    for (let i = -6; i <= 7; i++) {
      dates.push(addDays(selectedDate, i));
    }
    return dates;
  }, [selectedDate]);

  
  const quizTrendData = useMemo(() => {
    const trendDates = [];
    for (let i = 6; i >= 0; i--) {
        trendDates.push(addDays(selectedDate, -i));
    }
    
    return trendDates.map(date => ({
        timeLabel: format(date, "EEE"), 
        fullDate: format(date, "MMM dd"),
        quizAccuracy: getQuizAccuracyForDay(date)
    }));
  }, [selectedDate, quizAttempts]);

  
  
  const chartData = useMemo(() => {
    
    const getFocusTimeForDay = (day: Date): number => {
      if (!studySessions) return 0;
      return studySessions
        .filter(s => {
          if (!s.isConcentrationMode) return false;
          try {
            const sessionDate = new Date(s.startTime);
            return isSameDay(sessionDate, day);
          } catch {
            return false;
          }
        })
        .reduce((sum, s) => sum + (s.duration || 0), 0);
    };

    
    const hadStudySession = (day: Date): boolean => {
      if (!studySessions) return false;
      const dailyDuration = studySessions
        .filter(s => {
          if (!s.isConcentrationMode) return false;
          try {
            const sessionDate = new Date(s.startTime);
            return isSameDay(sessionDate, day);
          } catch {
            return false;
          }
        })
        .reduce((sum, s) => sum + (s.duration || 0), 0);
      
      return dailyDuration >= 1;
    };

    if (viewMode === "days") {
      
      const hourlyData = Array.from({ length: 24 }, (_, i) => {
        const date = new Date(selectedDate);
        date.setHours(i, 0, 0, 0);
        return {
          hour: i,
          timeLabel: format(date, "h a"),
          studyTime: 0,
          goal: 30 + Math.sin(i / 3) * 10,
          quizAccuracy: 0,
          focusTime: 0,
          streak: 0,
        };
      });

      if (!studySessions || studySessions.length === 0) {
        return hourlyData;
      }

      const daySessions = studySessions.filter(s => {
        if (!s.isConcentrationMode || !s.startTime) return false;
        try {
          const sessionDate = new Date(s.startTime);
          if (isNaN(sessionDate.getTime())) return false;
          return isSameDay(sessionDate, selectedDate);
        } catch {
          return false;
        }
      });

      
      const dayQuizAccuracy = getQuizAccuracyForDay(selectedDate) ?? 0;
      
      
      let streakCount = 0;
      let checkDate = new Date(selectedDate);
      while (hadStudySession(checkDate)) {
        streakCount++;
        checkDate = addDays(checkDate, -1);
      }

      
      let cumulativeFocus = 0;

      
      daySessions.forEach(session => {
        try {
          const startTime = new Date(session.startTime);
          if (isNaN(startTime.getTime())) return;
          
          const startHour = getHours(startTime);
          const startMinutes = startTime.getMinutes();
          const duration = session.duration || 0;
          
          if (duration > 0 && startHour >= 0 && startHour < 24) {
            let remainingDuration = duration;
            let currentHour = startHour;
            let currentMinute = startMinutes;
            
            while (remainingDuration > 0 && currentHour < 24) {
              const minutesInCurrentHour = 60 - currentMinute;
              const durationForThisHour = Math.min(remainingDuration, minutesInCurrentHour);
              
              if (hourlyData[currentHour]) {
                hourlyData[currentHour].studyTime += durationForThisHour;
              }
              
              remainingDuration -= durationForThisHour;
              currentHour++;
              currentMinute = 0;
            }
          }
        } catch (error) {
          console.error("Error processing session:", error);
        }
      });

      
      hourlyData.forEach((data, index) => {
        cumulativeFocus += data.studyTime;
        data.focusTime = cumulativeFocus;
        data.quizAccuracy = dayQuizAccuracy;
        data.streak = streakCount;
      });

      return hourlyData;
    } else if (viewMode === "weeks") {
      
      const weekStart = new Date(selectedDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      
      const weekData = Array.from({ length: 7 }, (_, i) => {
        const day = addDays(weekStart, i);
        
        
        let streakCount = 0;
        let checkDate = new Date(day);
        while (hadStudySession(checkDate)) {
          streakCount++;
          checkDate = addDays(checkDate, -1);
        }
        
        return {
          date: day,
          timeLabel: format(day, "EEE"),
          studyTime: 0,
          goal: 60,
          quizAccuracy: getQuizAccuracyForDay(day) ?? 0,
          focusTime: getFocusTimeForDay(day),
          streak: streakCount,
        };
      });

      if (studySessions) {
        studySessions
          .filter(s => s.isConcentrationMode)
          .forEach(session => {
            try {
              const sessionDate = new Date(session.startTime);
              const dayIndex = Math.floor((sessionDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
              if (dayIndex >= 0 && dayIndex < 7 && weekData[dayIndex]) {
                weekData[dayIndex].studyTime += session.duration || 0;
              }
            } catch {
              
            }
          });
      }

      return weekData;
    } else if (viewMode === "months") {
      
      const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
      const weeksInMonth = Math.ceil((monthEnd.getDate() + monthStart.getDay()) / 7);
      
      const monthData = Array.from({ length: Math.min(weeksInMonth, 5) }, (_, i) => {
        const weekStartDate = addDays(monthStart, i * 7 - monthStart.getDay());
        const weekEndDate = addDays(weekStartDate, 6);
        
        
        let totalAccuracy = 0;
        let daysWithQuizzes = 0;
        let totalFocus = 0;
        let maxStreak = 0;
        
        for (let d = 0; d < 7; d++) {
          const day = addDays(weekStartDate, d);
          const dayAccuracy = getQuizAccuracyForDay(day);
          if (dayAccuracy !== null && dayAccuracy > 0) {
            totalAccuracy += dayAccuracy;
            daysWithQuizzes++;
          }
          totalFocus += getFocusTimeForDay(day);
          
          
          let streakCount = 0;
          let checkDate = new Date(day);
          while (hadStudySession(checkDate)) {
            streakCount++;
            checkDate = addDays(checkDate, -1);
          }
          maxStreak = Math.max(maxStreak, streakCount);
        }
        
        return {
          date: weekStartDate,
          timeLabel: `Week ${i + 1}`,
          studyTime: 0,
          goal: 300,
          quizAccuracy: daysWithQuizzes > 0 ? Math.round(totalAccuracy / daysWithQuizzes) : 0,
          focusTime: totalFocus,
          streak: maxStreak,
        };
      });

      if (studySessions) {
        studySessions
          .filter(s => s.isConcentrationMode)
          .forEach(session => {
            try {
              const sessionDate = new Date(session.startTime);
              if (sessionDate >= monthStart && sessionDate <= monthEnd) {
                const weekIndex = Math.floor((sessionDate.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24 * 7));
                if (weekIndex >= 0 && weekIndex < monthData.length && monthData[weekIndex]) {
                  monthData[weekIndex].studyTime += session.duration || 0;
                }
              }
            } catch {
              
            }
          });
      }

      return monthData;
    }
    
    return [];
  }, [studySessions, quizAttempts, selectedDate, viewMode]);

  
  const validQuizAttempts = quizAttempts?.filter(a => !a.isCancelled) || [];
  const concentrationSessions = studySessions?.filter(s => s.isConcentrationMode) || [];
  
  
  const averageQuizScore = userStats?.quizzesCompleted && userStats.quizzesCompleted > 0
    ? Math.round((userStats.totalQuizScore || 0) / userStats.quizzesCompleted)
    : 0;

  const totalFocusTime = concentrationSessions.reduce((sum, s) => sum + (s.duration || 0), 0);

  
  const mainChartConfig: ChartConfig = {
    studyTime: {
      label: "Study Time",
      color: "hsl(var(--gamification))", 
    },
    goal: {
      label: "Goal",
      color: "hsl(var(--warning))", 
    },
    quizAccuracy: {
      label: "Quiz Accuracy",
      color: "hsl(217, 91%, 60%)", 
    },
    focusTime: {
      label: "Focus Time",
      color: "hsl(var(--primary))", 
    },
    streak: {
      label: "Study Streak",
      color: "hsl(24, 100%, 50%)", 
    },
  };

  
  const isLoading = userStatsLoading || quizAttemptsLoading || studySessionsLoading;

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!userStats) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Unable to load user statistics. Please refresh the page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-heading font-bold" data-testid="text-page-title">
          Statistics
        </h1>
        <div className="flex bg-card border rounded-full p-1 gap-1 self-start md:self-auto">
            {(["days", "weeks", "months"] as const).map((mode) => (
                <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                        "px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize",
                        viewMode === mode 
                            ? "bg-primary/20 text-primary" 
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    {mode}
                </button>
            ))}
        </div>
      </div>

      {}
      <div className="flex gap-3 overflow-x-auto pb-4 mb-6 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 snap-x">
        {dateList.map((date, i) => {
          const isSelected = isSameDay(date, selectedDate);
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(date)}
              className={cn(
                "snap-center flex flex-col items-center justify-center min-w-[4.5rem] h-20 rounded-2xl border transition-all duration-200 flex-shrink-0",
                isSelected
                  ? "bg-gamification/20 border-gamification text-gamification shadow-lg shadow-gamification/10 scale-105 ring-1 ring-gamification/50"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:bg-card/80"
              )}
            >
              <span className="text-xl font-bold mb-1">{format(date, "dd")}</span>
              <span className="text-xs uppercase font-medium">{format(date, "EEE")}</span>
            </button>
          );
        })}
      </div>

      {}
      <Card className="p-6 mb-8 border-none bg-gradient-to-b from-card to-background shadow-xl rounded-[2rem]">
        {}
        <div className="flex flex-wrap gap-4 mb-4 px-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gamification"></div>
            <span className="text-xs text-muted-foreground">Study Time</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary"></div>
            <span className="text-xs text-muted-foreground">Focus Time</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(24, 100%, 50%)' }}></div>
            <span className="text-xs text-muted-foreground">Streak Days</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-warning" style={{ borderTop: '2px dashed hsl(var(--warning))' }}></div>
            <span className="text-xs text-muted-foreground">Goal</span>
          </div>
        </div>
        <div className="h-[350px] w-full">
          {chartData.length > 0 ? (
            <ChartContainer config={mainChartConfig} className="h-full w-full">
                <AreaChart data={chartData} margin={{ top: 20, right: 30, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorStudyTime" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--gamification))" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="hsl(var(--gamification))" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorFocusTime" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.3} />
                    <XAxis 
                        dataKey="timeLabel" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        dy={10}
                        interval={viewMode === "days" ? 3 : 0} 
                    />
                    <YAxis 
                        yAxisId="left"
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        tickFormatter={(value) => viewMode === "days" ? `${Math.round(value)}m` : `${Math.round(value / 60)}h`}
                    />
                    <YAxis 
                        yAxisId="right"
                        orientation="right"
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        tickFormatter={(value) => `${Math.round(value)}`}
                        domain={[0, 100]}
                    />
                    <ChartTooltip 
                      content={<ChartTooltipContent indicator="line" />}
                    />
                    
                    {}
                    <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="focusTime"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="url(#colorFocusTime)"
                        fillOpacity={1}
                        activeDot={{ r: 4, strokeWidth: 0, fill: "hsl(var(--primary))" }}
                        isAnimationActive={true}
                    />

                    {}
                    <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="studyTime"
                        stroke="hsl(var(--gamification))"
                        strokeWidth={3}
                        fill="url(#colorStudyTime)"
                        fillOpacity={1}
                        activeDot={{ r: 6, strokeWidth: 0, fill: "hsl(var(--gamification))" }}
                        isAnimationActive={true}
                    />
                    
                    {}
                    <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="goal"
                        stroke="hsl(var(--warning))"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        activeDot={false}
                        isAnimationActive={true}
                    />

                    {}
                    <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="quizAccuracy"
                        stroke="hsl(217, 91%, 60%)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "hsl(217, 91%, 60%)" }}
                        activeDot={{ r: 5, strokeWidth: 0, fill: "hsl(217, 91%, 60%)" }}
                        isAnimationActive={true}
                    />

                    {}
                    <Line
                        yAxisId="left"
                        type="stepAfter"
                        dataKey="streak"
                        stroke="hsl(24, 100%, 50%)"
                        strokeWidth={3}
                        dot={{ r: 5, fill: "hsl(24, 100%, 50%)", stroke: "hsl(24, 100%, 30%)", strokeWidth: 2 }}
                        activeDot={{ r: 7, strokeWidth: 0, fill: "hsl(24, 100%, 50%)" }}
                        isAnimationActive={true}
                    />
                </AreaChart>
            </ChartContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No data available</p>
                <p className="text-sm mt-2">Start a concentration session to see your statistics</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="p-6 border bg-card/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl" style={{ backgroundColor: "hsla(24, 100%, 50%, 0.1)" }}>
              <Flame className="h-5 w-5" style={{ color: "hsl(24, 100%, 50%)" }} />
            </div>
            <div>
              <h3 className="font-semibold">Current Streak</h3>
              <p className="text-xs text-muted-foreground">Days of consistent study</p>
            </div>
          </div>
          <div className="text-4xl font-bold mb-2" style={{ color: "hsl(24, 100%, 50%)" }}>
            {userStats.currentStreak}
          </div>
          <div className="text-sm text-muted-foreground">
            Longest: {userStats.longestStreak} days
          </div>
        </Card>

        <Card className="p-6 border bg-card/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl" style={{ backgroundColor: "hsla(217, 91%, 60%, 0.1)" }}>
              <Target className="h-5 w-5" style={{ color: "hsl(217, 91%, 60%)" }} />
            </div>
            <div>
              <h3 className="font-semibold">Quiz Accuracy</h3>
              <p className="text-xs text-muted-foreground">Average score</p>
            </div>
          </div>
          <div className="text-4xl font-bold mb-2" style={{ color: "hsl(217, 91%, 60%)" }}>
            {averageQuizScore}%
          </div>
          <div className="text-sm text-muted-foreground">
            {validQuizAttempts.length} quiz{validQuizAttempts.length !== 1 ? 'zes' : ''} completed
          </div>
        </Card>

        <Card className="p-6 border bg-card/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Total Focus</h3>
              <p className="text-xs text-muted-foreground">Time in concentration</p>
            </div>
          </div>
          <div className="text-4xl font-bold text-primary mb-2">
            {Math.floor(totalFocusTime / 60)}h
          </div>
          <div className="text-sm text-muted-foreground">
            {totalFocusTime % 60}m total
          </div>
        </Card>
      </div>

      {}
      <Card className="p-6 mt-8 border-none bg-gradient-to-b from-card to-background shadow-xl rounded-[2rem]">
        <div className="flex items-center gap-2 mb-6">
            <div className="p-2 rounded-xl" style={{ backgroundColor: 'hsla(217, 91%, 60%, 0.1)' }}>
                <Target className="h-5 w-5" style={{ color: 'hsl(217, 91%, 60%)' }} />
            </div>
            <h3 className="font-heading font-semibold text-xl">Quiz Accuracy Trend</h3>
        </div>
        <div className="h-[300px] w-full">
            {quizTrendData.some(d => d.quizAccuracy !== null) ? (
            <ChartContainer config={mainChartConfig} className="h-full w-full">
                <LineChart data={quizTrendData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.3} />
                    <XAxis 
                        dataKey="timeLabel" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        dy={10}
                    />
                    <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        tickFormatter={(value) => `${Math.round(value)}%`}
                        domain={[0, 100]}
                    />
                    <ChartTooltip 
                        content={<ChartTooltipContent indicator="line" />}
                        labelFormatter={(value, payload) => {
                            if (payload && payload[0] && payload[0].payload) {
                                return payload[0].payload.fullDate;
                            }
                            return value;
                        }}
                    />
                    <Line
                        type="monotone"
                        dataKey="quizAccuracy"
                        stroke="hsl(217, 91%, 60%)"
                        strokeWidth={3}
                        connectNulls={true}
                        dot={{ r: 4, fill: "hsl(217, 91%, 60%)" }}
                        activeDot={{ r: 6, strokeWidth: 0, fill: "hsl(217, 91%, 60%)" }}
                        isAnimationActive={true}
                    />
                </LineChart>
            </ChartContainer>
            ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                    <p>No quiz data available for this period</p>
                </div>
            )}
        </div>
      </Card>
    </div>
  );
}
