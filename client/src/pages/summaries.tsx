import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, FileText, Loader2, Volume2, VolumeX, FileStack, Play, Pause, RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Summary, StudyMaterial } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Slider } from "@/components/ui/slider";

// Custom Audio Player Component
function CustomAudioPlayer({ audioUrl }: { audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const handleRestart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-6"
    >
      <Card className="p-6 border-2 bg-gradient-to-br from-primary/5 to-primary/10" data-testid="audio-player-container">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10">
            <Volume2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Listen to Summary</p>
            <p className="text-xs text-muted-foreground">AI-powered audio narration</p>
          </div>
        </div>

        <audio ref={audioRef} src={audioUrl} preload="metadata" />

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground min-w-[45px]">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="flex-1"
              data-testid="audio-slider"
            />
            <span className="text-xs font-medium text-muted-foreground min-w-[45px]">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2">
            <Button
              size="icon"
              variant="outline"
              onClick={handleRestart}
              className="h-9 w-9"
              data-testid="button-restart"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              onClick={togglePlay}
              className="h-12 w-12"
              data-testid="button-play-pause"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={toggleMute}
              className="h-9 w-9"
              data-testid="button-mute"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function Summaries() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
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
  }, [isAuthenticated, authLoading, toast]);

  const { data: materials } = useQuery<StudyMaterial[]>({
    queryKey: ["/api/study-materials"],
    enabled: isAuthenticated,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<Summary | null>({
    queryKey: ["/api/summaries", selectedMaterial],
    queryFn: async () => {
      if (!selectedMaterial) return null;
      const response = await fetch(`/api/summaries?materialId=${selectedMaterial}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch summary");
      return response.json();
    },
    enabled: isAuthenticated && !!selectedMaterial,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMaterial) throw new Error("No material selected");
      return await apiRequest("POST", "/api/summaries/generate", {
        materialId: selectedMaterial,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/summaries", selectedMaterial] });
      toast({
        title: "Success",
        description: "Summary generated successfully!",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Error",
        description: error.message || "Failed to generate summary",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!selectedMaterial) {
      toast({
        title: "No Material Selected",
        description: "Please select a study material first",
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate();
  };

  if (authLoading) {
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

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 md:mb-8"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 backdrop-blur-sm">
            <FileStack className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="font-heading font-bold text-2xl md:text-3xl" data-testid="text-summaries-title">
              AI Summaries
            </h1>
            <p className="text-muted-foreground text-sm md:text-base" data-testid="text-summaries-subtitle">
              Get comprehensive AI-generated summaries of your study materials
            </p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-6"
        >
          <Label className="mb-2 block text-sm font-medium">Study Material</Label>
          <Select value={selectedMaterial || ""} onValueChange={(val) => setSelectedMaterial(val || null)}>
            <SelectTrigger data-testid="select-material" className="border-2">
              <SelectValue placeholder="Select study material" />
            </SelectTrigger>
            <SelectContent>
              {materials?.map((material) => (
                <SelectItem key={material.id} value={material.id} data-testid={`option-material-${material.id}`}>
                  {material.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>

        <AnimatePresence>
          {selectedMaterial && !summary && !summaryLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="mb-6"
            >
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
                data-testid="button-generate"
                className="w-full sm:w-auto shadow-sm"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {generateMutation.isPending ? "Generating..." : "Generate Summary"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence mode="wait">
        {summaryLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="p-8 md:p-12 text-center border-2">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="h-12 w-12 mx-auto mb-4 text-primary" />
              </motion.div>
              <p className="text-muted-foreground font-medium">Loading summary...</p>
            </Card>
          </motion.div>
        ) : generateMutation.isPending ? (
          <motion.div
            key="generating"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="p-8 md:p-12 text-center border-2 bg-gradient-to-br from-primary/5 to-primary/10">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="h-12 w-12 mx-auto mb-4 text-primary" />
              </motion.div>
              <p className="text-muted-foreground font-medium mb-2">Generating summary with AI...</p>
              <p className="text-xs text-muted-foreground">This may take a moment</p>
            </Card>
          </motion.div>
        ) : summary ? (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <Card className="p-6 md:p-8 border-2 shadow-lg" data-testid="card-summary">
              {summary.audioUrl && <CustomAudioPlayer audioUrl={summary.audioUrl} />}
              
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="prose prose-sm md:prose max-w-none dark:prose-invert"
              >
                <div className="whitespace-pre-wrap leading-relaxed">{summary.content}</div>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="mt-6 pt-6 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                  <p className="text-xs text-muted-foreground">
                    Generated on {new Date(summary.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  onClick={handleGenerate}
                  variant="outline"
                  disabled={generateMutation.isPending}
                  data-testid="button-regenerate"
                  className="w-full sm:w-auto shadow-sm"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Regenerate Summary
                </Button>
              </motion.div>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.5 }}
          >
            <Card className="p-8 md:p-12 text-center border-2 border-dashed max-w-2xl mx-auto" data-testid="card-empty-state">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="inline-block p-4 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 mb-4"
              >
                <FileText className="h-12 w-12 md:h-16 md:w-16 text-primary" />
              </motion.div>
              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="font-heading font-semibold text-lg md:text-xl mb-2"
              >
                No Summary Yet
              </motion.h3>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-muted-foreground mb-4 text-sm md:text-base"
              >
                {selectedMaterial
                  ? "Generate a comprehensive AI summary to get started"
                  : "Select a study material above to create a summary"}
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-center gap-1 justify-center text-xs text-muted-foreground"
              >
                <div className="h-2 w-2 bg-primary rounded-full animate-pulse"></div>
                <span>Powered by AI</span>
              </motion.div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
