import { useAuth } from "@/lib/clerkAuth";
import { useEffect, useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Play, Loader2, Youtube, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { StudyMaterial } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getClerkToken } from "@/lib/queryClient";

interface YouTubeRecommendation {
  topic: string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  description: string;
}

export default function Resources() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [selectedMaterial, setSelectedMaterial] = useState<StudyMaterial | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [recommendations, setRecommendations] = useState<YouTubeRecommendation[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isComplete, setIsComplete] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  const { data: materials, isLoading } = useQuery<StudyMaterial[]>({
    queryKey: ["/api/study-materials"],
    enabled: isAuthenticated,
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const loadRecommendations = async (material: StudyMaterial, regenerate: boolean = false) => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Reset state
    setRecommendations([]);
    setIsLoadingRecommendations(true);
    setIsComplete(false);
    setStatusMessage("");

    try {
      const token = await getClerkToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      const url = `/api/resources/youtube-recommendations/${material.id}${regenerate ? '?regenerate=true' : ''}`;
      
      // Use fetch with streaming and abort signal
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to load recommendations");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Stream not available");
      }

      let buffer = '';

      while (true) {
        // Check if request was aborted
        if (abortController.signal.aborted) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Don't update state if request was aborted
              if (abortController.signal.aborted) {
                break;
              }
              
              if (data.type === 'status') {
                setStatusMessage(data.message);
              } else if (data.type === 'video') {
                setRecommendations(prev => {
                  // Avoid duplicates
                  if (prev.some(r => r.videoId === data.recommendation.videoId)) {
                    return prev;
                  }
                  return [...prev, data.recommendation];
                });
              } else if (data.type === 'complete') {
                setIsComplete(true);
                setIsLoadingRecommendations(false);
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error: any) {
      // Don't show error if request was aborted (user closed dialog)
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        console.log('Request cancelled by user');
        setIsLoadingRecommendations(false);
        return;
      }
      
      console.error('Error loading recommendations:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load recommendations",
        variant: "destructive",
      });
      setIsLoadingRecommendations(false);
    } finally {
      // Clear abort controller if this was the active request
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleMaterialClick = async (material: StudyMaterial) => {
    setSelectedMaterial(material);
    setIsDialogOpen(true);
    await loadRecommendations(material, false);
  };

  const handleRegenerate = async () => {
    if (selectedMaterial) {
      await loadRecommendations(selectedMaterial, true);
    }
  };

  const handleDialogClose = () => {
    // Cancel any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setIsDialogOpen(false);
    setRecommendations([]);
    setIsComplete(false);
    setStatusMessage("");
    setIsLoadingRecommendations(false);
  };

  const handleDownload = async (material: StudyMaterial) => {
    try {
      const response = await fetch(material.fileUrl);
      if (!response.ok) throw new Error("Failed to download file");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = material.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Download Started",
        description: `${material.title} is being downloaded`,
      });
    } catch (error: any) {
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download file",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
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
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
      <motion.div 
        className="mb-8 md:mb-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileText className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="font-heading font-bold text-2xl md:text-4xl">
              Resources
            </h1>
          </div>
        </div>
        <p className="text-muted-foreground text-sm md:text-base ml-14">
          View and download your uploaded PDFs, and discover YouTube lectures for each topic
        </p>
      </motion.div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-muted-foreground font-medium">Loading resources...</p>
        </div>
      ) : materials && materials.length > 0 ? (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {materials.length} {materials.length === 1 ? 'resource' : 'resources'} available
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            <AnimatePresence mode="popLayout">
              {materials.map((material, index) => (
                <motion.div
                  key={material.id}
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -20 }}
                  transition={{
                    duration: 0.3,
                    delay: index * 0.05,
                    ease: "easeOut"
                  }}
                  layout
                >
                  <Card
                    className="group p-5 md:p-6 hover-elevate transition-all duration-300 h-full flex flex-col border-2"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors flex-shrink-0">
                        <FileText className="h-6 w-6 md:h-7 md:w-7 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3
                          className="font-semibold text-base md:text-lg mb-1.5 truncate group-hover:text-primary transition-colors"
                          title={material.title}
                        >
                          {material.title}
                        </h3>
                        <div className="flex items-center gap-3 text-xs md:text-sm text-muted-foreground">
                          <span className="font-medium">{formatFileSize(material.fileSize)}</span>
                          <span>•</span>
                          <span>{new Date(material.uploadedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1"
                        onClick={() => handleMaterialClick(material)}
                      >
                        <Play className="h-4 w-4 mr-1.5" />
                        View Lectures
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(material)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="p-8 md:p-12 text-center border-2 border-dashed">
            <div className="p-4 rounded-full bg-muted inline-block mb-4">
              <FileText className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground" />
            </div>
            <h3 className="font-heading font-semibold text-lg md:text-xl mb-2">No Resources Yet</h3>
            <p className="text-muted-foreground text-sm md:text-base mb-6 max-w-md mx-auto">
              Upload PDFs from the Study Materials page to see them here with YouTube lecture recommendations
            </p>
          </Card>
        </motion.div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) handleDialogClose();
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Youtube className="h-5 w-5 text-red-500" />
                YouTube Lectures for: {selectedMaterial?.title}
              </DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={isLoadingRecommendations}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingRecommendations ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
            </div>
          </DialogHeader>
          
          {isLoadingRecommendations && recommendations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">
                {statusMessage || "Analyzing PDF and finding the best YouTube lectures..."}
              </p>
            </div>
          ) : (
            <>
              {statusMessage && !isComplete && (
                <div className="mb-4 p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">{statusMessage}</p>
                </div>
              )}
              {recommendations.length > 0 ? (
                <div className="space-y-6 mt-4">
                  <AnimatePresence>
                    {recommendations.map((rec, index) => (
                      <motion.div
                        key={rec.videoId}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: 0 }}
                      >
                        <Card className="p-4">
                          <div className="mb-3">
                            <h3 className="font-semibold text-lg mb-1">{rec.topic}</h3>
                            <p className="text-sm text-muted-foreground mb-2">
                              {rec.channelTitle}
                            </p>
                          </div>
                          <div className="aspect-video mb-3 rounded-lg overflow-hidden">
                            <iframe
                              width="100%"
                              height="100%"
                              src={`https://www.youtube.com/embed/${rec.videoId}`}
                              title={rec.title}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="w-full h-full"
                            />
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {rec.description}
                          </p>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {isLoadingRecommendations && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
                      <p className="text-sm text-muted-foreground">Finding more videos...</p>
                    </div>
                  )}
                </div>
              ) : isComplete ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    No recommendations found. Please try regenerating.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

