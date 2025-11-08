import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  FileText,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Flashcard, StudyMaterial } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function Flashcards() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [generateCount, setGenerateCount] = useState("10");

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

  const { data: flashcards, isLoading: flashcardsLoading } = useQuery<Flashcard[]>({
    queryKey: ["/api/flashcards", selectedMaterial],
    queryFn: async () => {
      const url = selectedMaterial 
        ? `/api/flashcards?materialId=${selectedMaterial}`
        : "/api/flashcards";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch flashcards");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMaterial) throw new Error("No material selected");
      return await apiRequest("POST", "/api/flashcards/generate", {
        materialId: selectedMaterial,
        count: parseInt(generateCount),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flashcards", selectedMaterial] });
      toast({
        title: "Success",
        description: "Flashcards generated successfully!",
      });
      setCurrentCardIndex(0);
      setIsFlipped(false);
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
        description: error.message || "Failed to generate flashcards",
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/flashcards", {
        materialId: selectedMaterial,
        question: newQuestion,
        answer: newAnswer,
        isAIGenerated: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flashcards", selectedMaterial] });
      toast({
        title: "Success",
        description: "Flashcard created successfully!",
      });
      setIsCreateDialogOpen(false);
      setNewQuestion("");
      setNewAnswer("");
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
        description: error.message || "Failed to create flashcard",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/flashcards/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flashcards", selectedMaterial] });
      toast({
        title: "Deleted",
        description: "Flashcard deleted successfully",
      });
      if (currentCardIndex >= (flashcards?.length || 0) - 1) {
        setCurrentCardIndex(Math.max(0, (flashcards?.length || 0) - 2));
      }
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
        description: error.message || "Failed to delete flashcard",
        variant: "destructive",
      });
    },
  });

  const handleFlip = () => setIsFlipped(!isFlipped);
  
  const handleNext = () => {
    if (flashcards && currentCardIndex < flashcards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setIsFlipped(false);
    }
  };
  
  const handlePrevious = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setIsFlipped(false);
    }
  };

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

  const handleCreate = () => {
    if (!newQuestion.trim() || !newAnswer.trim()) {
      toast({
        title: "Incomplete Flashcard",
        description: "Please fill in both question and answer",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate();
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

  const currentCard = flashcards?.[currentCardIndex];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <FileText className="h-8 w-8 text-primary" />
        <div className="flex-1">
          <h1 className="font-heading font-bold text-3xl md:text-4xl mb-2" data-testid="text-flashcards-title">
            Flashcards
          </h1>
          <p className="text-muted-foreground" data-testid="text-flashcards-subtitle">
            AI-generated or create your own flashcards for effective studying
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="md:col-span-2">
          <Label className="mb-2 block">Study Material</Label>
          <Select value={selectedMaterial || ""} onValueChange={(val) => setSelectedMaterial(val || null)}>
            <SelectTrigger data-testid="select-material">
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
        </div>
        <div>
          <Label className="mb-2 block">Number of Cards</Label>
          <Input
            type="number"
            min="5"
            max="20"
            value={generateCount}
            onChange={(e) => setGenerateCount(e.target.value)}
            data-testid="input-count"
          />
        </div>
      </div>

      <div className="flex gap-2 mb-8 flex-wrap">
        <Button
          onClick={handleGenerate}
          disabled={!selectedMaterial || generateMutation.isPending}
          data-testid="button-generate"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {generateMutation.isPending ? "Generating..." : "Generate with AI"}
        </Button>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="button-create">
              <Plus className="h-4 w-4 mr-2" />
              Create Manually
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Flashcard</DialogTitle>
              <DialogDescription>Add a new flashcard manually</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="question">Question</Label>
                <Textarea
                  id="question"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="Enter question..."
                  data-testid="input-question"
                />
              </div>
              <div>
                <Label htmlFor="answer">Answer</Label>
                <Textarea
                  id="answer"
                  value={newAnswer}
                  onChange={(e) => setNewAnswer(e.target.value)}
                  placeholder="Enter answer..."
                  data-testid="input-answer"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-save">
                {createMutation.isPending ? "Creating..." : "Create Flashcard"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {flashcardsLoading ? (
        <div className="text-center py-8">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading flashcards...</p>
        </div>
      ) : flashcards && flashcards.length > 0 ? (
        <div className="max-w-3xl mx-auto">
          <div className="mb-4 text-center">
            <p className="text-sm text-muted-foreground">
              Card {currentCardIndex + 1} of {flashcards.length}
            </p>
          </div>
          
          <Card 
            className="p-12 min-h-80 flex items-center justify-center cursor-pointer hover-elevate transition-all"
            onClick={handleFlip}
            data-testid={`card-flashcard-${currentCard?.id}`}
          >
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-4">
                {isFlipped ? "Answer" : "Question"}
              </p>
              <h2 className="font-heading font-semibold text-2xl md:text-3xl">
                {isFlipped ? currentCard?.answer : currentCard?.question}
              </h2>
              <p className="text-sm text-muted-foreground mt-6">
                Click to flip
              </p>
            </div>
          </Card>

          <div className="flex justify-between items-center mt-6">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentCardIndex === 0}
              data-testid="button-previous"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleFlip}
                data-testid="button-flip"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => currentCard && deleteMutation.mutate(currentCard.id)}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-current"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="outline"
              onClick={handleNext}
              disabled={currentCardIndex === flashcards.length - 1}
              data-testid="button-next"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      ) : (
        <Card className="p-12 text-center" data-testid="card-empty-state">
          <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-heading font-semibold text-lg mb-2">No Flashcards Yet</h3>
          <p className="text-muted-foreground mb-4">
            {selectedMaterial
              ? "Generate flashcards with AI or create them manually"
              : "Select a study material to get started"}
          </p>
        </Card>
      )}
    </div>
  );
}
