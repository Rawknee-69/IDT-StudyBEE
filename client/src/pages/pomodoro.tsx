import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, RotateCcw, Settings, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type PomodoroSession = {
  id: string;
  userId: string;
  workDuration: number;
  breakDuration: number;
  completedCycles: number;
  createdAt: string;
};

type TimerState = "idle" | "work" | "break";

export default function Pomodoro() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  const [workDuration, setWorkDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [timeLeft, setTimeLeft] = useState(workDuration * 60);
  const [completedCycles, setCompletedCycles] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const notificationPermissionRef = useRef<NotificationPermission | null>(null);

  const { data: sessions } = useQuery<PomodoroSession[]>({
    queryKey: ["/api/pomodoro-sessions"],
    enabled: isAuthenticated,
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: { workDuration: number; breakDuration: number; completedCycles: number }) => {
      return await apiRequest("POST", "/api/pomodoro-sessions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pomodoro-sessions"] });
      toast({
        title: "Session Saved",
        description: `Completed ${completedCycles} cycle${completedCycles !== 1 ? 's' : ''}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission().then((permission) => {
        notificationPermissionRef.current = permission;
      });
    }
  }, []);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning, timerState]);

  const showNotification = (title: string, body: string) => {
    if (notificationPermissionRef.current === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    }
  };

  const handleTimerComplete = () => {
    setIsRunning(false);
    
    if (timerState === "work") {
      const newCycles = completedCycles + 1;
      setCompletedCycles(newCycles);
      
      createSessionMutation.mutate({
        workDuration,
        breakDuration,
        completedCycles: 1,
      });
      
      setTimerState("break");
      setTimeLeft(breakDuration * 60);
      showNotification("Work Session Complete!", "Great job! Time for a break.");
      toast({
        title: "Work Session Complete!",
        description: "Time for a break",
      });
    } else if (timerState === "break") {
      setTimerState("work");
      setTimeLeft(workDuration * 60);
      showNotification("Break Complete!", "Ready to focus again?");
      toast({
        title: "Break Complete!",
        description: "Ready for another work session?",
      });
    }
  };

  const handleStart = () => {
    if (timerState === "idle") {
      setTimerState("work");
      setTimeLeft(workDuration * 60);
    }
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimerState("idle");
    setTimeLeft(workDuration * 60);
    setCompletedCycles(0);
  };

  const handleSettingsSave = (newWork: number, newBreak: number) => {
    setWorkDuration(newWork);
    setBreakDuration(newBreak);
    
    if (timerState === "idle" || !isRunning) {
      setTimeLeft(newWork * 60);
    }
    
    setSettingsOpen(false);
    toast({
      title: "Settings Updated",
      description: `Work: ${newWork}min, Break: ${newBreak}min`,
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const totalStudyTime = sessions?.reduce((total, session) => {
    return total + (session.workDuration * session.completedCycles);
  }, 0) || 0;

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8 flex items-center gap-3">
        <Clock className="h-8 w-8 text-primary" />
        <div className="flex-1">
          <h1 className="text-4xl font-heading font-bold mb-2" data-testid="text-page-title">
            Pomodoro Timer
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Stay focused with the Pomodoro Technique. Work in focused intervals with regular breaks.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted mb-4">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium" data-testid="text-timer-state">
                  {timerState === "idle" && "Ready to Start"}
                  {timerState === "work" && "Focus Time"}
                  {timerState === "break" && "Break Time"}
                </span>
              </div>
              
              <div className="text-8xl font-bold font-mono mb-8" data-testid="text-timer-display">
                {formatTime(timeLeft)}
              </div>

              <div className="flex justify-center gap-4">
                {!isRunning ? (
                  <Button
                    size="lg"
                    onClick={handleStart}
                    data-testid="button-start"
                  >
                    <Play className="h-5 w-5 mr-2" />
                    Start
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    onClick={handlePause}
                    variant="secondary"
                    data-testid="button-pause"
                  >
                    <Pause className="h-5 w-5 mr-2" />
                    Pause
                  </Button>
                )}
                
                <Button
                  size="lg"
                  onClick={handleReset}
                  variant="outline"
                  data-testid="button-reset"
                >
                  <RotateCcw className="h-5 w-5 mr-2" />
                  Reset
                </Button>

                <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <DialogTrigger asChild>
                    <Button
                      size="lg"
                      variant="ghost"
                      data-testid="button-settings"
                    >
                      <Settings className="h-5 w-5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Timer Settings</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="work-duration">Work Duration (minutes)</Label>
                        <Input
                          id="work-duration"
                          type="number"
                          min="1"
                          max="60"
                          defaultValue={workDuration}
                          data-testid="input-work-duration"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="break-duration">Break Duration (minutes)</Label>
                        <Input
                          id="break-duration"
                          type="number"
                          min="1"
                          max="30"
                          defaultValue={breakDuration}
                          data-testid="input-break-duration"
                        />
                      </div>
                      <Button
                        onClick={() => {
                          const workInput = document.getElementById("work-duration") as HTMLInputElement;
                          const breakInput = document.getElementById("break-duration") as HTMLInputElement;
                          handleSettingsSave(
                            parseInt(workInput.value),
                            parseInt(breakInput.value)
                          );
                        }}
                        className="w-full"
                        data-testid="button-save-settings"
                      >
                        Save Settings
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="border-t pt-6">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Completed Cycles Today</span>
                <span className="font-bold text-2xl" data-testid="text-completed-cycles">
                  {completedCycles}
                </span>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Session Stats</h3>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Total Study Time</div>
                <div className="text-2xl font-bold" data-testid="text-total-study-time">
                  {Math.floor(totalStudyTime / 60)}h {totalStudyTime % 60}m
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Total Sessions</div>
                <div className="text-2xl font-bold" data-testid="text-total-sessions">
                  {sessions?.length || 0}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-3">How it Works</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Set your work and break durations</li>
              <li>Focus during work intervals</li>
              <li>Take breaks between cycles</li>
              <li>Track your productivity over time</li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
